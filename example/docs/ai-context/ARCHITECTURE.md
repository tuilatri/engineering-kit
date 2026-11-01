# ARCHITECTURE.md

Line counts and figures: commit `0f1b372` + #4 (14/10). The **non-empty line**
convention is documented (`MODULE_MAP.md` explains it at the top). Re-check the
file if you are editing near that area.

## 1. Layers

Three apps, running in three separate terminals. No monorepo tooling, no shared
package — they only talk over HTTP.

```
  BROWSER (Next.js 16)              PHONE (Expo SDK 54)
  localhost:3000                    qua Wi-Fi LAN
        |                                 |
        | REST + HttpOnly JWT cookie       | multipart + 6-digit PIN
        | (không JWT — chỉ PIN)           | không có JWT
        +----------------+----------------+
                         v
        +--------------------------------+
        |  FastAPI  uvicorn :<PORT>      |  bind 0.0.0.0 (để điện thoại
        |  10 routers dưới /api         |  LAN vào được)
        |  + 1 WebSocket /ws/intake/{id} |
        +--------------------------------+
             |                    |
   Prisma    |                    |  filesystem
   Client    v                    v
     +----------------+   +--------------------------+
     | PostgreSQL     |   | storage/raw/{category}/  |  bản gốc PNG/JPG
     | 7 models       |   | storage/web/{category}/  |  WebP ≤1400px q85
     | prod + _Test   |   | storage/web/thumbnails/ |  WebP 300x420 q80
     +----------------+   | storage/backups/*.gz    |  30 bản xoay vòng
                          +--------------------------+
```

Three layers in the backend: `api/` (routing + auth dep) → `services/` (business
logic) → `core/` (config, Prisma lifecycle, Argon2id/JWT, SlowAPI).
Pydantic schemas live in `schemas/`.

## 2. Request flow (canonical write path)

Every data write goes through the same shape:

```
form / modal (frontend/src/components/*)
  └─ apiFetch(endpoint, {method:'PUT', body:JSON})      lib/api.ts
       │   credentials:'include'  → HttpOnly cookie
       ▼
  router handler                                    backend/app/api/*.py
       │   Depends(get_current_user) → decode JWT → prisma.user.find_unique
       ▼
  service method                                    backend/app/services/*.py
       │   đổi "none" → None cho FK, set sortOrder, …
       ▼
  prisma.<model>.<op>()
       ▼
  create_snapshot(trigger_action, table, id)        backup_service.py
       └─ dump 4 key / 5 bảng → JSON → gzip (cả render trong to_thread) → storage/backups/
          → ghi DatabaseBackupLog → cắt còn 30 bản mới nhất
```

**The filename must be unique — absolutely** (`backup_service.py:52-64`):
`auto_backup_%Y%m%d_%H%M%S_%f_<action>_<table>.json.gz`, and if that name already
exists, append the suffix `_1`, `_2`… until it is free.

Two layers because `%f` (millisecond) **only lowers the probability**, it doesn't
eliminate it — two writes can still land in the same millisecond. The
`while (…).exists()` loop is what actually guarantees it. Before #2 there was only
`%S` (1 second) and **no** loop: 5 consecutive writes measured → **3 overwrites**,
4 log rows pointing at the same file.

A knock-on consequence was fixed along the way: `_enforce_rolling_retention` only
unlinks a file when **no** log in the top-30 still points at that name. Previously,
when an old log fell out of the top-30 it would unlink the file while a newer log
still used it → **a backup still inside the retention window became unrestorable**.
This fix also protects duplicate-name logs that already existed before #2.

### Errors must not be swallowed (14/10)

`_enforce_rolling_retention` sits in a **`finally`**, not in the `try`.
Before #3 it was in the `try` — **one** failure was enough to disable retention
forever, with the backup folder growing unbounded and nobody the wiser.

When a snapshot fails, `create_snapshot` writes a `status="FAILED"` log line
(`_record_failure`) and returns `""` — it does **not** raise, because
**23/24 call sites ignore the return value**: raising would turn a backup failure
into a data-write failure. Only `POST /backups/create-manual` (`api/backups.py:48-50`) checks
it and returns HTTP 500.

The two log groups have **separate** retention budgets:
`MAX_ROLLING_BACKUPS = 30` for `SUCCESS`, `MAX_FAILED_LOGS = 10` for `FAILED`.
With one shared window, when the app fails continuously the retention would
**delete `SUCCESS` backups to make room for `FAILED` rows that have no file to restore from**.

### Reorder must be atomic (14/10)

`reorder_books` (`book_service.py`) and `reorder_accessories`
(`accessory_service.py`) used to run **N sequential `update` commands**, with the
snapshot placed **after** the loop. Before #4 each command was its own transaction ⇒ a mid-way
failure left the first items with `sortOrder` changed, later items unchanged, and
**no snapshot at all**. The display order silently drifted, with no log, no notification.

Both are now wrapped in `async with prisma.tx(timeout=REORDER_TX_TIMEOUT)` — the same
pattern as `restore_from_snapshot`. The timeout is explicitly **30 s** (the Prisma
default is 5 s): measured on the largest real series with **30 books** ⇒ ~30 updates ≈ 90 ms, but
`ReorderRequest.items` is an **unbounded** `List`, so a wider-than-default margin is needed.

**The snapshot is deliberately OUTSIDE the transaction** — it dumps the whole database (~0,13 s after P1-1); keeping
the transaction open for that extra time would only widen the lock window. The accepted
consequence: if the transaction succeeds but the snapshot fails, the reorder **still
succeeds**, exactly as #3 settled — a backup failure must not become a data-write failure.

⚠️ **`impact()` needs `file_path` + `kind` for `reorder_books`.** `api/series.py`
has a function with the same name, so `impact({target: "reorder_books"})` returns
`risk: UNKNOWN, impacted: 0` — wrong. Specify
`file_path: "backend/app/services/book_service.py", kind: "Method"` to get the
right answer (`LOW`, 2 callers).

### Images are not in the backup (15/10, P1-9)

The `.gz` only contains **DB bytes**. Images are entirely outside the backup ⇒ **losing
images is real data loss**, and the backup cannot restore them.

The system already had `OrphanImageService` for the *file nobody uses* direction, but
**before P1-9 there was nothing** for the reverse direction. `MissingImageService.scan()`
added that direction: scan `book`/`accessory`/`series`, return records whose
`rawImagePath`/`webImagePath` no longer exist on disk. As of **P3-27**, both
services also scan `BookmarkWork` (in the second database, Bookmark Collection,
with `cover_image_path`), synchronizing orphan cleanup and missing-image sweeps across both databases.

Measured on real data: **5.116 paths, ~76 ms** ⇒ run it inside `asyncio.to_thread`
so it doesn't block the event loop (the same pattern `image_service` uses for Pillow). The
`GET /media/missing-images` endpoint is **pure read** — no writes, no deletes, **no**
`create_snapshot` call (that would create a write loop).

