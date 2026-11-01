# API_MAP.md

All endpoints live under `/api` unless noted otherwise. Default auth =
`Depends(get_current_user)` → decode the HttpOnly `book_session_token` cookie
(or `Authorization: Bearer`) **then** query `prisma.user.find_unique`.

`has_valid_access_token` only verifies the signature, **no** DB query — meant for
`/storage` and the cookie branch of intake status, since a grid of 100 covers would otherwise create 100 identical queries.

Base commit `0f1b372` + #4 (14/10).

---

## auth — `api/auth.py`

| Method | Path | Auth | Rate limit |
|---|---|---|---|
| POST | `/auth/login` | — | **5/minute + 20/hour** |
| POST | `/auth/logout` | **none** | — |
| GET | `/auth/me` | ✔ | — |
| GET | `/auth/status` | ✔ | — *(nobody calls it)* |
| POST | `/auth/change-password` | ✔ | 5/minute |

Login sets the HttpOnly cookie. `secure`/`samesite` are relaxed only when
`ENVIRONMENT == "development"`; the `samesite` cookie is `lax` in dev, `strict` otherwise.

## series — `api/series.py`

| Method | Path | Notes |
|---|---|---|
| GET | `/series` | filters `search`, `publisher_id`, `status` |
| GET | `/series/{id}` | `SeriesDetailResponse` + `missing_volumes` + `max_volume_number` + `completion_rate_percent` (P2-5) |
| POST | `/series` | |
| PUT | `/series/{id}` | returns the detail dict |
| DELETE | `/series/{id}` | |
| PUT | `/series/{id}/reorder-books` | **the `series_id` path param is unused**; delegates to `BookService.reorder_books`. All 3 reorder endpoints run in **one** `prisma.tx()` — a mid-way failure rolls back everything, leaving no misaligned `sortOrder`. Returns 500 on rollback |

## books — `api/books.py`

| Method | Path | Notes |
|---|---|---|
| GET | `/books` | `series_id` `publisher_id` `edition_id` `is_orphan` `search` |
| GET | `/books/{id}` | **nobody calls it** |
| POST | `/books` | 1 snapshot |
| POST | `/books/batch` | **1 snapshot for the whole batch**; returns `{succeeded, failed[{index,label,error}]}` |
| POST | `/books/bulk-create` | `from_volume`..`to_volume`; 1 snapshot `BULK_CREATE` |
| PUT | `/books/{id}` | field-by-field `if x is not None` to allow setting null |
| DELETE | `/books/{id}` | |
| PUT | `/books/{id}/move-to-series?series_id=` | dedicated endpoint — **books only** |
| PUT | `/books/reorder/batch` | **P3-18** — called from `orphan-items/page.tsx` (standalone book drag-and-drop); payload `{items:[{id, sort_order}]}` ⇒ renumbered 1..N |

Route ordering: `POST /batch` and `/bulk-create` are declared before `PUT /{book_id}`;
different methods so they don't shadow each other.

## accessories — `api/accessories.py`

| Method | Path | Notes |
|---|---|---|
| GET | `/accessories` | `is_orphan` requires **both** FKs `relatedSeriesId` and `relatedBookId` to be None |
| GET | `/accessories/{id}` | **nobody calls it** |
| POST | `/accessories` | |
| POST | `/accessories/batch` | same contract as `/books/batch`, reuses `_first_error` |
| PUT | `/accessories/{id}` | **the only path** to assign an accessory to a series |
| DELETE | `/accessories/{id}` | |
| PUT | `/accessories/reorder/batch` | **P3-18** — called from `orphan-items/page.tsx` (standalone accessory drag-and-drop) — see `ARCHITECTURE.md` §4 |

## publishers — `api/publishers.py` (7)

`GET/POST /publishers` (`GET` returns nested `editions[]`) ·
`PUT/DELETE /publishers/{id}` · `POST /publishers/{id}/editions` ·
`PUT/DELETE /publishers/editions/{edition_id}`

## media — `api/media.py`

