# TESTING_GUIDE.md

Brief: **all 3 apps have tests** (since P3-20). Backend pytest · frontend and
mobile **vitest**. Before P3-20 only backend had tests — the old gate scripts
(`verify-mobile-url.mjs`, `verify-intake-ws.mjs`, `verify-orphan-reorder.mjs`)
are kept as-is, not replaced by vitest.

## 1. Backend — 360 test items, all of them real

```bash
cd backend
./.venv/Scripts/python.exe -m pytest tests/ -v   # Windows
# ./.venv/bin/python -m pytest tests/ -v          # macOS / Linux
```

> ⚠️ **DO NOT** call `pytest` from `PATH` — it points to the global Python ⇒ Prisma
> *"You defined no datasource"* ⇒ **166 ERROR** that look like a broken repo. Always
> use `-m pytest` with the python inside `backend/.venv`.

> **This section is the single source of test counts.** After P3-50 ran for real:
> **360 passed**. After P3-44 ran for real:
> **337 passed**. After P3-42 ran for real:
> **333 passed**. After P3-41 ran for real:
> **325 passed**. After P3-35 ran for real:
> **309 passed**. After P3-34 ran for real:
> **307 passed**. After P3-33 ran for real:
> **304 passed**. After P3-30 ran for real:
> **300 passed**. After P3-27 ran for real:
> **297 passed**. After P3-26 ran for real:
> **293 passed**. After P4-2 (23/10) ran for real:
> **278 passed** (~196 s). After P4 (23/10) ran for real:
> **274 passed** (~268 s). After P3-20 (23/10) ran for real:
> **266 passed** (~193 s). After P3-15 (22/10) ran for real:
> **188 passed**. After P2-5 (21/10) ran for real:
> **183 passed**, **~190 s**. The previous suite (after P3-4, 20/10) ran for real:
> **177 passed**, **~180 s**. The previous suite (after P1-11, 16/10) ran for real:
> **166 passed**, **~152 s** (2 runs: 154,63 s / 149,33 s) — timings are only comparable
> within **the same suite**, don't compare against older ones.
> See §1.1 to understand why there are two numbers. No
> other file in the repo records this — don't duplicate it into `AGENTS.md` or templates.
> When adding cases, edit this line and commit accordingly.

### 1.1. Two numbers: 355 functions and 360 items are both correct, measuring two different things

| Number | What it is | How to measure |
|---:|---|---|
| **355** | **functions** `def test_*` defined | `Select-String 'def test_'` |
| **360** | **collected pytest items** | `pytest --collect-only` |

The **+5** gap comes from exactly one test parametrized 6 times:
`test_orphan_images.py:255` — `test_cleanup_rejects_paths_outside_image_storage`
takes 6 `bad_path` values. 355 functions + 5 copies = **360 items**.

**Which number is the gate? → 309.** That is what pytest prints. If you see
`261 passed` then 5 cases were lost even though the total function count is still 261. Likewise, `267 passed`
is not an error — new tests may have been added; that's fine.

### Isolation

`tests/conftest.py` forces the env **before importing the app**:

```python
os.environ["ENVIRONMENT"] = "testing"
load_dotenv(".env.test", override=True)
assert "Test" in os.environ["DATABASE_URL"]   # abort trước cả khi import app
```

That guard is why tests can wipe data in bulk. Don't weaken it.

Four autouse fixtures:

| Fixture | What it does |
|---|---|
| `reset_rate_limiter` | `limiter.reset()` before and after each test — SlowAPI is in-memory |
| `reset_storage_quota_cache` | `StorageQuotaService.reset()` on both ends |
| `setup_test_db` | `connect_db()` → `delete_many` **all 7 tables in FK order** → seed admin → yield → delete again → `disconnect_db()` |
| `from_ip` | factory returning an `AsyncClient` with `ASGITransport(client=(ip, port))` |

`from_ip`'s docstring stresses it must be a **real peer address**, not a fake
header — otherwise tests pass even though the implementation never reads the peer.

**The filesystem is NOT wiped.** `storage_test/` accumulates images across runs.
That's why `test_orphan_images.py` has the `_mine(report, *stems)` and
`_exists(path)` helpers instead of asserting on global state.

### Test map

