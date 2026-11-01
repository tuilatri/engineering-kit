# MODULE_MAP.md

Line counts: after #5 / P1-3 / P1-2 / P1-1 / P1-11 remainder / P1-4 (16/10). Three independent apps, no cross-imports.

---

## backend/app — FastAPI · 8.835 lines

> **Line counting convention:** *non-empty lines* — `Get-Content <file> | Measure-Object -Line`
> (PowerShell `-Line` does **not** count empty lines). Use `git ls-files` to count
> tracked files only. Counting empty lines too (`(Get-Content f).Count`) gives a different number ~15% higher —
> don't cross-compare the two measures. The `backend/` figure (app + tests + `__init__.py`)
> is **9.332**.

| File | Lines | Role |
|---|---:|---|
| `main.py` | 156 | app, lifespan, CORS (LAN regex), `AuthenticatedStaticFiles` mount `/storage` (allowlist `raw/`+`web/`), 10 routers, WS alias |
| `__init__.py` | 1 | sys.path bootstrap |

### `backend/app/api/` — routing + auth dependency

| File | Lines | Endpoints |
|---|---:|---|
| `intake.py` | 366 | 5 HTTP + 1 WS — phone photo intake gateway; TOTAL batch quota via `to_thread` |
| `books.py` | 223 | 9 — includes `/batch`, `/bulk-create`, `/move-to-series` |
| `accessories.py` | 167 | 7 — includes `/batch`, `/reorder/batch` |
| `publishers.py` | 108 | 7 — publisher + nested edition |
| `excel.py` | 113 | 4 — export, template, import, import-legacy |
| `auth.py` | 106 | 5 — login/logout/me/change-password/verify-password |
| `media.py` | 109 | 5 — upload, storage-stats, orphan scan + cleanup, **missing-images** (the reverse direction); storage-stats `to_thread` (16/10) |
| `series.py` | 55 | 6 |
| `deps.py` | 55 | `get_current_user` (has DB hit) vs `has_valid_access_token` (only verifies JWT) |
| `backups.py` | 79 | 4 — logs, create-manual, restore/{id}, restore-json; **maps 4 restore outcomes → 4 HTTP codes** (#5) |
| `analytics.py` | 8 | 1 — `/financial-summary` |
| `bookmarks.py` | 315 | 19 — Bookmarks domain routing, metadata, authors, works CRUD, covers, status stats, backups, excel sync, link import & dup check, batch update/delete, rate limiting for 8 sensitive endpoints |

### `backend/app/services/` — business logic

| File | Lines | Role |
|---|---:|---|
| `excel_service.py` | 780 | export 5 sheet types + embedded images; flat import. LRU cache of 5.000 thumbnails, builds the workbook in `to_thread` |
| `legacy_import_service.py` | 639 | parses `drafts.xlsx` with embedded images; hardcoded series-code lookup table; splits combo volume price |
| `intake_service.py` | 299 | session, PIN, LAN IP discovery, WS manager, chunking · `port` default taken from `settings.PORT` (**P3-9**) |
| `backup_service.py` | 413 | GZIP snapshot of 5 tables (**excludes** `users`), renders JSON+gzip in `to_thread` (P1-1), **filename has microseconds + dedup suffix**, retention 30, restore transaction 5 minutes in chunks of 500, restore returns **named outcomes** (`RESTORE_*`) instead of `bool` |
| `bookmark_backup_service.py` | 338 | GZIP snapshot of 7 Bookmarks tables, rolling retention 30, atomic restore |
| `bookmark_cache_service.py` | 75 | In-memory TTL cache (30m metadata, 5m stats), auto-invalidation on write |
| `bookmark_service.py` | 690 | Bookmarks CRUD, DB-level pagination optimization, SQL GROUP BY stats, PostgreSQL unaccent search + fallback, off-thread snapshots, link import, batch update/delete |
| `series_service.py` | 303 | **dynamic stats**: owned/unique/physical/missing volumes. `completion_rate_percent` = whole volumes currently owned / largest volume **currently owned** (P2-5) |
| `orphan_image_service.py` | 247 | scans **orphan images** (files nobody uses) by stem, path-traversal guard, TOCTOU re-verify; scan/cleanup run in `to_thread` (16/10) |
| `missing_image_service.py` | 118 | scans the **reverse direction**: DB records pointing at lost images. Pure read, `to_thread`, no logging |
| `book_service.py` | 201 | CRUD + extracts `volume_number` from display/title, **atomic reorder inside `prisma.tx()`** |
| `image_service.py` | 186 | dual storage + thumbnail; Pillow, quota check **and** mkdir + raw write all off-thread |
| `external_image_service.py` | 287 | safe external image download (SSRF guard, 15MB streaming limit, PIL validation, Smart Referer) |
| `storage_quota.py` | 148 | quota + free-disk safety net, 300 s cache; **async** callers must go through `to_thread` |
| `analytics_service.py` | 139 | monthly spend, publisher split, wishlist estimate |
| `accessory_service.py` | 133 | CRUD + reorder, **atomic inside `prisma.tx()`** |
| `publisher_service.py` | 81 | CRUD publisher + edition |
| `intake_service` ⇄ `api/intake.py` | — | service holds state, router holds HTTP |

### `backend/app/core/` + `schemas/`

| File | Lines | Role |
|---|---:|---|
| `core/config.py` | 107 | Settings. `_require_env` throws **at class definition time**; the `_anchor_storage_paths` validator anchors storage paths to `BACKEND_DIR` |
| `core/security.py` | 44 | Argon2id + JWT; Fernet + delete helpers removed at P2-7 (0 consumers, kept `ENCRYPTION_SALT`) |
| `core/database.py` | 59 | Prisma lifecycle, creates 13 directories, seeds admin if the `users` table is empty |
| `core/bookmarks_database.py` | 102 | Prisma lifecycle for the Bookmark Collection DB 2 |
| `core/limiter.py` | 7 | SlowAPI limiter, split out to avoid circular import |
| `schemas/book.py` | 90 | | 
| `schemas/series.py` | 80 | |
| `schemas/accessory.py` | 55 | |
| `schemas/publisher.py` | 42 | |
| `schemas/intake.py` | 36 | note `P1-7` about `max_files_per_batch` |
| `schemas/analytics.py` | 33 | |
| `schemas/auth.py` | 26 | |
| `schemas/backup.py` | 16 | |
| `schemas/bookmark.py` | 165 | Pydantic schemas for the Bookmarks domain |

### Other backend

| Path | Lines | Role |
|---|---:|---|
| `prisma/schema.prisma` | 128 | 7 models + 8 FK indexes (P1-3, P3-35). **No `migrations/`** — `prisma db push` is the source of truth |
| `prisma/bookmarks_schema.prisma` | 116 | schema for the Bookmark Collection DB 2 (P3-25, P3-35: uq_authors_name + 4 indexes) |
| `tests/` | 6.757 | 30 files, 360 items / 355 functions — see `TESTING_GUIDE.md` §1. **P3-20** added 4 service-level unit test files: `test_series_service.py` (360) · `test_analytics_service.py` (244) · `test_excel_service.py` (180) · `test_image_service.py` (175); **P3-26** added `test_external_image.py` (237) |

---

## frontend/src — Next.js 16 App Router · 37.003 lines · 206 files

### `app/` — 9 routes, all `'use client'`

| File | Lines | Role |
|---|---:|---|
| `orphan-items/page.tsx` | 1095 | standalone items — 3 tabs × 2 view modes = 5 render branches; 6 `<div onClick>` → `Button variant="ghost"` (P2-6 slice 4). **P3-18 — 2-band drag-and-drop** (standalone books + standalone accessories) calling `PUT /books/reorder/batch` + `/accessories/reorder/batch`; **locked while filtering** (avoids duplicate `sort_order`) |
| `settings/page.tsx` | 886 | admin: Excel sync, backup, quota, orphan cleanup, password change; 3 `htmlFor` on the password change form (P2-6 slice 1) |
| `series/[id]/page.tsx` | 474 | series detail; **uses `use(params)`** (React 19 async params); reorder = optimistic mutate; status badge = `SeriesStatusBadge` (P2-4); cover hero `<div onClick>` → `Button` (P2-6 slice 4); the "Số Tập Đã Có" badge has a **sub-line** `% hoàn thành` (P2-5) |
| `bookmarks/page.tsx` | 1526 | manga Bookmark management page, stats, 2-tier filtering (P7-3 roomy Search Bar + View Mode, category filter & sorting, strip of active filter chips), server-side pagination, Quick-Drop drag-and-drop cover swap directly outside the Grid, keyboard shortcut system (P3-31), multi-select with checkboxes (Grid & List Row) & Glassmorphic Floating Action Bar toolbar for bulk operations (change status, category, delete - P3-34) |
| `analytics/page.tsx` | 278 | financial stats, pure CSS bars. **A 0% bar now renders as a real 0%** (P3-8 — previously `Math.max(...,5)`/`(...,4)` made the bars total over 100%) |
| `publishers/page.tsx` | 260 | publishers + editions |
| `page.tsx` | 207 | dashboard: 3 parallel SWR keys → 4 KPIs + `SpreadsheetGrid` |
| `login/page.tsx` | 138 | not wrapped in `AppShell`; 2 `Input` + 2 `Button` (`ui/`) since P2-3 slice 1 |
| `error.tsx` | 38 | root error boundary — Next 16 `retry` prop, wraps `AppShell` |
| `layout.tsx` | 42 | dark **hard-locked**; wraps `Providers` (SWRConfig) |
| `providers.tsx` | 23 | `SWRConfig`: `dedupingInterval` 60s, focus-revalidate disabled |
| `globals.css` | 243 | Tailwind v4 CSS-first + `.glass-panel` + shadcn HSL vars + `@theme inline` (P2-2) + `@media (prefers-reduced-motion)` (P2-6 slice 1) |

### `components/`

| File | Lines | Role |
|---|---:|---|
| `intake/MobileIntakeDialog.tsx` | 1158 | **largest in the FE repo**. 2 modes (single/batch) × 2 steps (scan/review); image card = `role="checkbox"` + `aria-checked` + `tabIndex=0` + Space/Enter, **with the `e.target !== e.currentTarget` guard** so `preventDefault` doesn't kill child buttons (P2-6 slice 4) |
| `series/SpreadsheetGrid.tsx` | 490 | Excel-style grid, client-side filter/sort/pagination; search cell = `Input`, 8 buttons = `Button` (P2-3 slice 1); status badge = `SeriesStatusBadge` — the local `getStatusBadge` function was removed (P2-4); cover thumbnail `<div onClick>` → `Button` keeping `h-14` (P2-6 slice 4) |
| `series/SeriesStatusBadge.tsx` | 59 | **created at P2-4** — the single source of truth for the 4-status series badge, shared by dashboard + detail; the `SeriesStatus` type is **derived** from `SeriesSummary['status']` so adding a new status gets caught by tsc |
| `books/BookFormModal.tsx` | 449 | two-way sync `volume_number` ↔ `volume_display`; 6 `<Input>` + 2 `<Button>` (P2-3 slice 2A); 5 `htmlFor` for Select/Combobox/DatePicker (P2-6 slice 1) |
| `bookmarks/BookmarkFormModal.tsx` | 836 | bookmark create/edit modal, adjusts state in the render phase (no useEffect), shadcn/ui |
| `bookmarks/BookmarkPaginationBar.tsx` | 197 | bookmark pagination control bar: size Select, buttons, smart ellipsis |
| `bookmarks/BookmarkShortcutsHelpModal.tsx` | 193 | modal showing the keyboard shortcut table (P3-31), dark glassmorphism, grouped hotkeys |
| `bookmarks/ImportBookmarkLinksModal.tsx` | 737 | modal importing bookmarks from links/files, 3-bucket triage, DB duplicate review |
| `bookmarks/UnrecognizedLinksDialog.tsx` | 193 | popup managing unrecognized web links, copy/save file/send to preview |
| `series/VolumeGrid.tsx` | 405 | horizontal DnD — **books only**, see `ARCHITECTURE.md` §4; 6 icon-only buttons = `Button variant="ghost"` (`h-[22px] w-[22px] rounded-lg`), with `aria-label` + `title` (P2-3 slice 4). **The drag handle is a separate `div` in the header** — comes with `tabindex=0`+`role=button`+keyboard DnD from `@hello-pangea/dnd`; added `aria-label={`Di chuyển ${volLabel}`}` (P2-6 slice 3). 4 `<div onClick>` (2 covers + 2 `+` cells) → `Button` (P2-6 slice 4) |
| `series/SymmetricalBlocks.tsx` | 366 | books ↔ accessories symmetric layout; 6 icon-only buttons = `Button variant="ghost"` — 4 buttons `h-[26px] rounded-lg`, 2 buttons `h-[20px] rounded-md`; **L344/L350 previously had neither `title` nor `aria-label`** (P2-3 slice 4); 3 thumbnail images `<div onClick>` → `Button`, keeping `h-36/h-40`, `h-10`, `h-12` (P2-6 slice 4) |
| `accessories/AccessoryFormModal.tsx` | 395 | 2 `Combobox`: series + book; 4 `<Input>` + 2 `<Button>` (P2-3 slice 2A); 5 `htmlFor` for Select/Combobox/DatePicker (P2-6 slice 1) |
| `series/SeriesModal.tsx` | 279 | cover upload |
| `storage/OrphanCleanupPanel.tsx` | 251 | state machine `idle→scanning→scanned→cleaning` |
| `books/BulkCreateModal.tsx` | 235 | hard limit 150 volumes per batch (client-side only); 5 `<Input>` + 2 `<Button>` (P2-3 slice 2B) |
| `layout/Navbar.tsx` | 232 | 2 icon-only buttons = `Button variant="ghost"` + VI `aria-label` (logout + state-dependent burger), 0 pixel change (P2-6 slice 3); the "Bảo mật Master Key" chip is a **feature description**, not a status (P2-8); **P3-52** added the "Thư Phòng" nav item (`/workspace`, `Armchair` icon); **P5-4** restructured into two tiers (Two-Tier Modern Glass Header) eliminating 100% of the 7-tab text clipping errors |
| `publishers/EditionModal.tsx` | 147 | 2 `<Input>` + 1 `<Textarea>` + 2 `<Button>` (P2-3 slice 2B) |
| `publishers/PublisherModal.tsx` | 140 | 2 `<Input>` + 1 `<Textarea>` + 2 `<Button>` (P2-3 slice 2B) |
| `components/ui/*` | 12 files · 1.074 lines | shadcn + hand-written, see `FRONTEND_MAP.md`. `slider.tsx` was removed at P2-7 (0 consumers) |
| `layout/AppShell.tsx` | 28 | |
| `layout/ErrorPanel.tsx` | 28 | shared error panel + "Thử lại" → `refreshAll()` |

### `lib/` + `types/`

| File | Lines | Role |
|---|---:|---|
| `types/index.ts` | 306 | domain models; money typed as `string \| number` because Postgres numeric returns string |
| `lib/bookmarks.ts` | 190 | API client for bookmarks: works CRUD, metadata, authors, cover upload, restore, batchUpdateBookmarks, batchDeleteBookmarks (P3-34) |
| `lib/pagination.ts` | 70 | pagination math helpers: calculateTotalPages, calculateItemRange, generatePageNumbers |
| `lib/api.ts` | 241 | `apiFetch`, `ApiError`, `formatVND`, `formatDate`, `getImageUrl`, `downloadFile` |
| `lib/config.ts` | 19 | **P3-9** — `API_PORT` + `API_BASE_URL` + `STORAGE_BASE_URL`; the web's source of the port (`NEXT_PUBLIC_*`) |
| `lib/swr.ts` | 6 | `fetcher` (wraps `apiFetch`) + `refreshAll` — SWR cache layer, see `FRONTEND_MAP.md` §9 |
| `lib/intake.ts` | 57 | 4 bridge functions. WS URL takes the port from `lib/config.ts` (**P3-9** — previously hard-coded 8000). `getIntakeSessionStatus()` had **0 call sites before P3-14** ⇒ now used to hydrate the gallery |
| `lib/intakeWs.ts` | 372 | **P3-14** — WebSocket client of the intake flow: ping `"PING"` matching the backend, reconnect + backoff, PONG watchdog, gallery hydration. **Self-contained (no imports)** ⇒ the Node gate can compile a single file |
| `lib/orphanReorder.ts` | 64 | **P3-18** — pure drag-and-drop reorder logic for standalone items: `reorderList` (splice + renumber `sort_order` 1..N) · `toReorderItems` (`ReorderRequest` payload) · `isReorderEnabled` (lock while filtering) + 2 endpoints + 2 SWR keys. **No React imports** ⇒ the Node gate can compile a single file |
| `lib/utils.ts` | 5 | `cn()` |
| `lib/linkParser.ts` | 368 | link extraction engine, ordinal detection, domain heuristics, URL normalization |
| `lib/linkParser.test.ts` | 97 | vitest: tests link parsing against 55 real files |
| `lib/api.test.ts` | 344 | **P3-20** — vitest: `apiFetch` (401 → login, error parsing, `ApiError`), `formatVND`, `formatDate`, `getImageUrl`, `downloadFile` |
| `lib/config.test.ts` | 61 | **P3-20** — vitest: `API_PORT`/`API_BASE_URL`/`STORAGE_BASE_URL` from `NEXT_PUBLIC_*` |
| `lib/intake.test.ts` | 91 | **P3-20** — vitest: 4 intake bridge functions (session, pair status, WS URL) |
| `lib/bookmarks.test.ts` | 379 | vitest: unit tests for the bookmark API helpers, pagination, batchUpdateBookmarks and batchDeleteBookmarks (P3-34) |
| `lib/coverDropHelper.ts` | 199 | helper extracting multi-source drag-dropped files/URLs from the computer, HTML, uri-list, Base64 |
| `lib/coverDropHelper.test.ts` | 384 | vitest: 32 cases covering drag-drop image extraction |
| `lib/bookmarkShortcuts.ts` | 135 | keyboard shortcut event engine, form/modal/modifier guards, pure logic (P3-31) |
| `lib/bookmarkShortcuts.test.ts` | 204 | vitest: 35 test cases covering shortcuts, guards, index bounds (P3-31) |
| `hooks/useBookmarksShortcuts.ts` | 105 | React Hook wiring window key events, card/row navigation, action callbacks (P3-31) |

### `workspace/` — 2D Virtual Library Room (P3-52 + P5-1 "Cozy 2.0", 27/10)

Pixi.js v8 read-only canvas game. The engine is imported **dynamically** in an effect ⇒ pixi stays out
of the main bundle. Pixel-art atlas generated by script: `scripts/generate_room_atlas.py`
(Pillow, deterministic) → `frontend/public/workspace/cozy_room_atlas.{png,json}`
(1024×512, 180 frames — P11-2). **P5-1**: free movement (circle collision +
string-pulling + accel/decel — no more block-by-block walking), camera follow/fit + wheel
zoom-to-cursor, nearest scaleMode (sharp pixels), additive light layer (6 glows),
particle pools (dust/fireflies/rain/snow/smoke/embers), shelf virtualization +
keyboard nav, prefs localStorage, updateData() (SWR revalidate doesn't reset the avatar).

**Agent roles (P12-1):** `.claude/agents/` — 11 native role files (fe/be/map-artist/qa + mobile/devops/db/security/test-writer/release/doc-writer). Native frontmatter (`name/description/tools/model`); body ONLY references `docs/ai-context/`, no copied content. Project-level overrides global (`~/.claude/agents/`) on name collision.

| File | Lines | Role |
|---|---:|---|
| `app/workspace/page.tsx` | 570 | route `/workspace`, **not** wrapped in `AppShell`; 6 SWR keys (`/books` `/publishers` `/series` `/bookmarks?shelf=all` `/analytics/financial-summary`); Tab (on this page only) → `router.push('/')`; prefs hydrate + lock-aware audio |
| `components/workspace/VirtualRoomCanvas.tsx` | 266 | client wrapper: dynamic engine import **once** (E1: data changes → `engine.updateData()`, no re-creation); `forwardRef` handle `{toggleCameraMode, setAmbient}`; hooks via `useEffectEvent` |
| `components/workspace/WorkspaceHud.tsx` | 398 | HUD: back button, `[E]` prompt, camera toggle, fullscreen, Soundscape panel, stats strip + wishlist cards, aria-live |
| `components/workspace/ShelfViewModal.tsx` | 445 | corner Shelf View popup: **virtualized** (@tanstack/react-virtual — 992 shelves render only ~110 DOM nodes), roving tabindex keyboard nav, sort/filter/search debounce, 🏆 trophy for 100%-complete multi-volume series |
| `components/workspace/ShelfDetailPanel.tsx` | 196 | detail tray: cover + price + note + series summary (author/%/volumes); bookmark: status + alias names + links via `sanitizeBookmarkUrl` |
| `components/workspace/engine/StudyRoomEngine.ts` | 2025 | Pixi v8 engine: 2 camera modes + tween + wheel zoom (lib/workspace/camera.ts), additive light layer + continuously lerped day tint, 3 particle pools, runtime spines, A*→smoothPath click-to-move, normalized WASD, proximity hysteresis (float pos), `updateData()`, visibilitychange pause, debug overlay `NEXT_PUBLIC_WORKSPACE_DEBUG`, reduced-motion, **manual atlas loading** (Assets.load on v8 hangs without `Assets.init()`) |
| `components/workspace/engine/AvatarController.ts` | 295 | **free movement**: velocity + ACCEL 14/DECEL 18, circle-vs-tile collision (wall slide + automatic corner turning), arrive-steering slows near the target, walk-FPS ∝ speed |
| `lib/workspace/` (pure TS, self-contained) | 1758 | `iso` · `pathfinding` (A*) · `collision` (circle-vs-tile + sub-step) · `smoothing` (string-pulling) · `camera` (clamp/zoom/deadzone/lerp) · `particles` (pool) · `hysteresis` · `spineColor` · `dayCycle` · `bookmarkShelf` · `roomLayout` (+PROXIMITY) · `spines` · `mapping` · `soundscape` (generative WebAudio) · `prefs` (localStorage) · `themes` (P7-1 registry of 4 themes) · `useDebounce` · `types` |

Test suite `lib/workspace/*.test.ts` + `engine/AvatarController.test.ts`: **109 cases**
— iso round-trip, A*, collision (slide/corner/no tunneling), smoothing LOS,
camera (zoom invariant/deadzone/lerp), particle pool, hysteresis, reachability
SPAWN→every zone, AvatarController (accel/property 500 steps without wall clipping),
paging, mapping, mood tables, prefs/debounce. Figures measured with the `doc-truth` method.

`src/hooks/` contains `useBookmarksShortcuts.ts` (P3-31) serving the Bookmarks shortcut system.
`components.json` is valid per Tailwind v4 (`"tailwind": { "config": "" }` ⇒
no `tailwind.config.js` needed); the `hooks` alias is only used when `shadcn add` creates
a new hook.

### `public/` — static files served directly by Next

| File | Lines | Role |
|---|---:|---|
| `placeholder-book.svg` | 11 | replacement image for `getImageUrl(null)` — background `#020617`, 3:4 ratio, matches `aspect-[3/4]` |

### `proxy.ts` — Next 16 proxy (formerly "middleware")

| File | Lines | Role |
|---|---:|---|
| `src/proxy.ts` | 17 | optimistic auth gate: missing `book_session_token` cookie → 307 `/login` before render; matcher skips `/login`, `_next`, `favicon.ico` |

---

## mobile — Expo SDK 54 · 3.014 lines

| File | Lines | Role |
|---|---:|---|
| `app/review.tsx` | 584 | rotate 90°, swap tags, upload. UI claimed "đã nén WebP" — **fixed at P2-10** (the compressor is **JPEG 0.82**, only the server converts to WebP), see `ARCHITECTURE.md` §2 |
| `app/index.tsx` | 603 | scan QR or enter PIN manually; `serverUrl` **empty by default** (LAN IP changes per network) — **P3-9** |
| `app/camera.tsx` | 452 | `skipProcessing: true` → rotate the image manually at review |
| `app/_layout.tsx` | 25 | `IntakeProvider` wraps outside `Stack` → state survives all screen transitions |
| `src/config.ts` | 19 | **P3-9** — `API_PORT` (`EXPO_PUBLIC_API_PORT`) + `DEFAULT_SERVER_URL` (`EXPO_PUBLIC_SERVER_URL`, default **empty**) |
| `src/context/IntakeContext.tsx` | 299 | state + **chunking per the `maxFilesPerBatch` the server advertises** + hydrate/persist via AsyncStorage (`P1-8`) |
| `src/services/intakeApi.ts` | 189 | `Promise.any` over all candidate IPs; `AuthError` short-circuit. **Shared URL normalization** `normalizeIntakeBaseUrl()` (P3-10) · port taken from `src/config.ts` (P3-9) |
| `src/services/intakeUrl.ts` | 161 | **P3-10** — `normalizeIntakeBaseUrl()` is a **pure function** (only string ops, **no** `new URL` because Hermes has a partial `URL`) ⇒ runs identically on Node ↔ Hermes and is **testable** |
| `src/services/intakeStorage.ts` | 42 | AsyncStorage key `book-intake-state-v1`: session + images survive app kill (`P1-8`) |
| `src/types/index.ts` | 46 | 7 mobile categories → 2 wire values |
| `src/services/imageOptimizer.ts` | 35 | rotate → cap longest edge at 2000px → JPEG 0.82 |
| `src/services/intakeApi.test.ts` | 217 | **P3-20** — vitest: `Promise.any` candidate IPs, `AuthError` short-circuit, upload/pair/status |
| `src/services/intakeStorage.test.ts` | 121 | **P3-20** — vitest: state persist/hydrate, TTL, AsyncStorage errors |
| `src/services/imageOptimizer.test.ts` | 112 | **P3-20** — vitest: resize/rotate/JPEG quality, manipulator error branches |

---

## Outside source

| Path | Role |
|---|---|
| `docs/ai-context/` | **tracked**. finalized spec — see `README.md` here |
| `drafts/` | **gitignored** (`.gitignore:60`), 0 tracked files. local notes, absent on fresh clones |
| `HOW_TO_RUN.txt` | **gitignored** (`.gitignore:59`). Contains real credentials — read to check configuration, never quote it |
| `storage/` | runtime images + backups. **gitignored** (`.gitignore:33`) |
| `storage_test/` | images created by tests. **gitignored** (`.gitignore:34`), **not** deleted between runs. The `backups/` folder inside **is** cleaned after every test (P2-9) — because `conftest` truncates the log table, retention can't unlink the files |
| `.agent/skills/` | 41 directories / 52 `SKILL.md` files. Loaded via `skill({id})` **after** `opencode.json` declares `skills.paths` — counts change with installation method, don't hard-code |
| `.opencode/skills/` | Skills **written specifically for this repo**. `book-collection-conventions` — 8 rules on snapshot-per-write, dynamic stats, dual storage, intake security invariants, per-app test gate. Loaded via `skill({id})`, no config needed |