| Method | Path | Notes |
|---|---|---|
| POST | `/media/upload?category=` | **30/minute**; `category` validated by the regex `^(books\|series\|accessories\|publishers\|bookmarks)$` |
| GET | `/media/storage-stats` | merges image stats + quota report. **walks the entire disk on every call** — runs via `to_thread`, doesn't block the loop (16/10) |
| GET | `/media/orphan-images` | read-only, no side effects |
| POST | `/media/orphan-images/cleanup` | body `OrphanCleanupRequest`, `max_length=2000` |

Cleanup deletes **only** the paths the user has reviewed and confirmed — it does not
re-scan then delete. This is intentional; a comment in source says so.

Since 16/10 (P1-11 remainder), scan, cleanup and storage-stats all run their heavy I/O
via `asyncio.to_thread` — see `ARCHITECTURE.md` §2. Image storage errors (P3-41, SEC-14) normalize to safe messages, log `logger.exception()` internally, and never expose `str(e)`.

## backups — `api/backups.py`

| Method | Path | Notes |
|---|---|---|
| GET | `/backups/logs` | |
| POST | `/backups/create-manual` | |
| POST | `/backups/restore/{log_id}` | 4 failure branches, 4 **different** messages: 404 unknown log · 410 file missing · 422 file corrupt · 500 rollback. **Only the 500 branch means data was touched**; the other three return "not yet touched" messages (truthfully) |
| POST | `/backups/restore-json` | **nobody calls it**. Payload >50 MB → 413, non-dict → 400 |

## analytics — `api/analytics.py`

`GET /analytics/financial-summary` — the single endpoint.

## excel — `api/excel.py`

| Method | Path | Notes |
|---|---|---|
| GET | `/excel/export` | returns the .xlsx file with `Content-Disposition` |
| GET | `/excel/template` | `Book_Collection_Import_Template.xlsx` |
| POST | `/excel/import` | accepts `.xlsx`/`.xls` |
| POST | `/excel/import-legacy` | **`.xlsx` only**; runs 1–3 minutes for ~130 series / ~2400 images |

**No upload size limit, no rate limit** on all 4 endpoints.
A backup is captured automatically before mutating (`PRE_EXCEL_IMPORT`). All export/import/template errors (P3-41, SEC-14) log `logger.exception()` and return a safe generic message, dropping `str(e)`.

## intake — `api/intake.py`

| Method | Path | Auth | Rate limit |
|---|---|---|---|
| POST | `/intake/sessions` | admin | — ; `ttl_minutes` 1–60 |
| POST | `/intake/pair` | **PIN, no JWT** | 5/minute + 20/hour |
| GET | `/intake/sessions/{id}` | admin cookie **or** `X-Intake-Pin` | 5/minute + 20/hour |
| DELETE | `/intake/sessions/{id}` | admin | — |
| POST | `/intake/upload` | session + PIN | 30/minute |
| WS | `/intake/ws/{id}` | session exists, active, not expired — **no token** | — |
| WS | `/ws/intake/{id}` | top-level alias, outside `/api` | — |

The three security conditions each have a dedicated test in `test_intake_security.py`:

- `/pair` deliberately requires **no** JWT — the phone has no JWT. The PIN is generated with
  `secrets`, compared with `secrets.compare_digest`.
- After `INTAKE_MAX_PAIR_ATTEMPTS` (default 5) the session is **locked**, and even the **correct
  PIN is rejected** — `find_session_by_pin` skips locked sessions.
- `enforce_client_ip` pins `paired_client_ip` **exactly once and never
  re-binds**. The cookie branch (PC) does no IP check; the PIN branch (mobile) does.
  The WebSocket is deliberately **not** IP-restricted.