| File | Lines | Cases | Covers |
|---|---:|---:|---|
| `test_intake_security.py` | 360 | 24 | PIN CSPRNG, lockout, IP-binding without re-bind, no `raw_image_path` leak when denied, rate limit |
| `test_analytics.py` | 277 | 11 | **financial logic** (P3-4): global totals + savings %, grouping by month, **no `purchase_date` ⇒ use `createdAt`**, publisher allocation (books/series/accessories, null publisher), wishlist missing volumes, **division by 0 ⇒ 0.0 not ZeroDivision**, fractional/volume-0 excluded, **zero purchase price excluded from average** |
| `test_excel_export_perf.py` | 250 | 12 | cache hit faster than miss, LRU eviction, **no N+1** (assert `find_unique == 0`), alpha images → white background |
| `test_orphan_images.py` | 481 | 32 | stem-vs-filename, 6 path traversal variants, **TOCTOU re-verify**, cap 2000 paths, **DB→file direction: report records pointing at missing images**, **scan/cleanup off-loop — `threading.get_ident()` (P1-11 remainder)**, **P3-27: orphan scan & missing images for BookmarkWork (DB 2)** |
| `test_storage_quota.py` | 214 | 12 | 507 when over quota, **rejected batch is atomic — 0 files slip through**, low-free-disk blocks even with quota left, **storage-stats off-loop (P1-11 remainder)** |
| `test_backup.py` | 613 | 31 | round-trip, keeps `purchaseDate`, **rollback on mid-way failure**, payload not mutated, **snapshot without `users` + old payload still restorable**, **5 writes no name collision + retention doesn't delete wrong files**, **4 restore-failure branches return the right message + right HTTP code (#5)**, **render runs off-loop — `threading.get_ident()` (P1-1)** |
| `test_intake_batch.py` | 112 | 8 | per-item failure isolation, **≤1 snapshot per batch** |
| `test_image_processing.py` | 185 | 7 | event-loop heartbeat ratio (inline 5,4–6,5% → `to_thread` 77,7–111,1%) + **3 structural tests** `threading.get_ident()`: quota rescan (P1-11), Pillow encode (P1-7), mkdir + raw write (P1-11 remainder) |
| `test_excel.py` | 106 | 2 | export round-trip, template → import → verify DB |
| `test_intake_ws.py` | 121 | 5 | **P3-15**: dead socket **doesn't** leak (`finally: disconnect`), heartbeat accepts both `"ping"` and `"PING"`, disconnect cleans up connection, unknown session → close 1008 — **fake WebSocket** calls the endpoint directly (not `TestClient.websocket_connect` ⇒ hangs) |
| `test_intake.py` | 110 | 4 | session lifecycle, wrong PIN upload → 401 |
| `test_intake_e2e.py` | 85 | 4 | 21 files → 400 "giới hạn tối đa" |
| `test_storage_auth.py` | 146 | 13 | `/storage` 401 when file **doesn't exist** (not 404), path traversal blocked, **`backups/` 404 even with a token**, traversal `raw/../backups/`, regression: images still 200 |
| `test_accessories.py` | 108 | 2 | CRUD + orphan filter, publisher relation & publisherId index (P3-35) |
| `test_books.py` | 195 | 8 | bulk-create 5 volumes + dynamic stats, **reorder rollback on mid-way failure (books + accessories)** |
| `test_series.py` | 185 | 1 | chain publisher → edition → series |
| `test_series_service.py` | 360 | 22 | **P3-20**: `_integer_volumes`/`_max_volume`/`_completion_rate` (metric formulas, P2-5/P3-8), book + accessory sort via behavior, `publisher_id="none"` → null, 1 snapshot per write |
| `test_analytics_service.py` | 244 | 15 | **P3-20**: division by 0 ⇒ 0.0, grouping by month (`purchaseDate` → `createdAt`), publisher % when total spend = 0, null publisher, wishlist estimated by average purchase price, fractional volumes excluded |
| `test_excel_service.py` | 180 | 26 | **P3-20**: `sanitize_sheet_title` (forbidden chars, 30 chars, duplicate names), `get_thumbnail_path`, resize/JPEG/alpha→white, LRU cache |
| `test_image_service.py` | 175 | 15 | **P3-20**: `validate_image_file` (15 MB, MIME, fake extension), writes 3 files, quota checked **before** writing, fake `.jpg` → PNG, storage stats |
| `test_auth.py` | 59 | 6 | login rate limit 5/min → 6th attempt is 429 |
| `test_external_image.py` | 237 | 15 | **P3-26**: SSRF guard, private IP/scheme rejected, auto referer, magic byte validation, streaming limit, bookmark cover upload/delete endpoint |
| `test_bookmarks.py` | 565 | 16 | bookmark/author CRUD, filter/unaccent search (P3-33: DB-level pagination & stats, 2-way unaccent + fallback, alphabetical sort), rate limit (+3 HTTP 429 rate-limit cases), P3-34: bulk operations (batch update & batch delete) + 1-snapshot check, P3-35: unique author name constraint & index orderNumber/updatedAt/url |
| `conftest.py` | 119 | — | isolation |