Important: a record that **never had** `rawImagePath`/`webImagePath` is **not**
broken — a dedicated test pins this down to avoid false alarms.

Measured 15/10: **6 books** lost both copies. Recovery means re-uploading the original images.

### Heavy I/O must not run on the event loop (15/10, P1-11)

`StorageQuotaService.check_headroom()` walks the **entire** `raw/` + `web/` tree
(`rglob("*")` + `stat()` per file) whenever the `STORAGE_QUOTA_RESYNC_SECONDS`
(300 s) cache expires. Measured 15/10: **74 ms** on `storage_test` (4.427 files) and **127 ms**
on production storage (7.341 files / 297 MB). Before P1-11 this scan ran
**on the event loop** ⇒ freezing every other request, with **no ceiling** on a slow
disk (cold page cache, Defender, Search indexer).

It was also why `test_upload_does_not_block_the_event_loop` drifted: the
`reset_storage_quota_cache` fixture resets the cache before **every** test, so any
test with an upload triggered one scan. The test **told the truth** — the loop really was blocked.

Rule: **every async path must call `check_headroom` via
`asyncio.to_thread`** (`image_service.py:50`, `intake.py:281`). The function keeps its
`sync` signature because `save_image_from_bytes` already calls it from inside a thread
(`legacy_import_service`). Attribution inside `process_and_save_image` (6 images, cold
cache): the scan accounted for **73,2 ms / 84,4 ms of total loop blocking (87%)**.
After the fix, re-measured: **0,9 ms / 1.098 ms = 0,1%**.

The **structural** tests (`threading.get_ident()`) pin this invariant instead of timing
— timing drifts per machine; the measured range was **77,7–111,1%** (n=20), so the
heartbeat test's `0,5` threshold was only **1,55×** away from the observed value.

✅ **Cleanup completed on 16/10** (the remainder of P1-11): `api/media.py` wraps
`get_storage_stats()` + `get_quota_report()` in 1 `to_thread`;
`orphan_image_service.scan` extracts `_walk_orphans`, `cleanup` extracts
`_delete_confirmed_files` (including `resync()`) running in `to_thread`; `mkdir` + raw
write in `process_and_save_image` also moved to `to_thread`. Re-measured via the real
endpoints (bench on `storage_test`, 1 warm-up + 3 runs, median `gap_max` of the loop):

| Bench case | Before | After |
|---|---:|---:|
| `GET /media/storage-stats` (cold quota cache) | 469 ms | 7 ms |
| `GET /media/storage-stats` (warm cache) | 306 ms | 7 ms |
| `GET /media/orphan-images` | 422 ms | 66 ms\* |
| `POST /media/orphan-images/cleanup` (50 paths) | 152 ms | 7 ms |
| `POST /media/orphan-images/cleanup` (500 paths) | 209 ms | 7 ms |
| `POST /media/upload` (small image) | 6,1 ms | 6,7 ms |

\*the walk has left the loop; the remaining 66 ms is **JSON serialization** of ~6k orphans — the test
DB is empty so every file in `storage_test` is an orphan; production has far fewer.
`POST /media/upload` barely changed: this case is dominated by
`_validate_image_file` + response, while mkdir + raw write (~1,7 ms) is lost in the
noise of the 5 ms ticker. `_validate_image_file` alone is **deliberately** kept on the loop: the
15 MB cap already bounds it (≤ ~5 ms) and it must reject *before* writing.
All four seams above have their own structural tests right in their files — see
`TESTING_GUIDE.md` §1.

**The single most expensive operation in the repo**: the final step. Editing a single
book still dumps the whole database. After P1-1 (16/10) re-measured: **~0,13 s / ~179 KB** per
write, and the event loop **no longer freezes** during the dump — only short GIL-induced
jitters remain (details just below).
The two endpoints `POST /books/batch` and `POST /accessories/batch` are exceptions —
they call `create_book_without_backup` and snapshot **once for the whole batch**,
and `test_intake_batch.py` pins that down.
Likewise, the bulk operations on Bookmarks (P3-34) `PATCH /bookmarks/batch` (`BATCH_UPDATE_WORK`) and `DELETE /bookmarks/batch` (`BATCH_DELETE_WORK`) also strictly follow the 1-snapshot rule: they update/delete the entire selected list of works with Prisma `update_many`/`delete_many`, then produce exactly **1 GZIP snapshot** at the end for the whole batch, verified in `test_bookmarks.py`.

### Snapshot render runs off-loop (16/10, P1-1)

`.dict()` of 4 tables + `json.dumps` + gzip + `stat()` used to run inline in
`create_snapshot` — pure CPU+IO, so it froze the event loop on **every** write.
Now the whole block runs inside
`asyncio.to_thread(BackupService._write_snapshot_file, …)`; the payload is **unchanged** —
compared byte-for-byte after masking `timestamp`, at both seed levels.
Measured (1 warm-up + 3 runs, deterministic seed, median):

- **S1** (132 series / 989 books): loop blocked **97–101 ms → 19–23 ms**; wall
  **0,163 s → 0,131 s**; file **172.167 → 179.161 bytes**.
- **S2** (×10 — 1.320 series / 9.890 books): loop blocked
  **1,10–1,12 s → 0,22–0,27 s**; wall **1,681 s → 1,384 s**.

`gzip` level lowered **9 → 6** (`SNAPSHOT_GZIP_COMPRESSLEVEL = 6`): on S1
61 ms → 21 ms, traded for **+4%** size. Level 1 (+33% size) was rejected
**with measurements**. The remaining ceiling is the GIL during serialization: the S2 payload of 18,9 MB still holds
the GIL so the loop jitters ~0,23–0,27 s — already ~4× better than 1,1 s, and there is no
cheaper way without changing the serialization approach.

The structural test `test_snapshot_render_runs_off_the_event_loop`
(`threading.get_ident()`, the exact P1-11 pattern) pins this invariant — timing
drifts per machine, identity does not.

**`users` is NOT in the snapshot** (`version: "1.1"`). Before 14/10 the payload had
5 keys — `users` was a dead key: `_clear_tables` doesn't delete it, `_insert_payload`
doesn't insert it, so each `.gz` file just carried the admin's Argon2id `passwordHash`
around with nobody reading it. The `users` table re-creates itself: `seed_initial_admin()` (`core/database.py:31`)
runs at boot and creates the admin from `INITIAL_ADMIN_*` when the table is empty. The only
consequence: after changing the password via `/auth/change-password`, if the `users` table is lost the
password can be recovered from `.env`. Old backup files (`version "1.0"`) still have the
`users` key and still restore — `_restore_data_payload` ignores unknown keys.