**WS heartbeat contract (P3-15, 22/10):** the client sends `{"type":"PING"}` ⇒ the server replies
`{"type":"PONG", "timestamp": ...}`. The server is **not case-sensitive** ⇒ `{"type":"ping"}`
also gets a PONG (older mobile builds or other clients aren't left "mute" ⇒ the client-side
watchdog — P3-14 — doesn't falsely report "silent death"). Widened on purpose, **never** tightened.

**Socket lifecycle:** `ws_manager.connect(...)` **and** `send_json(CONNECTED)` are **inside**
`try` ⇒ **every** exit path (including a failure while sending the confirmation) runs
`finally: disconnect` ⇒ **never** keep a dead socket in `_connections` ⇒ the
`connected_clients` count is always correct. `disconnect` is idempotent (membership check) ⇒ calling it twice is harmless.
Regression test: `backend/tests/test_intake_ws.py` (5 tests, fake WebSocket calling the endpoint directly).

`POST /intake/upload` calls `StorageQuotaService.check_headroom(batch total)` before
writing any file — if the check were inside the loop, files already on disk would become
orphans. Since P1-11 the call goes through `asyncio.to_thread`: a cold quota cache means one
full-tree scan (measured **127 ms** on production storage), which previously ran entirely
on the event loop. See `ARCHITECTURE.md` §2, item "Heavy I/O must not run on the
event loop". The thumbnail path is **recomputed** from `web_image_path`, not stored, not
verified.

## bookmarks — `api/bookmarks.py` (19 endpoints — Dual-DB — P4-1, P4-2, P3-34)

| Method | Path | Notes |
|---|---|---|
| GET | `/bookmarks` | DB-level pagination & filtering (P3-33): query params `page` (≥1), `per_page` (1..100, default 20), `status`, `country`, `type`, `search` (bidirectional accent-insensitive PostgreSQL `unaccent` raw query + in-memory fallback), `sort_by` (`order_asc`/`order_desc`/`updated_desc`/`name_asc`), `author_id`, `domain`. Returns `{items, total, page, per_page, stats}` with `stats` aggregated directly via SQL `GROUP BY` |
| GET | `/bookmarks/metadata` | catalogs of countries, statuses, categories, and the source-domain list (`domains`) |
| GET | `/bookmarks/authors` | author autocomplete |
| POST | `/bookmarks/authors` | get-or-create author (`BookmarkAuthor`) |
| GET | `/bookmarks/excel/export` | streams `.xlsx` with 2 sheets: Bookmarks + standard catalog (runs off-loop via `to_thread`) |
| GET | `/bookmarks/excel/template` | downloads the template file `Bookmarks_Import_Template.xlsx` |
| POST | `/bookmarks/excel/import` | **5/minute**; loads data from an `.xlsx`/`.xls` file, captures `PRE_EXCEL_IMPORT` and `POST_EXCEL_IMPORT` snapshots |
| GET | `/bookmarks/backups/logs` | lists backup snapshots of DB 2 |
| POST | `/bookmarks/backups/create-manual` | **5/minute**; captures a manual snapshot of DB 2 |
| POST | `/bookmarks/backups/restore/{log_id}` | **2/minute**; atomically restores DB 2 from a snapshot inside `bookmarks_prisma.tx` |
| GET | `/bookmarks/{work_id}` | detail of one bookmark work |
| POST | `/bookmarks` | creates a work, captures the `CREATE_WORK` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| PUT | `/bookmarks/{work_id}` | updates a work, captures the `UPDATE_WORK` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| DELETE | `/bookmarks/{work_id}` | deletes a work, captures the `DELETE_WORK` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| POST | `/bookmarks/{work_id}/cover` | **30/minute**; uploads the cover, resizes WebP + thumbnail, captures the `UPLOAD_COVER` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| DELETE | `/bookmarks/{work_id}/cover` | deletes a work's cover, sets `rawImagePath`/`webImagePath` to null, captures the `DELETE_COVER` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| POST | `/bookmarks/check-duplicates` | checks whether a list of URLs already exists in DB 2 |
| POST | `/bookmarks/import-links` | **10/minute**; bulk-imports bookmarks from links/files, auto-creates authors, captures 1 `IMPORT_LINKS` snapshot at the end |
| POST | `/bookmarks/fetch-image` | **20/minute**; **P3-25** — safe external image download (SSRF blocking, abort >15MB, anti-hotlink via Referer/UA, Pillow validation). **P3-41 (SEC-06):** Socket-level DNS Pinning (`PinningBackend`), anti-DNS-Rebinding, blocks the CGNAT range `100.64.0.0/10` (RFC 6598) |
| PATCH | `/bookmarks/batch` | **10/minute**; **P3-34** — bulk-updates works (`status_id`, `type_id`, `country`), captures 1 `BATCH_UPDATE_WORK` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |
| DELETE | `/bookmarks/batch` | **10/minute**; **P3-34** — bulk-deletes works and cascades names/links, captures 1 `BATCH_DELETE_WORK` snapshot via `BackgroundTasks` (P3-36 PERF-1.7) |


## System — `main.py`

| Path | Auth | Notes |
|---|---|---|
`GET /media/missing-images` is the **reverse direction** of `GET /media/orphan-images`:
orphan finds *files nobody uses*, missing finds *records pointing at lost files*. Needed because
the `.gz` only contains the DB's bytes — **images are outside the backup**, so a lost image is truly lost.
Measured on real data 15/10: **6 book volumes** lost both `raw` and `web`.

| GET | `/api/health` | **public** — the only JSON endpoint besides login |
| GET | `/docs`, `/redoc` | disabled when `ENVIRONMENT == "production"` |

`/storage` is mounted via a `StaticFiles` subclass overriding `get_response()` to check the
token **before** touching the filesystem — a non-existent file returns **401 rather than
404**, blocking the existence oracle. No other endpoint reads images.
**Only `raw/` and `web/` are the web surface** (`_PUBLIC_STORAGE_DIRS` in `main.py`).
Everything else in the storage root — including `backups/` — returns **404** even when
logged in, because that folder holds full database dumps named by timestamp (guessable)
rather than uuid4 like the images. Allowlist rather than denylist for `backups/`, so
future sensitive folders are blocked by default.
Static WebP/Thumbnail images are served with the header `Cache-Control: public, max-age=31536000, immutable` (P3-36 PERF-1.5).
JSON responses >= 1000 bytes are compressed automatically via `GZipMiddleware` (P3-36 PERF-1.6).

`get_backup_logs` returns `status`: `"SUCCESS"` (file exists, restorable) or
`"FAILED"` (write failed, **no file** — restore would 500). Since 14/10 the
`FAILED` row is written instead of failing silently; the UI shows a red badge and disables the Restore button for
such rows. See `ARCHITECTURE.md` §2.

Two independent defense layers: (1) HTTP 404 blocks the download, (2) since 14/10 the
snapshot payload (`version "1.1"`) **no longer contains the `users` table**, so no more
Argon2id `passwordHash` inside the `.gz` — see `ARCHITECTURE.md` §2. Old backup files
(`version "1.0"`) still contain it.

Check order: **token → 401** first, then **path → 404**. Reversing the order would create
a "this path exists" oracle.

⚠️ Paths handed in by Starlette use OS separators, i.e. **backslash on
Windows** (`web\books\x.webp`). `_is_public_storage_path` converts `\` to `/`
before `posixpath.normpath` — rejecting all `\` outright would block **every image** on
Windows. The first version of this fix made exactly that mistake.

## honeypot — `api/honeypot.py` (P3-50)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET, POST, HEAD | `/internal/trap-sensor` | — | Honeypot trap that auto-blacklists crawler/bot IPs for 24 hours. Returns 403 `Security violation`. Immune to localhost/testclient |

## Cross-cutting rule

No typed contract between routers and UI. The frontend redefines response
shapes in `frontend/src/types/index.ts` and `lib/api.ts`. When adding an endpoint,
update **both** — the `Doc Trigger` table in `AGENTS.md` enforces this.

Money is returned as **string** (Postgres `Decimal` → JSON string), so
`formatVND` accepts `string | number`. Don't coerce to number before formatting.
Windows. The first version of this fix made exactly that mistake.