### Notable: real performance tests

`test_image_processing.py` measures the **event loop heartbeat** instead of just
asserting output, and pins it down further with **structural tests**
(`threading.get_ident()`) so it doesn't depend on timing — see `ARCHITECTURE.md` §2,
the "Heavy I/O must not run on the event loop" section. `test_excel_export_perf.py` patches the Prisma action class to assert
`find_unique == 0`, i.e. it blocks N+1 recurrence. `test_backup.py` monkeypatches
`_insert_payload` to prove rollback. This is a much higher discipline than
average — when writing new tests, follow this discipline.

## 2. Frontend + mobile — vitest (P3-20)

| App | Framework | Script | Cases |
|---|---|---|---|
| `backend/` | pytest | ✔ | 360 items (355 functions) |
| `frontend/` | **vitest 5** | ✔ `npm test` | **506** (46 files) |
| `mobile/` | **vitest 5** | ✔ `npm test` | **58** (4 files) |

`vitest` is a **devDependency** in both apps (P3-20, approved by the user). Config:
`frontend/vitest.config.mts`, `mobile/vitest.config.mts` — `environment: 'node'`,
`pool: 'forks'`, `maxWorkers: 1`, `isolate: false`, `fileParallelism: false`.
The pool pins 1 worker because dev machines usually run many servers + tight RAM ⇒
multi-worker dies at startup; 158 + 44 cases run in < 1 s so no speed is lost.

| App | Test file | Cases | Covers |
|---|---|---:|---|
| FE | `src/lib/api.test.ts` | 34 | `apiFetch` (401 → `/login`, error parsing), `ApiError`, `formatVND`, `formatDate`, `getImageUrl`, `downloadFile`, `getThumbnailUrl` |
| FE | `src/lib/config.test.ts` | 8 | `API_PORT`/`API_BASE_URL`/`STORAGE_BASE_URL` from `NEXT_PUBLIC_*` |
| FE | `src/lib/intake.test.ts` | 9 | 4 intake bridge functions (session, pair, status, WS URL) |
| FE | `src/lib/bookmarks.test.ts` | 30 | bookmark helpers, uploadBookmarkCover (P3-38), batchUpdateBookmarks & batchDeleteBookmarks (P3-34), client pagination, query sanitization, page computation, author filter, domain, URLSearchParams (P3-32) |
| FE | `src/lib/linkParser.test.ts` | 6 | link extraction parser, markdown URLs, noise filtering, 3-basket classification |
| FE | `src/lib/coverDropHelper.test.ts` | 32 | file extraction, HTML `<img>`, proxied external URLs, Base64, RFC 2483 uri-list |
| FE | `src/lib/bookmarkShortcuts.test.ts` | 35 | shortcuts: arrow-key navigation / J-K / H-L, numeric selection 1..9, actions E / V / Del / ?, form/modal/modifier guards |
| FE | `src/lib/workspace/*.test.ts` (17 files) + `engine/AvatarController.test.ts` | 120 | **P3-52 + P5-1** — iso round-trip, A* (obstacles/unreachable/straight path), **collision circle-vs-tile** (slide along walls, self-rounding on convex corners, no tunneling across sub-steps), **string-pulling smoothing** (LOS with margin r, a 0-width diagonal gap is impassable — physical truth), **camera** (zoom-at-cursor invariant, deadzone, clamp 24×24 + 32×32), **particle pool** (recycle/cap/wrap), enter/exit hysteresis, roomLayout reachability SPAWN→every zone, **AvatarController** (acceleration curve, diagonal==cardinal, 500-step property test without wall clipping, arrive fires exactly once), bookmark paging stops correctly, mapping (only multi-volume sets at 100% get cut, unread codes), spine layout without overflow, soundscape mood tables, prefs localStorage, useDebounce |
| FE | `src/lib/viewTransitions.test.ts` | 4 | `safeViewTransition` helper, safe fallback when the API is missing, sync & async callbacks |
| mobile | `src/services/intakeApi.test.ts` | 20 | `Promise.any` over multiple candidate IPs, `AuthError` short-circuit, upload/pair/status |
| mobile | `src/services/intakeStorage.test.ts` | 12 | persist/hydrate state, TTL, AsyncStorage errors |
| mobile | `src/services/imageOptimizer.test.ts` | 12 | resize/rotate/JPEG 0.82, manipulator error branch |