**Restore returns a named outcome, not a `bool`** (#5, 15/10). `restore_from_snapshot()`
returns one of `RESTORE_OK` / `_LOG_NOT_FOUND` / `_FILE_MISSING` / `_FILE_CORRUPT` /
`_ROLLED_BACK`, and `api/backups.py` maps each value to an (HTTP code, Vietnamese message) pair.
Previously all four failure branches shared **one message** *"Toàn bộ thay đổi đã được hoàn
tác"* — correct for the transaction branch, **wrong** for the other three since they stop before
writing a single byte. Three accompanying details:

- `gzip`/`json` are wrapped → a corrupt file is **422 + log**, no more raw 500. Measured on 5 real files
  with 40 bytes modified in the middle: **4 × `zlib.error`, 1 × `gzip.BadGzipFile`** — so the tuple
  **must** include `zlib.error`; it is not a subclass of `OSError`.
- A file **missing the `data` key** is rejected instead of falling back to an `{}` payload — that branch used to
  **wipe all 5 tables and then report "restore successful"**. Measured 15/10: 26/26 real backup files
  have `data` as a dict, so no file was affected; this closed a latent hole.
- A `log_id` with a malformed UUID is blocked **before** calling prisma: `find_unique` throws
  `DataError` (P2023) — measured with a probe, not assumed.

The intake flow (phone images → PC) is a parallel path that doesn't go through forms:

```
PC:  POST /intake/sessions ─→ PIN 6 số + qr_payload {u,s,p,ips,maxb}
     WebSocket ws://…/api/intake/ws/{id}        ← giữ mở
Phone: quét QR → Promise.any trên MỌI ip trong `ips`  (đua, không tuần tự)
     GET /intake/sessions/{id}  + X-Intake-Pin   ← lần này ghim paired_client_ip
     POST /intake/upload (chunk 20 ảnh/lần)     + X-Intake-Pin
          └─ storage: validate → enforce_client_ip → check_headroom(TỔNG batch)
                      → Pillow to_thread → WS broadcast IMAGE_UPLOADED
PC:  nhận WS frame → chọn ảnh → điền metadata
     POST /books/batch + POST /accessories/batch   (2 request, không phải N)
```

`max_files_per_batch` is **server-advertised** (`maxb` in the QR, the
`max_files_per_batch` column in the response) — mobile does not hardcode 20. This contract
is annotated `P1-7` on both ends.

Mobile **survives app kill** (`P1-8`): `IntakeContext` hydrates the session + images from
`AsyncStorage` (key `book-intake-state-v1`; the 6-digit PIN sits inside the `session` object,
only in the app sandbox — web uses localStorage) then **re-validates the session with the
server before entering the camera**; a dead session / past the 15' TTL → drop the session but
**keep the images**, the pairing screen shows a "N ảnh chưa gửi" banner + the reason. Images are stored metadata-only (the original file
stays in the app's cache dir, not copied). No automatic retry — re-pairing with a new PIN
is the only way to continue.

**PC URL normalization (P3-10, 21/10) — `mobile/src/services/intakeUrl.ts`:**
`normalizeIntakeBaseUrl()` is a **pure function** (string ops only) shared by
`pairIntakeByPin` **and** `validateIntakeSession` — previously the 2 functions handled URLs differently
(the latter did **not** append the port ⇒ a latent bug). ⚠️ **Deliberately NOT using `new URL()`**: Hermes
(RN 0.81) has a **partial** `URL` (the `port` setter is unreliable) ⇒ the function is written in plain JS
to behave **identically** between Node (verify) and Hermes (runtime), and to be **testable** while
mobile has no test framework. Rules: strip the trailing `/` → prepend `http://` if missing →
split authority/path → split host/port (IPv6 `[...]` handled separately) → empty port falls back to the **default
port** (`API_PORT` in `mobile/src/config.ts` — matches the backend's `settings.PORT`) →
meaningless input (unbracketed IPv6, empty port) ⇒ **reject**
(return `''` ⇒ the "Địa chỉ máy tính không hợp lệ" message). The function is **idempotent**. Measured 21/10 on
the old logic: **5/12 broken inputs** (port attached **after** the path, IPv6 without port, …) — but it only
surfaces when the user **types the IP manually** (`mobile/app/index.tsx:97`); the QR flow always carries a port because
the backend builds `lan_url = f"http://{ip}:{port}"`. Verify: `scripts/verify-mobile-url.mjs`
(compiles the 1 TS file with the bundled `typescript` then asserts 12 cases; `--legacy` runs
the old logic ⇒ **FAIL 5/12** ⇒ proving the gate catches real bugs).

**The backend port — 1 source of truth (P3-9, 21/10):** previously the `8000` string sat in
**13 places / 8 files** spread across all 3 apps (8 code spots + 5 UI text spots) ⇒ changing the port
meant hand-editing 13 places across 3 different apps, easy to miss one. Now:
- **Backend = source of truth**: `Settings.PORT` (`backend/app/core/config.py`, reads
  `PORT` from `.env`, default 8000) ⇒ `main.py` binds accordingly; `api/intake.py` puts
  `settings.PORT` into the session ⇒ **`lan_url` carries the real port** ⇒ **the phone
  doesn't have to guess the port** when scanning the QR. `intake_service.create_session(port=None)` ⇒
  `port or settings.PORT` (keeps old call sites compatible).
- **Frontend**: `frontend/src/lib/config.ts` (new) — `API_PORT`
  (`NEXT_PUBLIC_API_PORT`), `API_BASE_URL`, `STORAGE_BASE_URL`. `lib/intake.ts` takes
  the WebSocket port from there (the host is still `window.location.hostname`).
- **Mobile**: `mobile/src/config.ts` (new) — `API_PORT` (`EXPO_PUBLIC_API_PORT`) +
  `DEFAULT_SERVER_URL` (`EXPO_PUBLIC_SERVER_URL`, default **empty** because the LAN IP changes
  per network) ⇒ `intakeUrl.ts` takes `DEFAULT_INTAKE_PORT` from there.

⚠️ **The 3 apps cannot be collapsed into 1 file**: the backend reads `.env` **at runtime**, while
`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` are **baked in at build time** ⇒ changing them after the build has
no effect (a rebuild is required). Changing the **backend** port only requires editing `.env`.
⚠️ If you run `uvicorn app.main:app --port X` (not `python -m app.main`) you
**must** set `PORT=X` in `.env`, otherwise the QR advertises the wrong port.
**Regression gate**: `scripts/verify-no-hardcoded-port.mjs` — the literal `8000` is only
allowed in the 3 config files; `--self-test` is the gate's own mutation test.


**WebSocket of the intake flow — robustness (P3-14, 22/10) — `frontend/src/lib/intakeWs.ts`:**
previously the WS logic was inline in `MobileIntakeDialog.tsx` with 5 bugs confirmed by
code reading: the heartbeat sent `{type:'ping'}` while the backend checked for `"PING"` (`api/intake.py:357`) ⇒
**never matched**; **no** `ws.onerror` (network errors only hit the console, the UI showed nothing);
**no** reconnect ⇒ a dropped WS left the real-time gallery unrecovered; `CONNECTED` was ignored;
the `CLIENT_CONNECTED` branch was **dead code**; `pingInterval` orphaned when a new socket opened.

Now the WS client is extracted into a **pure TS, React-free module** (`lib/intakeWs.ts`, 355 lines) and
the component only handles state. Mechanisms:
- **Contract-matching heartbeat**: send `{"type":"PING"}` (uppercase) ⇒ the backend replies `{"type":"PONG"}`.
- **Watchdog**: more than **45s** (3× the 15s ping cycle) without a PONG ⇒ treat as dead ⇒ close + reconnect
  (catches the silently-dead TCP case — no FIN ⇒ `onclose` never fires).
- **Reconnect + backoff**: `min(base×2^n, max)` = 1s → 2s → 4s → 8s → 15s, at most **5** attempts ⇒
  after exhausting them, report **exactly once** (no toast spam) then stop.
- **`close.code = 1008`** (`WS_1008_POLICY_VIOLATION` — the backend closes when the session is dead) ⇒
  **no** reconnect (retrying a dead session is pointless) ⇒ report "create a new session".
- **Gallery hydration**: on every WS connect ⇒ call `GET /api/intake/sessions/{id}` ⇒ **merge by id**
  into the gallery (the server kept images uploaded while the WS was down: `api/intake.py:310` `add_uploaded_images` ⇒
  `intake_service.py:340` `extend` ⇒ images are **not** lost, the PC just didn't see them). Merging by id (not
  "replace", not "append") ⇒ **no duplicates** and **no loss** of images arriving via WS while hydration
  is in flight. ⚠️ this endpoint has a
  **rate limit of 5/min** ⇒ **DO NOT poll**, call it once per connection; a 429 ⇒ **silently ignore**.
  ⚠️ `currentImagesCount` of the `CONNECTED` event is **always 0** for a new session (`startNewSession` creates
  a NEW session) ⇒ its **real meaning** lies in *reconnect + hydrate*, not in that event.

**Verify:** `scripts/verify-intake-ws.mjs` — compiles **1 file** using the `typescript` bundled in
`frontend/node_modules` then asserts **24 cases** in Node with a **virtual clock** (injected timers ⇒
**not flaky** on CI) + a fake WebSocket. The module is **self-contained** (no imports) because importing
`@/lib/intake` would drag in the `@/types` alias that a standalone `tsc` can't resolve.
The gate's own mutation test: 4 variants (`"PING"`→`"ping"`, drop `clearTimers()`, drop the 1008 branch,
drop the hydrate ordering flip) ⇒ **4/4 caught**.

**16 rules + 1 `status` rule:** see the header of `lib/intakeWs.ts` (R1–R17).

**The backend side of the same flow (P3-15, 22/10):** `api/intake.py` `intake_websocket_endpoint`
`:331` — `connect` + `send_json(CONNECTED)` **inside** `try`, `finally: disconnect` ⇒ every exit
path cleans up the socket (previously `send_json` was outside the `try` ⇒ an error left the dead socket
in `_connections` ⇒ `connected_clients` counted wrong). The heartbeat is **case-insensitive**
(`_is_heartbeat`) ⇒ a client sending `"ping"` still gets a PONG.

**`lib/intakeWs.ts` must stay self-contained** ⇒ `SocketLike` is a minimal structural type; the DOM
`WebSocket` is wrapped via an adapter (`createDomSocket`) because the DOM handler type (`(ev: Event) => any`)
is not assignable to `() => void` ⇒ a type error.

**Image format in the intake flow (P2-10, 21/10) — UI copy must describe it correctly:**
the phone captures **JPEG** (`mobile/app/camera.tsx:67` `quality: 0.9`) → mobile compresses to
**JPEG 0.82** (`mobile/src/services/imageOptimizer.ts:26-33` `compress: 0.82`,
`format: SaveFormat.JPEG`) → upload → only then does the **server** convert to WebP
(`api/intake.py:292` → `ImageService.process_and_save_image`). ⇒ **On the camera it is
JPEG, not WebP**; and the server-side WebP is **lossy q85**, **not**
lossless (`image_service.py:124` `save(..., "WEBP", quality=85, method=6)` — no
`lossless=True`). The **archival** copy is the **original image** in `raw/`; the WebP is the
**fast-loading optimized** copy. This copy mismatch existed in 2 UI places and was fixed in P2-10
(`MobileIntakeDialog.tsx` + `mobile/app/review.tsx`); see `FRONTEND_MAP.md` §6.

### Metric `completion_rate_percent` — the denominator is the largest volume **currently present** (P2-5, 21/10)

`SeriesSummaryItem.completion_rate_percent` (already existed) and
`SeriesDetailResponse.completion_rate_percent` (added in P2-5) share 1 formula,
computed in `series_service.py::_completion_rate`:

```
int_vols         = { tập nguyên > 0 đang có }        # _integer_volumes()
max_volume_number = max(int_vols)                     # _max_volume()
completion_rate_percent = round(len(int_vols) / max(int_vols) * 100, 1)
```

🔴 **Mandatory invariant: numerator and denominator must come from the SAME set** (`int_vols`).
If the numerator counts *every* volume while the denominator only takes integer volumes, the rate goes
**> 100%** — this bug was hit once (21/10): fractional volumes like `5.5` pushed the numerator past the denominator ⇒ 4 real series showed
**111.1% / 116.7% / 128.6% / 105.9%**. Fixed; the mutation check has
its own mutation for this bug.

**Fractional volumes (5.5, 10.5…) are special volumes — excluded from the percentage**: they
don't fall inside `1..max` so they are dropped from **both** the numerator and the denominator. `unique_volume_count`
**still counts every volume** (including 5.5) — this field is unchanged. Consequence: a series with
18 volumes (14 integer + 4 fractional) ⇒ `unique_volume_count = 18` but the rate = 14/14 = 100%.

`max_volume_number` is computed **dynamically** from the `books` table, **not** stored as an aggregate
column in the DB (`AGENTS.md` Rule 2). Same denominator as `missing_volumes` and
`analytics_service.get_financial_summary` ⇒ the metric is consistent across the app.

The **old** formula was `unique / max(unique, 1)` ⇒ **always 100%** whenever a series had
books ⇒ meaningless. Fixed in P2-5; includes **6 tests** in `backend/tests/test_series.py`
(covering **both endpoints** — list and detail) + mutation check **7/7**.

⚠️ **Known limitation:** the denominator is **not** the series' total volume count — the app
doesn't store the total (no `total_volumes` column). A series with only volume 10 ⇒
1/10 = **10%**, not 100%. An absolute notion of "complete" would need a "total volumes"
source — currently **none exists**. Don't read this number as "the series is done".

`SeriesSummaryItem` and `SeriesDetailResponse` are **2 separate classes** (no
inheritance) ⇒ adding a field requires editing **both** + `frontend/src/types/index.ts`
(`SeriesDetail extends SeriesSummary`, so the FE only adds `max_volume_number`).

**The two endpoints source volumes from 2 different places** (not caused by P2-5):
`get_all_series_summary` only reads `books.volumeNumber`; `get_series_detail` has a
**fallback** that parses numbers in `volumeDisplay`/`title` ⇒ in theory `unique_count` /
`max_volume` (and therefore `completion_rate_percent`) can diverge between the 2 endpoints.
Measured on the real DB 21/10: **989 books**, 6 books with `volumeNumber IS NULL`, of which **2**
books have a title containing a number — but **both have `seriesId = NULL`** (standalone books,
not in any series) ⇒ **no series is affected**. `book_service.extract_volume_number`
extracts `volumeNumber` from the title at create/update ⇒ new books always have
`volumeNumber`. Only **old** books created before that feature could cause divergence.

### Database-level optimization of Bookmark search, filter and pagination (25/10, P3-33)

Before P3-33, `BookmarkService.get_works` loaded the full list of works with all relations (`author`, `countryRel`, `statusRel`, `typeRel`, `names`, `links`) into Python memory to compute `stats`, filter (`status`, `country`, `type`, `author_id`, `domain`), do accent-insensitive search (`remove_accents`), sort, and slice `filtered[skip : skip + limit]`. As the bookmark count grows, this burns RAM and slows the API response.

P3-33 moves the whole pipeline to the database layer:
1. **Status stats aggregation:** executes the SQL `GROUP BY` statement directly:
   ```sql
   SELECT s.code, COUNT(w.id)::int as count
   FROM work_statuses s
   LEFT JOIN story_works w ON w.status_id = s.id
   GROUP BY s.code
   ```
   Moves the memory complexity from $O(N)$ to $O(1)$ aggregation on PostgreSQL (~1-2 ms), with a safe fallback to `find_many(include={"statusRel": True})` if `query_raw` fails.
2. **Pushes filters down into the Prisma `where` clause:** relation filters on `statusRel`, `typeRel`, the `country` code, `authorId`, and URL domain (`links: { some: { url: { contains: domain, mode: "insensitive" } } }`) execute entirely in the SQL `WHERE` query.
3. **Two-way accent-insensitive search at the PostgreSQL layer via `unaccent`:** uses a PostgreSQL raw query with `unaccent(lower(COALESCE(...))) LIKE unaccent(lower($1))` scanning names (`story_work_names`), authors (`authors`), labels/links (`story_work_links`), and notes (`notes`) to filter the matching `id` list into `where["id"] = {"in": matched_ids}`. Supports two-way search (typing without accents finds accented text and vice versa, normalizing the Vietnamese characters Đ/đ). Automatically falls back to in-memory filtering if the `unaccent` extension or the raw query fails.
4. **Pagination and total count at the DB:** uses `count(where=where)` and `find_many(where=where, skip=skip, take=limit, order=order, include=include_relations)`, loading only the current page's rows (default 20 items) instead of loading everything into RAM.

## 3. Per-app matrix

| App | Stack | Entry point | Verify | Has tests? |
|---|---|---|---|---|
| `backend/` | Python 3.13, FastAPI, Prisma Client Python, Pillow | `python -m app.main` or `uvicorn app.main:app` | `.\.venv\Scripts\python.exe -m pytest tests/ -v` | ✅ **360 items** |
| `frontend/` | Next.js 16.3, React 19.2, Tailwind **v4** (CSS-first), shadcn/ui | `npm run dev` | `npm run lint && npm run build` | ❌ **none** |
| `mobile/` | Expo SDK 54, Expo Router, NativeWind, AsyncStorage | `npm run web` · `npm run tunnel` · `npm run build:apk` (standalone APK) | `npx tsc --noEmit` | ❌ **none** |

Three easy-to-get-wrong spots:
- **Tailwind v4 has no `tailwind.config.*`.** Config lives CSS-first in
  `src/app/globals.css` (`@import "tailwindcss"` + an `@theme inline` block mapping the 19
  HSL variables of `:root` — P2-2). **17/10: `components.json` now points `tailwind.config`
  to `""` and `README.md` has dropped the `tailwind.config.ts` line from the folder tree** — before
  that both pointed at a nonexistent file.
- **`npm run tunnel` only tunnels the Metro bundler**, it does not make the **backend port** reachable
  from the phone. Intake still requires the same Wi-Fi LAN.
- 🔴 **Expo Go only runs apps with the SAME SDK** (latest + the one before). The project is on
  **SDK 54** ⇒ Expo Go **SDK 57** will say *"Project is incompatible with this version of
  Expo Go"*. **Do not upgrade the SDK** (a 2-major migration = high risk, hitting exactly the app that needs testing);
  use one of the 3 routes (P3-16, 22/10):
  1. **Standalone APK** (recommended): `npx eas-cli login` → `npx eas-cli init` (once) →
     `npm run build:apk` ⇒ the app runs **fully standalone**, no Expo Go / no tunnel.
     The `preview` profile does **not** enable `developmentClient` ⇒ **no** `expo-dev-client` needed
     ⇒ **no** added dependency. `package-lock.json` **is** touched (once, 22/10: bumped
     `lucide-react-native` `0.475` → `0.511` — `0.475` declared peer `react <=18` so `npm ci`
     failed with ERESOLVE; EAS Build runs `npm ci --include=dev` **without** `--legacy-peer-deps`
     ⇒ previously the APK build always failed ⇒ now CI trap #4 is gone).
  2. **Sideload Expo Go SDK 54** (Android, 0 code changes): APK from
     `github.com/expo/expo-go-releases/releases` ⇒ keeps **hot reload**.
  3. **Web in the phone's browser**: `npm run tunnel` → open the https URL on the phone ⇒
     **not a native app** ⇒ the real camera can't be tested.
  ⇒ Details: `HOW_TO_RUN.txt` STEP 4 · `TESTING_GUIDE.md` §2.
- 🔴 **The standalone build (APK) must enable plain HTTP** (P3-17, 22/10) — the app calls the internal backend
  with `http://<LAN-IP>:8000`; Android 9+ (API 28+) **blocks plain HTTP** by default ⇒ a
  release build without `android:usesCleartextTraffic` ⇒ React Native reports
  **"Network request failed"** ⇒ the app **cannot** connect to the PC at all (measured: the manifest generated
  by `expo prebuild` **lacks** this attribute). Enabled via the **local** config plugin
  `mobile/plugins/withCleartextTraffic.js` (uses `expo/config-plugins` — the `expo` package is already a
  direct dependency ⇒ **no** added dependency; `expo-build-properties` is **not** used).
  ⚠️ The attribute must be set at **`application.$`** — assigning `application['android:usesCleartextTraffic']`
  directly creates a **child element** `<android:usesCleartextTraffic>` ⇒ **Android ignores it** ⇒ still broken.
  ⇒ **Expo Go is unaffected** (Expo Go's own manifest already enables cleartext) ⇒ easy to think the app is broken
  when actually only the **release** build is blocked.

## 4. Feature divergence

Part of the backend surface has **no callers**. Verified by grep over `frontend/src`
and `mobile/`:

| Endpoint | Who calls it | Notes |
|---|---|---|
| `GET /books/{book_id}` | **nobody** | every use of `/books/{id}` is PUT or DELETE |
| `GET /accessories/{id}` | **nobody** | same as above |
| `GET /auth/status` | **nobody** | the "Bảo mật Master Key" chip in `Navbar.tsx` is a **feature description**, not a status (P2-8) — the Master Key is always valid while the app runs, nothing to probe |
| `POST /backups/restore-json` | **nobody** | only `restore/{log_id}` exists |
| `PUT /books/reorder/batch` | **P3-18** — `orphan-items/page.tsx` (drag-and-drop for orphan books) | before P3-18 **nobody** called it |
| `PUT /accessories/reorder/batch` | **P3-18** — `orphan-items/page.tsx` (drag-and-drop for orphan accessories) | same as above |
| `GET /intake/sessions/{id}` | mobile (via `validateIntakeSession`) | `lib/intake.ts` has the `getIntakeSessionStatus` wrapper but **no component calls it** |

**Drag-and-drop: now available for both orphan books and orphan accessories (P3-18, 22/10).** Before, only
`VolumeGrid.tsx` (the volume strip inside a series) had a `Droppable` (`droppableId="books-strip"`) and
`onReorder` only accepted `Book[]` ⇒ the accessory reorder endpoint existed in the backend and worked, but
the UI wasn't wired to it. Now the `/orphan-items` page has **2 droppable strips**
(`orphan-books-strip`, `orphan-accessories-strip`) calling the 2 endpoints correctly ⇒ **both backend endpoints are
"alive"**. The pure logic lives in `lib/orphanReorder.ts`: renumber `sort_order` = 1..N in the new
order + **lock dragging while filtering by name** (a filtered subset would renumber within the subset ⇒ **duplicate**
`sort_order` values with the unfiltered part ⇒ mixed-up order). Protected by the `orphan: reorder` gate (25/25 cases).

The two "assign to series" paths also diverge: books use the dedicated endpoint
`PUT /books/{id}/move-to-series?series_id=`, while accessories require `PUT /accessories/{id}`
with body `{related_series_id}`. There is no `move-to-series` equivalent for accessories.

## 5. Known dead and duplicated code

**Backend — deleted in P2-7 (19/10): written but never called:**
- `core/security.py`: `encrypt_data`, `decrypt_data`, `get_fernet_cipher` (HKDF +
  Fernet) and `create_refresh_token`. The data-encryption mechanism is currently **non-functional**; `decrypt_data` is even fail-open (returns the ciphertext as-is on error). `ENCRYPTION_SALT`
  is kept, no longer used.
- `services/image_service.py`: `ALLOWED_MIME_TYPES` — the real whitelist lives in
  `_validate_image_file`; this constant is unused.
- `api/intake.py`: `MAX_SINGLE_FILE_SIZE` — unused.
- `services/excel_service.py`: `ROW_ALT_BG` — unused.
- `services/publisher_service.py`: `get_publisher_by_id` — unused.
- `core/config.py`: `RAW_STORAGE_PATH`, `WEB_STORAGE_PATH` — `image_service` builds
  paths from `STORAGE_BASE_PATH` instead of reading these 2 variables.

**Frontend — unused dependencies deleted in P2-7:** `chart.js`, `react-chartjs-2` (the analytics page draws
bars with plain CSS), `react-day-picker` (`ui/calendar.tsx` is hand-written with
date-fns), `@radix-ui/react-dialog` + `@radix-ui/react-slider` (`ui/Modal.tsx` is
hand-written).

**Frontend — components imported nowhere, deleted in P2-7:** `ui/slider.tsx` (24 lines). `ui/input.tsx`
(20 lines — every form uses a raw `<input>` with long Tailwind strings; P2-7 recorded "0 imports" which is
**wrong** — there are actually **7 consumers**, see `AGENTS.md`). `button.tsx` is used only by
`OrphanCleanupPanel` (exactly 1 place).

**Frontend — lint cleaned up in P3-1 (20/10):** `npm run lint` **70 → 0 problems**.
Among them was a **real data-loss bug**: 5 modal forms synced state from props in
`useEffect` (runs **after paint**) ⇒ on the first frame the state was still empty ⇒ clicking "Save" right
after opening an edit form sent `publisher_id`/`edition_id` = **null** ⇒ **lost Publisher + Edition**. Fixed by
**adjusting state during the render phase**. Details + measurement trap:
`FRONTEND_MAP.md` §3.

**Frontend — accessory-type label map duplicated 4 times:** the 9-type accessory label map appears in
`VolumeGrid.tsx`, `SymmetricalBlocks.tsx` (the version WITH emoji), `orphan-items/page.tsx`
and `MobileIntakeDialog.tsx`. `formatBytes` is duplicated in `settings/page.tsx` and
`OrphanCleanupPanel.tsx`.

**Frontend — dead prop deleted in P3-1:** `getImageUrl(relPath, preferRaw=false)` —
the `preferRaw` parameter was never read, **0 callers** passed it ⇒ removed from
the signature.

**Frontend — image placeholder is now real (P2-9, 21/10):** `getImageUrl(relPath)` returns `/placeholder-book.svg` when
`relPath` is empty — an **SVG** file in `frontend/public/`
(the only image file `frontend/` has). Before, it returned `/placeholder-book.png`, a file that
**did not exist** ⇒ **404**. `frontend/public/` previously had **nothing** ⇒ every original image in the repo lives in
`storage/`. ⚠️ **This fallback is a safety net, almost never hit**: the 3 places that **don't** guard it
(`MobileIntakeDialog.tsx:787` gallery ·
`:924` batch thumbnail · `:1064` single thumbnail) all show images **from the phone**, and the server **always** sets `web_image_path` (`api/intake.py:302`) ⇒ only old/unconverted
images fall into this branch. The other 10 places already **guard**
(`x.web_image_path ? <img> : "Chưa có ảnh"`). Fixing `components.json` would have been **wrong**:
it was already valid per Tailwind v4 (`"tailwind": { "config": "", … }`).

**Frontend — progress bars must not be "floored" (P3-8, 21/10):** the % bars on the
Analytics page (`app/analytics/page.tsx`) are drawn with `style.width` — the value must be the
**exact figure**, not floored with `Math.max(x, 5)` "to look nice" (before, a 0% month drew a 5% bar ⇒ **the bars summed past 100%**). `Math.max` is legitimate when it
**protects** (page clamping, minimum zoom, finding the max) — the remaining 5 uses in
`frontend/src` are that kind. Details + probe numbers: `FRONTEND_MAP.md` §6.

**Mobile — dead export:** `clearPhotos` in `IntakeContext.tsx` is exported but no screen calls it; `disconnectSession` deletes the photos directly.

**Backend — test backup files accumulated unboundedly, fixed in P2-9 (21/10):**
`storage_test/backups/` once grew to **15.461 files / 9,2 MB**. Cause: `conftest.py`
deletes the `databasebackuplog` table **before and after every test** ⇒
`BackupService._enforce_rolling_retention` had no log rows left to `unlink()` ⇒ orphaned `.gz`
files accumulated forever. Retention is **not wrong** (in production the log table isn't
wiped every write) — the bug is in the **fixture**. Added `_purge_test_backup_files()`, called in
the teardown of `setup_test_db`: deletes **only** `*.gz` in `settings.BACKUP_STORAGE_PATH`,
**with a guard**: if the path **doesn't contain "test"** ⇒ **deletes nothing** (don't let one bad
`.env.test` config wipe real backups). The guard is tested on 3 branches: path without "test" ⇒
**keep files** · with "test" ⇒ delete · missing folder ⇒ no error.
⚠️ **DO NOT** touch `storage_test/raw` + `storage_test/web` (Rule 5 — `test_orphan_images.py`
asserts on specific stems existing across runs). Measured **during the cleanup**: `raw` 2.487 and
`web` 7.427 files **unchanged** (the fixture only touches `backups/*.gz`); images still **accumulate**
after each test run — by design. `backups` 15.461 → **0** after each run.

**Backend — Bookmark pagination and search optimization (P3-33, 25/10):**
`BookmarkService.get_works` used to fetch 100% of bookmark rows with 6 relations into RAM to filter/search/slice. Everything has been moved to the DB layer: SQL `GROUP BY` for stats, Prisma `where` for filters, a PostgreSQL `unaccent` raw query for accent-insensitive search (with in-memory fallback), and database-level `count()` + `skip`/`take`.

**Backend — added the missing indexes and unique constraints (P3-35, 25/10):**
Completing the 8 FK indexes for DB 1 with `accessories.publisher_id` (index for the `Accessory` -> `Publisher` relation). In DB 2 (Bookmark Collection), the author's plain index is replaced with the unique constraint `uq_authors_name` (`BookmarkAuthor.name`), plus the sort/pagination indexes `idx_story_works_order_number` and `idx_story_works_updated_at` (`BookmarkWork`), and the duplicate-check/source-filter index `idx_story_work_links_url` (`BookmarkWorkLink.url`).

## 6. Storage, quota and secrets

**Dual storage.** Each image produces **3 files**: `raw/{category}/{uuid}.{ext}` keeps the
original, `web/{category}/{uuid}.webp` ≤1400px, `web/thumbnails/{category}/` 300×420.
The DB keeps only 2 relative paths; the thumbnail path is **not stored**, it is
re-derived from `web_image_path`. That's why garbage collection must match by **stem**, not by
filename (`orphan_image_service.py` explains why).

**Image quality (P2-10, 21/10) — for writing copy correctly:** `raw/` keeps the **exact bytes**
uploaded (`image_service.py:102`); the `web/` copy is **WebP q85 lossy**
(`:124`), the thumbnail is **q80** (`:129`). ⇒ there is **no** lossless copy anywhere in the
system, and the **original image** is the "archival" copy while the WebP is the "fast-loading optimized" copy.
UI copy must follow this pipeline — see §2 (intake flow) and `FRONTEND_MAP.md` §6.

**Storage paths always anchor to `backend/`.** `config.py` has a validator `_anchor_storage_paths` that folds `STORAGE_BASE_PATH` and `BACKUP_STORAGE_PATH` into `BACKEND_DIR` when they are relative paths.

Reason: relative paths used to resolve against the **process CWD**. Running tests from the
repo root and the app from `backend/` used **two different storage trees** — the app
looked like it had lost all images, and each test run spawned a junk folder at the root (both
gitignored so git never saw them). The validator must run **after** Pydantic because
`BaseSettings` re-reads from env and would overwrite values precomputed in defaults.

**Quota.** `STORAGE_QUOTA_MB` (default 10240) + the safety net `STORAGE_MIN_FREE_MB`
(default 1024). `check_headroom()` must run **before** writing any file —
a batch over quota is rejected atomically, with zero files slipping through. The byte count is cached for
`STORAGE_QUOTA_RESYNC_SECONDS` (300 s) because a full `stat()` of the folder on every
upload is too expensive.

For the same reason, **`check_headroom` must be called via `asyncio.to_thread` on every
async path** — a cold cache means one full-tree scan (measured 127 ms on
production storage) and before P1-11 it froze the event loop. The `await` preserves
the "check before write" invariant. The function stays `sync` so callers inside a thread can
use it. Details + measurements in §2, the "Heavy I/O must not run on the event loop" section.

**`HOW_TO_RUN.txt` contains real credentials but is gitignored** (`.gitignore:59`).
The Master Key, the admin password and the DB password live there; verified with
`git grep` — **no**, they don't appear in any tracked file. Don't create a tracked copy. But note: an agent reading this file will see
real secrets in context, so **never quote the values** back in replies or in
`docs/`. See `AGENTS.md` Standing Rules item 7.

**Prisma client doesn't hardcode paths (P3-3, 20/10).** `schema.prisma` no longer has an
`output` line — it used to be `../.venv/Lib/site-packages/prisma` (a **Windows** path).
`prisma-client-py` by default writes into the site-packages of the **python running the generator**
(`generator.py:221` → `BASE_PACKAGE_DIR`), so:
- the client lands in the right venv **only if** the venv python is in `PATH` — the CLI finds `python` via `PATH`;
- without a venv in `PATH` ⇒ the client falls into the global Python's user-site ⇒ the app fails to import
  with *"You defined no datasource"* (same root cause as the 166 ERROR from P3-1).

**FK indexes (15/10, P1-3, updated P3-35).** `schema.prisma` has **8 `@@index`** for exactly the FK
columns with real queries: `books.series_id/publisher_id/edition_id`,
`accessories.related_series_id/related_book_id/publisher_id`, `series.publisher_id`,
`publisher_editions.publisher_id`. Before P1-3 production had **0 FK indexes** —
`pg_indexes` had exactly 9 rows (7 PK + 2 unique); Prisma/PostgreSQL does not auto-index
FK columns, and every relation-based read — including Prisma's `include`, which runs
`WHERE fk IN (…)` — was a full scan. Measured on the test DB at 2 scales (989 and 9.890 books, seed
script in plan P1-3 / tracker `drafts/notes/known-issues.md`): the selective queries switched cleanly
to indexes — `books WHERE series_id` @9.890 rows **1,04 → 0,11 ms** (buffers
217 → 13), `accessories WHERE related_series_id` **1,46 → 0,07 ms**,
`WHERE related_book_id` **0,90 → 0,02 ms**. Three queries kept their Seq Scan
**at both scales** and the planner chose correctly: full export of every book, 20% orphan accessories,
`publisher_editions` 16 rows. Two tracker-proposed columns were **rejected with measurements**:
`books.purchaseDate` (no SQL WHERE/ORDER BY — only read in Python,
`analytics_service.py:43-46, 65-68`); `database_backup_logs.created_at` (retention
caps at ≤ 40 rows, measured 24). Rollback path: `DROP INDEX IF EXISTS` on exactly the 7
`*_idx` names — purely additive, no API change. Raw EXPLAIN files + prod preview: plan
P1-3 (`drafts/notes/known-issues.md`).

**Database security: Least-Privilege User & SSL Enforcement (P3-42, SEC-12).**
Implements the Least Privilege principle and In-Transit Data Encryption:
- **Privilege-separation script `deploy/db/setup_least_privilege_user.sql`:**
  - Creates the `bcm_runtime` role used by the FastAPI backend in production.
  - Grants DML (`SELECT, INSERT, UPDATE, DELETE`) on tables and `USAGE, SELECT, UPDATE` on sequences in the `public` schema (both current objects and future `DEFAULT PRIVILEGES`).
  - Revokes all DDL privileges (`CREATE`, `ALTER`, `DROP`) and `TRUNCATE` to contain risk: if the app suffers a SQL injection, the attacker cannot wreck the schema structure or wipe tables.
  - Clear separation: the admin/migration user (DB owner) runs `prisma db push` / `prisma migrate`, while the app at runtime in `backend/.env` operates as `bcm_runtime`.
- **Enforcing SSL mode on PostgreSQL:**
  - `backend/.env.example` adds the `?sslmode=require` (or `sslmode=verify-full`) parameter to `DATABASE_URL` and `BOOKMARK_DATABASE_URL`.
  - Combined with the `hostssl` directive in `pg_hba.conf` to fully block plaintext connections, preventing data leaks via network sniffing.

**Mobile LAN hardening: client-side URL validation (P3-42).**
Protecting the mobile app `mobile/src/services/intakeUrl.ts` (and `mobile/src/lib/intakeUrl.ts`):
- `normalizeIntakeBaseUrl()` and `isPrivateOrLocalHost()` strictly gate the connection URL:
  - If the scheme is `http://`: only connections inside the private network are allowed (`localhost`, `127.0.0.0/8`, `10.0.0.0/8` including the Android emulator's `10.0.2.2`, `172.16.0.0/12`, `192.168.0.0/16`).
  - If the scheme is `http://` but points to a public IP or an Internet domain (like `example.com`), reject with a clear error asking to switch to `https://`.
  - If the scheme is `https://`: allow the connection normally, ensuring data safety over an encrypted channel.

**At-Rest Backup Encryption (P3-42, SEC-08).**
Protecting the integrity and confidentiality of DB backup snapshots on disk (`storage/backups/` and `storage/backups/bookmarks/`):
- Module `backend/app/core/backup_crypto.py`:
  - A 256-bit encryption key derived from `settings.MASTER_KEY` via `HKDF-SHA256` (salt: `b"bcm_backup_salt_v1"`, info: `b"database_backup_encryption"`).
  - AEAD algorithm: `AES-256-GCM` with a random 12-byte nonce (`os.urandom(12)`) and additional authenticated data (AAD): `b"BCM_BACKUP_V1"`.
  - Encrypted file structure: 8-byte magic header `b"BCM_ENC\x01"` + 12-byte nonce + `ciphertext_and_tag`.
  - Transparent backward compatibility: the decryption function auto-detects the gzip header `b"\x1f\x8b"`, allowing old unencrypted backups to be restored without disruption.
  - Anti-tampering: any unauthorized modification of the ciphertext, tag or nonce triggers `InvalidTag` and raises `BackupCryptoError`, refusing to restore corrupted data.
- Integrated in `BackupService` (Main DB) and `BookmarkBackupService` (Bookmark DB).

## 7. Indexing exclusions

The repo **doesn't yet have** a `.gitnexusrc`; `.gitnexusignore` was added together with
this documentation. Before it existed, the whole tree was indexed. Measured after adding the exclusions
(latest re-measure 16/10, after P1-8): **131 files / 2024 symbols /
5006 relationships / 172 flows**.

`.gitnexusignore` excludes:

| Path | Reason |
|---|---|
| `frontend/node_modules/`, `mobile/node_modules/`, `**/node_modules/` | dependencies, not source |
| `backend/.venv/` | contains the Prisma client generated from `schema.prisma` |
| `backend/.env*` (except `.env.example`) | real secrets — `backend/.env.test` is also **not** tracked ⇒ CI must generate it from `.env.example` (see `TESTING_GUIDE.md` §6) |
| `storage/`, `storage_test/`, `mobile/dist/` | binary images + GZIP snapshots, no symbols |
| `.agent/`, `.claude/skills/` | agent scaffolding, not project source |
| `.next/`, `.pytest_cache/`, `__pycache__/` | build/cache output |

**Don't run `analyze` without `--force` right after editing `.gitnexusignore`** —
incremental will fail with `FTS index 'file_fts' is inconsistent: document for node
offset N is missing during delete`. A full rebuild is required. After analyzing,
update the numbers in this folder's `README.md` — that's why it pins a commit.
**`/storage` only serves `raw/` and `web/`.** `main.py` has an allowlist
`_PUBLIC_STORAGE_DIRS`; every other folder in the storage root — including `backups/` —
returns 404 even with a valid token. P0-7 (26/09) added auth to the mount but did **not**
exclude `backups/`, so a request could download an entire database dump. Backup
filenames are timestamps (`auto_backup_YYYYmmdd_HHMMSS_...`)
so they are guessable, unlike the uuid4 images — exactly the premise stated in the `main.py:72-73`
comment. Fixed in tracker `#1`, don't re-tick P0-7.

This is the **first line of defense**. The second layer (14/10, tracker `#1b`) dropped `users`
from the payload so `.gz` files no longer carry password hashes — see §2. Old backup files
created before 14/10 **still contain** it; if cleanup is required, delete deliberately, don't let
old files linger.