**Not** installing `@testing-library/react` / `jsdom`: the selected files are all
pure logic; `api.test.ts` stubs `window`/`document` itself via `vi.stubGlobal`.
Component tests still **don't exist** — don't pretend `npm test` covers the UI.

⚠️ **Exception (P3-10, 21/10):** `normalizeIntakeBaseUrl()` (`mobile/src/services/intakeUrl.ts`)
still has its own gate `scripts/verify-mobile-url.mjs` (12 cases). Not moved to
vitest in order to **keep 2 layers of protection** (the script works even when
`npm ci` hasn't installed vitest yet). The `--legacy` flag runs the old logic ⇒ it must
**FAIL 5/12** (the gate's mutation test).

The two old frontend gate scripts are kept as-is (see §6): `verify-intake-ws.mjs`
(24 cases) and `verify-orphan-reorder.mjs` (25 cases).

### 2.1 Testing on a **real device** (P3-16, 22/10)

`mobile/` has **no** test framework, but the intake flow **can** be tested by hand
on a real phone — requires the app to run on the device:

| Route | Requirements | Native app? | Hot reload |
|---|---|---|---|
| **A. Standalone APK** (recommended) | Expo account + `npx eas-cli init` (once) → `npm run build:apk` (~5–15 minutes) | ✅ | ❌ (release build ⇒ code changes require a rebuild) |
| **B. Sideload Expo Go SDK 54** | Android + APK from `github.com/expo/expo-go-releases/releases` | ✅ | ✅ |
| **C. Web in the phone's browser** | `npm run tunnel` → open the https URL | ❌ | ✅ |

⚠️ **Expo Go only runs apps with the SAME SDK** (latest + the one before). The project is on
**SDK 54** ⇒ Expo Go **SDK 57** says *"Project is incompatible with this version of Expo Go"* ⇒ you must
use route A or B. **Do not** upgrade the SDK (a 2-major migration).

🔴 **Route A (APK) requires plain HTTP** (P3-17, 22/10): the app calls `http://<LAN-IP>:8000`; Android
9+ **blocks plain HTTP** ⇒ the release build must have `android:usesCleartextTraffic="true"` (enabled
via the `mobile/plugins/withCleartextTraffic.js` plugin). Missing it ⇒ **"Network request failed"**
⇒ **not** a network/firewall problem. **Route B (Expo Go) is unaffected** ⇒ easy to misread as a broken app.
⇒ **After editing `mobile/` code you must rebuild the APK** to see the change (release build).

⇒ **The test procedure** (5 steps) lives in `drafts/plans/102026_13_done/task.md`
(ticket **P3-13**) — **ran on 22/10 on a real device: 5/5 PASS** (Expo Go + tunnel build):
images survive app kill · images survive **> 1 h** (beyond the 15′ TTL) · sending images to web succeeds (IP
without port still connects) · **Realtime Bridge turns green** (images appear without F5) ·
end session → kill app → reopen clean. Filled sheet: `drafts/tests/P3-13_device_intake.md`.
⇒ **Still open:** **P3-16** — the **standalone APK** route (no Expo Go, no tunnel) unverified
after fixing **P3-17** (the previous release build was blocked by Android's plain-HTTP rule ⇒ *"Network request failed"*).

**Practical consequence:** `npm test` has existed since P3-20 but only covers **pure logic**
(FE `src/lib`, mobile `src/services`). **Component/UI tests still don't exist** —
don't report "UI tested" after running `npm test`. The full gate for FE/mobile is:

```bash
cd frontend && npm test && npm run lint && npm run build
cd mobile   && npm test && npx tsc --noEmit
```

Next.js `build` type-checks; mobile's `tsc --noEmit` type-checks. That is
everything currently protecting 10.462 lines of frontend and 2.829 lines of mobile.

Since P3-2 there is also `node scripts/verify.mjs` running all **12 gates** with one command — see §6.

## 3. Config

`backend/pytest.ini`:

```ini
asyncio_mode = auto
asyncio_default_fixture_loop_scope = function
pythonpath = . ..
testpaths = tests backend/tests
```

`pythonpath` matches the `sys.path` bootstrap in `app/main.py` (it inserts the **repo
root** into the path, so imports resolve from any CWD).

Filters drop `DeprecationWarning` and Pydantic v2 deprecations.

## 4. Manual smoke test

No fixture layer. The backend needs PostgreSQL already running:

```bash
# 1. health — endpoint công khai
curl http://localhost:8000/api/health

# 2. login, lấy cookie
curl -c cookie.txt -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"...","password":"..."}'

# 3. ảnh qua /storage — HttpOnly cookie, thiếu token trả 401 kể cả file tồn tại
curl -b cookie.txt http://localhost:8000/storage/web/books/<uuid>.webp
```

Frontend `npm run dev` → `:3000`. Mobile: `npm run web` (fast, view in
Device Mode) or `npm run tunnel` (real phone).

**Intake requires the same Wi-Fi LAN.** `npm run tunnel` only tunnels Metro, it does
**not** make the backend port reachable. If the phone times out, check the firewall for the
**backend port** (default 8000 — see `PORT` in `backend/.env`) — `intakeApi.ts` already includes the
`netsh` command in its error message.

## 5. Writing new tests

1. **Offline or Test DB.** Never touch the production DB.
2. **Put them in `backend/tests/`**, named `test_<topic>.py`. No scattering.
3. **Reset the limiter and quota cache** — autouse fixtures already handle it, don't redo it.
4. **Assert observable behavior**, not implementation. Test
   `test_excel_export_perf.py` proves the point: it asserts
   `find_unique == 0` (an observable fact on the call log) rather than
   asserting query structure.
5. **Never delete cases to make tests pass.** `pytest` exits 0 even if you delete
   everything — the case count is the only guardrail.

## 6. Gate before commit

**One command — runs all 3 apps:**

```bash
node scripts/verify.mjs          # 12 gates, fail-fast, ~4 minutes
node scripts/verify.mjs --fast   # skip backend tests, ~30 s
```

The script locates python inside `backend/.venv` itself (`-m pytest`), and runs in
fast → slow order (**doc-truth** → **mobile-url** → **port** → **intake-ws** →
**orphan-reorder** → lint → **FE vitest** → type-check → **mobile vitest** →
type-check → build → tests) and **stops immediately**
at the first failing gate, returning that gate's exit code. Created in P3-2;
the 2 `npm test` gates were added in P3-20.

**Gate `docs: truth`** (`scripts/doc-truth.mjs`, added in P3-7 — 21/10): computes the real
line / file / test counts itself and compares them against the numbers recorded in
`docs/ai-context/*` + `AGENTS.md` + the skill file. It was born because doc numbers were
**wrong 6 times** in a single session without any gate catching it. Run standalone:

```bash
node scripts/doc-truth.mjs        # exit 0 = every number in the docs matches reality
```

Also runs in CI (step `Check doc claims against reality` of the `backend` job).

**Gate `port: no hardcode`** (`scripts/verify-no-hardcoded-port.mjs`, added in P3-9 —
21/10): scans the **source** of all 3 apps and FAILs if the literal `8000` appears outside
the 3 config files (`backend/app/core/config.py` · `frontend/src/lib/config.ts` ·
`mobile/src/config.ts`). Before P3-9 this string sat in **13 places / 8 files** spread across
all 3 apps ⇒ changing the port meant hand-editing 13 places. The `--self-test` flag is the
gate's own **mutation test** (4/4: catches violations, no false positives). Run standalone:

```bash
node scripts/verify-no-hardcoded-port.mjs             # exit 0 = the port lives only in config files
node scripts/verify-no-hardcoded-port.mjs --self-test # the gate's mutation test
```

Also runs in CI (step `Verify no hard-coded port` of the `backend` job).

**Gate `intake: ws`** (`scripts/verify-intake-ws.mjs`, added in P3-14 — 22/10): checks the
**WebSocket client of the intake flow** (`frontend/src/lib/intakeWs.ts`). The frontend has no
test framework ⇒ verify by script: compile **1 file** using the `typescript` already present in
`frontend/node_modules`, then assert **24 cases** in Node with a **virtual clock** (injected timers ⇒
**no dependence on real time** ⇒ not flaky) + a fake WebSocket. The module is **self-contained**
(no imports) so `tsc` can compile it independently.

```bash
cd frontend && node ../scripts/verify-intake-ws.mjs   # exit 0 = 24/24 cases
```

Also runs in CI (step `Verify intake WebSocket client` of the `frontend` job).

**Gate `orphan: reorder`** (`scripts/verify-orphan-reorder.mjs`, added in P3-18 — 22/10): checks
**the drag-and-drop logic for orphan items** (`frontend/src/lib/orphanReorder.ts`). The frontend has no
test framework ⇒ verify by script: compile **1 file** using the `typescript` already present in
`frontend/node_modules`, then assert **18 cases** of the pure function + **7 cases** checking that the
`orphan-items/page.tsx` page actually calls the 2 reorder endpoints (`PUT /books/reorder/batch` +
`PUT /accessories/reorder/batch`) and **locks dragging while filtering** ⇒ **25/25**. The `--legacy` flag is
the gate's **mutation test** (old logic: no `sort_order` renumbering + no lock while filtering ⇒
must **FAIL 4/18**).

```bash
cd frontend && node ../scripts/verify-orphan-reorder.mjs           # exit 0 = 25/25 cases
cd frontend && node ../scripts/verify-orphan-reorder.mjs --legacy  # the gate's mutation test
```

Also runs in CI (step `Verify orphan reorder logic` of the `frontend` job).

Manual equivalent:

```bash
node scripts/doc-truth.mjs                                     # số liệu docs
cd backend  && ./.venv/Scripts/python.exe -m pytest tests/ -q   # phải pass, không mất case nào
cd frontend && npm test && npm run lint && npm run build       # vitest + type-check + build
cd mobile   && npm test && npx tsc --noEmit                    # vitest + type-check
```

⚠️ **DO NOT** call `pytest` from PATH — it points to the global Python ⇒ **166 ERROR**
*"You defined no datasource"* that look like a broken repo. Always use `-m pytest` with the python
inside the venv.

Then run `gitnexus detect-changes({scope: "compare", base_ref: "main"})`.

### CI (GitHub Actions) — P3-3

`.github/workflows/ci.yml` runs **3 jobs in parallel** on `ubuntu-latest`:
`backend` (pytest) · `frontend` (vitest + lint + build) · `mobile` (vitest + tsc). Triggers: push to
`main`/`feat/**`/`fix/**`/`chore/**` and PRs → `main`. `concurrency` cancels old runs (private repo:
2.000 minutes/month).

**4 CI traps already hit — don't reintroduce them** (details + fixes in `known-issues.md` P3-3):

| # | Trap | Consequence if forgotten |
|---|---|---|
| 1 | `prisma` CLI finds `python` via `PATH` | No venv in `PATH` ⇒ client lands in user-site ⇒ import fails |
| 2 | `backend/.env.test` is **not** tracked | CI must generate it from `backend/.env.example` itself |
| 3 | `conftest.py` `load_dotenv(..., override=True)` | The `.env.test` file wins over CI env vars |
| 4 | ~~`npm ci` in `mobile/` fails with ERESOLVE~~ | **Fixed 22/10** — `lucide-react-native` `0.475` → `0.511` (peer `react <=19`) ⇒ `npm ci` no longer needs `--legacy-peer-deps` (same for EAS Build) |

Additionally `backend/prisma/schema.prisma` no longer has an `output` line (Windows
path) — the client is generated into the site-packages of the active venv.
