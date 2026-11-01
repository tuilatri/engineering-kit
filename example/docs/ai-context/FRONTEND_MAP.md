# FRONTEND_MAP.md

No Server Components. The data layer is **SWR** (`lib/swr.ts` + `app/providers.tsx`):
cache-first per key, 60s window, mutation → `refreshAll()` (convention
`onSuccess()` → `refreshAll()`) — details in §9. Route protection via `src/proxy.ts`
(Next 16 proxy — formerly "middleware").

## 1. Routes

| Route | File | Lines | SWR key | Notes |
|---|---|---:|---|---|
| `/` | `app/page.tsx` | 207 | 3 | keys `/series` `/publishers` `/analytics/financial-summary` |
| `/series/[id]` | `app/series/[id]/page.tsx` | 474 | 3 | `use(params)` — React 19 async params; book reorder = optimistic mutate (§9); the "Số Tập Đã Có" badge has a **sub-line** `% hoàn thành` (P2-5) |
| `/orphan-items` | `app/orphan-items/page.tsx` | 1095 | 5 | largest file. **3 tabs**: standalone books · standalone accessories · **Missing Images** (DB records pointing at lost images, `GET /media/missing-images`, read-only — no edit buttons). **P3-18 — 2-band drag-and-drop** (standalone books + standalone accessories) calling `PUT /books/reorder/batch` + `/accessories/reorder/batch` (backend already existed, FE previously **did not** call it) — pure logic in `lib/orphanReorder.ts`; **drag locked while filtering by name** (avoids duplicate `sort_order`) |
| `/settings` | `app/settings/page.tsx` | 886 | 3 | `/auth/me` errors are excluded from the shared `error` variable (does not pull `ErrorPanel`). The backup log table renders `log.status` and **disables the Restore button** when ≠ `SUCCESS` — a `FAILED` row has no file behind it |
| `/bookmarks` | `app/bookmarks/page.tsx` | 1526 | 1 | manga Bookmark management page, stats, 2-tier filtering (P7-3 roomy Search Bar + View Mode, category filter & sorting, strip of active filter chips), Grid/Table view modes, server-side pagination, Quick-Drop drag-and-drop cover swap directly outside the Grid, keyboard shortcut system (P3-31), multi-select with checkboxes (Grid & List Row) plus a Glassmorphic Floating Action Bar toolbar for bulk operations (change status, category, delete - P3-34), Export Excel & Import Excel Modal, Import Link/File Modal |
| `/analytics` | `app/analytics/page.tsx` | 278 | 1 | cold-load error → `ErrorPanel` (before P1-4 it was `return null` — blank page) |
| `/publishers` | `app/publishers/page.tsx` | 260 | 1 | response includes nested `editions[]` |
| `/login` | `app/login/page.tsx` | 138 | — | deliberately **not** wrapped in `AppShell`; 2 `Input` + 2 `Button` from `ui/` (P2-3 slice 1) |
| `/workspace` | `app/workspace/page.tsx` | 570 | 5 | **P3-52 Virtual Library Room 2D + P5-1 Cozy 2.0** — Pixi.js v8 dynamic render (`VirtualRoomCanvas` imports the engine once, data changes → `updateData()`); SWR keys `/books` `/publishers` `/series` `/bookmarks?shelf=all` `/analytics/financial-summary`. Free movement (circle collision + string-pulling), camera follow/fit + wheel zoom, light layer + particles, virtualized shelf + keyboard nav, prefs localStorage, lock-aware audio. Deliberately **not** wrapped in `AppShell`; the `Tab` key (on this page only) exits back to `/`. Read-Only showcase. Details in `MODULE_MAP.md` §workspace |

No `loading.tsx`, `not-found.tsx`; there **is** `app/error.tsx` (root error
boundary — Next 16 `retry()` prop, self-wraps `AppShell`). All fetches go through
`useSWR(key, fetcher)` from `lib/swr.ts` — one key per endpoint, naturally
parallel; error panel + retry see §9. Two-tier auth:
**(1)** `src/proxy.ts` (Next 16 proxy — Node runtime) blocks early: missing
`book_session_token` cookie → 307 `/login` **before render**. It only checks that the cookie
**exists** (optimistic) — validity is decided by the backend; matcher skips `/login`,
`_next`, `favicon.ico`. **(2)** client fallback: `apiFetch` sees 401 →
`window.location.href = '/login'` (full page reload, not `router.push`) —
covers the case of a cookie expiring mid-session; the page has already rendered and fetched before the redirect.
⚠️ Cookies are scoped to the **host**: open the app on the exact hostname the API uses (`localhost:3000`
by default) — opening via `127.0.0.1` will not see the cookie and gets stuck at `/login`.

## 2. `MobileIntakeDialog.tsx` (1.158 lines) — state machine

**P3-14 (22/10):** the **transport** portion of the WebSocket was split out to `lib/intakeWs.ts` (355 lines,
pure TS, **no React**) — ping `"PING"` matching the backend, reconnect + backoff, PONG watchdog,
gallery hydration. The component only handles state (gallery/toast). `getIntakeSessionStatus()` previously had
**0 call sites** ⇒ now used to re-hydrate images sent while WS was down. See `ARCHITECTURE.md` §2.

The most complex component in the FE repo. One component serves 3 call sites thanks to **one boolean**:

```
const isSingleMode = Boolean(onSelectImage)
```

```
              isOpen
                │
                ▼
      ┌──────────────────┐   startNewSession()   useEffect([isOpen])
      │ step='scan'      │◄─────────────────────┐
      │ QR + PIN + WS    │                      │ "Quay Lại Chọn Thêm Ảnh"
      │ gallery ảnh live │                      │
      └────────┬─────────┘                      │
               │ handleProceedToReview()        │
               │ điều kiện: ≥1 ảnh đã chọn    │
               ▼                                │
      ┌──────────────────┐                       │
      │ step='review'    │───────────────────────┘
      │ form metadata    │  save → ok   → onClose()
      │ 2 request batch  │  save → lỗi  → ở lại, chỉ gửi lại item fail
      └──────────────────┘
```

| Mode | Call site | Behavior |
|---|---|---|
| **single** | `BookFormModal`, `AccessoryFormModal` | stops at step 1, pick 1 image → `onSelectImage` |
| **batch** | `series/[id]/page.tsx` (prop `series`), `orphan-items/page.tsx` (prop `seriesList`) | runs the full 2 steps |

**Batch save sends 2 requests, not N** (note `P1-7` in source):
one `POST /books/batch` + one `POST /accessories/batch`. The next click **only
re-sends failed items** (`failedItemIds`). A network error marks **every** item in
the batch as retryable; per-item errors map back via `f.index`.

**WebSocket — rebuilt at P3-14 (22/10).** Previously all WS logic lived
inline in `MobileIntakeDialog.tsx` and had 5 bugs confirmed by code reading:
heartbeat sent `{type:'ping'}` (lowercase) while the backend compared `== "PING"` (uppercase,
`backend/app/api/intake.py:357`) ⇒ **never** matched ⇒ server never returned PONG;
**no** `ws.onerror` (network errors only hit the console, UI showed nothing); **no** reconnect
⇒ a dropped socket stayed dead until "Làm Mới Mã QR" was pressed; the `CONNECTED` event was ignored; the
`CLIENT_CONNECTED` branch was **dead code**; `pingInterval` orphaned when a new socket opened.

Now the **transport** lives in `lib/intakeWs.ts` (372 lines, pure TS, **no React**):
ping `{"type":"PING"}` **matches** the backend ⇒ receives PONG; watchdog **45s** without PONG ⇒ treat as
dead (catches **silently** dead TCP connections) ⇒ close + reconnect; reconnect **backoff**
1s→2s→4s→8s→15s (max 5 attempts, error surfaced **exactly once**); `close.code = 1008` (session
already dead) ⇒ **no** reconnect ⇒ report "create a new session"; each (re)connect ⇒ **hydrate**
the gallery via `GET /api/intake/sessions/{id}` (⚠️ endpoint rate-limited at 5/minute ⇒ **do not
poll**; a 429 error ⇒ skip silently) ⇒ recover images sent while WS was down.
The component keeps `useRef` (not state) for the client ⇒ no re-render.
Details of the 17 rules: see `ARCHITECTURE.md` §2 · verify: `scripts/verify-intake-ws.mjs`
(24 cases) — see `TESTING_GUIDE.md` §6.

## 3. `ui/` components — 12 files

| File | Lines | Base | Used where |
|---|---:|---|---|
| `select.tsx` | 146 | Radix `Select` | most-used primitive |
| `combobox.tsx` | 269 | Popover + **hand-written APG listbox** | 5 places; optional `id` prop for `<label htmlFor>` (P2-6 slice 1); listbox upgrade: `aria-controls`+`aria-haspopup` on the trigger, `role="listbox"/"option"`, **roving tabindex**, ↑↓/Home/End/Enter/Space (P2-6 slice 4) |
| `calendar.tsx` | 123 | **hand-written** with date-fns, `vi` locale | via `date-picker` |
| `Lightbox.tsx` | 133 | hand-written | zoom 0.5–3x, raw/WebP toggle |
| `popover.tsx` | 26 | Radix | |
| `checkbox.tsx` | 26 | Radix | `OrphanCleanupPanel` |
| `date-picker.tsx` | 82 | Popover + Calendar | `BookFormModal` · `AccessoryFormModal`; has optional `id` prop (P2-6 slice 1) |
| `Modal.tsx` | 142 | **hand-written, does NOT use Radix Dialog** | all forms + `ConfirmDialog` — **9 render sites**; has `role="dialog"` + `aria-modal` + focus-trap (P2-6 slice 2); backdrop has `aria-hidden="true"` and is **deliberately not** in tab order (P2-6 slice 4); optional prop `contentClassName?: string` (P3-25) allows customizing the modal layout (like the 2-column Split Dialog) |
| `ConfirmDialog.tsx` | 38 | wraps `Modal` + `button.tsx` | 5 pages · 8 flows (7 deletes + 1 backup restore) — P2-1 |
| `button.tsx` | 52 | shadcn + `cva` | `OrphanCleanupPanel` · `ErrorPanel` · `error.tsx` · `ConfirmDialog` · `login/page.tsx` + `series/SpreadsheetGrid.tsx` (P2-3 slice 1); `BookFormModal` + `AccessoryFormModal` (P2-3 slice 2A) and `BulkCreateModal` + `PublisherModal` + `EditionModal` (P2-3 slice 2B) — Cancel uses `variant="secondary"`, submit defaults to `variant="default"` (emerald), always with `gap-2`; `VolumeGrid` + `SymmetricalBlocks` (P2-3 slice 4 — 12 **icon-only** buttons, `variant="ghost"`, hard override of `h/w/p` per the original profile to **change not 1 pixel**, because `size="icon"` in button.tsx locks 40px). `ring-ring`/`ring-offset-background` **only alive since P2-2** (before that they were no-ops) |
| `input.tsx` | 20 | raw `<input>` + `cn` | `login/page.tsx` · `series/SpreadsheetGrid.tsx` (P2-3 slice 1 — previously **0** consumers); `BookFormModal` (6 instances: title/volume-number/volume-display/original-price/purchase-price/note) + `AccessoryFormModal` (4 instances: name/original-price/purchase-price/note) (P2-3 slice 2A); `BulkCreateModal` (5) + `PublisherModal` (2) + `EditionModal` (2) (P2-3 slice 2B) |
| `textarea.tsx` | 19 | raw `<textarea>` + `cn` | `PublisherModal` (rows 3) + `EditionModal` (rows 2) — **created in P2-3 slice 2B**, before that these 2 modals used a raw `<textarea>`. Uses a `type` alias, **not** an empty `interface` (avoids the `no-empty-object-type` error — `input.tsx` was fixed the same way at P3-1) |

`Textarea` mirrors `Input` but drops `h-10` (height comes from `rows`) and drops the `file:*` class group (meaningless for textarea).

### ⛔ Form state must NOT be synced in `useEffect` (P3-1, 20/10)

`useEffect` runs **after paint**. A form modal syncing state from a prop in an effect ⇒ **on the
first frame the state still holds the old/empty value**. Measurable consequence (probe `probe-submit.mjs`):

| | what `PUT /books/{id}` sends |
|---|---|
| **Before P3-1** (sync via `useEffect`) | `publisher_id = null`, `edition_id = null` ⇒ **LOSES PUBLISHER + EDITION** |
| **After P3-1** (adjust state in render phase) | `publisher_id = "pub-1"`, `edition_id = "ed-1"` ⇒ preserved |

The right way — **adjust state in the render phase** (React docs: *"You Might Not Need
an Effect" → "Adjusting some state when a prop changes"*):

```tsx
const [prevSync, setPrevSync] = useState<{ book: Book | null | undefined; isOpen: boolean } | null>(null);
if (prevSync === null || prevSync.book !== book || prevSync.isOpen !== isOpen) {
  setPrevSync({ book, isOpen });
  if (book) { setTitle(book.title); /* … */ } else { setTitle(''); /* … */ }
}
```

- The condition must **exactly match** the old effect's dependency array (including comparing
  **object identity**, not just `id`).
- `prevSync` is initialized to `null` ⇒ the first mount also runs (like an effect's first run).
- **Applied in**: `BookFormModal` · `AccessoryFormModal` · `PublisherModal` ·
  `EditionModal` · `SeriesModal` · `Navbar` · `SpreadsheetGrid` · `Lightbox` ·
  `ui/calendar`.

**Two traps already hit, don't repeat them:**
1. **`useLayoutEffect` does not save you** — the `react-hooks/set-state-in-effect` rule still
   catches it (measured for real at P3-1, not speculation).
2. **Measuring with `MutationObserver` is not enough** — it sees the DOM **before paint**. You must
   measure inside `requestAnimationFrame` (React flushes effects via MessageChannel = macrotask,
   macrotasks run **before** rAF) to know what the user actually sees.

**Effect events for session lifecycle** (`MobileIntakeDialog`): use `useEffectEvent`
(React 19.2) instead of a ref — refs **are not updated during render**
(rule `react-hooks/refs`). Adding `startNewSession`/`cleanupSession` to deps would create an
**infinite loop** because they read `session`.

`Modal.tsx` handles Escape + `document.body.style.overflow='hidden'` itself. **P2-6 slice 2 (18/10)**
added `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (pointing to `<h3>` via `useId()`),
a **focus-trap** and **focus return** to the element that opened it. Three conditions to keep when editing this file:
1. The focusable list is **queried at `Tab` press time**, not cached — `MobileIntakeDialog` generates
   dynamic elements (newly captured photos).
2. **Do not steal focus** on open: only focus if `document.activeElement` is not already inside the
   panel ⇒ keeping `autoFocus` of `ConfirmDialog` (the **Cancel** button, P2-1 decision) is the safe default.
3. On close, only return focus if the original element is **still in the DOM** (after deletion it is gone).

`ConfirmDialog.tsx` (P2-1) replaces the native `confirm()`: Escape **and** backdrop click =
cancel, the **Cancel** button has `autoFocus`, the confirm button is always `variant="destructive"` (default
label `Xoá`, settings passes `Khôi phục`). No focus-trap / `role` — on par with
`Modal`, a global a11y upgrade pending P2-6. Each page keeps **one** pending state
(`{kind, id}` or `{logId, filename}`); the old handler is split into the dialog-opening part (sync,
matching the grids' `(id) => void` prop type) + the API-calling part (async).

`BookmarkFormModal.tsx` (**P3-25**): Converted to a 2-column Split Dialog (`maxWidth="5xl"`, `contentClassName="p-0 overflow-hidden flex flex-col flex-1 min-h-0"`): left column (`md:col-span-7 lg:col-span-8`) holds the metadata form with its own scrollbar (`overflow-y-auto max-h-[68vh]`); right column (`md:col-span-5 lg:col-span-4`) holds an image Dropzone at the standard 2:3 comic ratio, supporting multi-source drag-and-drop images (DOMParser extracting `<img>` from `text/html`, Base64, external URLs via the `POST /api/bookmarks/fetch-image` proxy), clipboard paste (`Ctrl + V`), 4 UX states (no image, dragover glow, proxy loading, hover to swap/remove image). Strictly follows P3-1 (adjust state in render phase) and the Purple Ban.

`BookmarkShortcutsHelpModal.tsx` (**P3-31**): Bookmarks shortcut help modal shown when pressing `?`, dark glassmorphism, visually grouped hotkeys (Navigation, Actions, Dialogs). Closes with `Esc` or clicking outside. Works together with the pure engine `lib/bookmarkShortcuts.ts` and the hook `hooks/useBookmarksShortcuts.ts`.

## 4. `lib/api.ts`

| Function | Job |
|---|---|
| `apiFetch<T>` | the single primitive. `credentials:'include'`. Automatically attaches anti-CSRF headers `X-Requested-With: XMLHttpRequest` and `X-App-Client: Web` (P3-41, SEC-13). Only sets `Content-Type: application/json` when the body is **not** `FormData`. 401 → **hard reload** `/login` (deliberate, see `ARCHITECTURE.md` §5). Empty → `{} as T` if not JSON |
| `errorMessage` | Narrows `unknown` → `Error`, returns `fallback` if not an Error or the message is empty. **Replaces 30 × `err.message \|\| fallback`** (P3-1) — preserves the old semantics |
| `formatVND` | `Intl.NumberFormat('vi-VN', {currency:'VND'})`, accepts `string \| number` |
| `formatDate` | `vi-VN`, returns `'—'` when empty |
| `getImageUrl` | the `preferRaw` parameter was **removed at P3-1** (dead, 0 callers); fallback **has really existed since P2-9**: `/placeholder-book.svg` (SVG in `frontend/public/`, served directly by Next) — before that it was `/placeholder-book.png` which **did not exist** ⇒ 404 |
| `getThumbnailUrl` | (**P3-36**) maps an image to a 400x400 WebP thumbnail (`web/` -> `web/thumbnails/`), keeps external URLs as-is, fallback `/placeholder-book.svg` |
| `downloadFile` | parse `Content-Disposition`, `createObjectURL`, click, revoke |

`importLegacyExcel` and the 2 orphan-image functions **bypass `apiFetch`** because they upload files.

**P3-29 — `lib/coverDropHelper.ts` (199 lines):** a pure-TS helper that extracts multi-source drag-dropped files/URLs from the computer, HTML (`<img>`), `text/uri-list`, Base64 data URLs, and external URLs fetched via the `POST /api/bookmarks/fetch-image` proxy into binary `File`s for direct cover upload (serving Quick-Drop outside the Grid and the dropzone inside the modal). Covered by 32 vitest tests in `coverDropHelper.test.ts`.

**`lib/bookmarks.ts`:** API client for the Bookmarks domain (Dual-DB), covering work CRUD, metadata catalogs, cover upload (`uploadBookmarkCover` - **P3-38**), duplicate link checking, link-list import, and bulk operations (**P3-34**): `batchUpdateBookmarks` (`PATCH /api/bookmarks/batch`) and `batchDeleteBookmarks` (`DELETE /api/bookmarks/batch`). Covered by 30 vitest tests in `bookmarks.test.ts`.

## 5. CSS traps

`animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-top-2`, `custom-scrollbar`
are used in **10 files** but are **not defined** — `tailwindcss-animate` is
not a dependency and `globals.css` has no `@keyframes`/`@utility` at all.

| Group | Files |
|---|---|
| `animate-in` + variants | `ui/Modal.tsx` · `ui/Lightbox.tsx` · `ui/popover.tsx` · `ui/select.tsx` · `layout/AppShell.tsx` · `layout/Navbar.tsx` |
| `custom-scrollbar` | `ui/combobox.tsx` · `series/SpreadsheetGrid.tsx` · `series/VolumeGrid.tsx` · `app/orphan-items/page.tsx` |

These classes are no-ops. Don't "fix" this by adding them to new components.

**P2-2 — fixed 17/10:** `globals.css` has an `@theme inline` block mapping the 19 HSL variables of
`:root` → `--color-*`, so **token classes are alive** (`bg-background`, `border-border`,
`ring-ring`, `ring-offset-background`…). Measured before/after on built CSS:
`.ring-offset-background` and `focus-visible\:ring-ring` went **0 → 1 rules**; the focus ring of
`button.tsx` was previously an **offset of white `rgb(255,255,255)` + color `currentcolor`**,
afterwards an offset of `--background` `rgb(3,7,17)` + ring `--ring` `rgb(16,183,127)`.
`@theme inline` does **not** emit `--color-*` onto `:root` (values are inlined into utilities)
so don't read that token via `getPropertyValue` at runtime. The animation class list
above **remains no-ops** — shadcn deprecated `tailwindcss-animate`, replaced by
`tw-animate-css` (see P2-7).

## 6. Client/server drift

**P2-6 slice 1 — 18/10:** added `@media (prefers-reduced-motion: reduce)` to `globals.css`.
Measured before the fix: `reducedMotion: 'reduce'` produced a computed style **identical** to normal mode ⇒
this setting was previously **inert**. Uses `0.01ms` (not `0s`) so `transitionend` still fires.
**Deliberately kept `.animate-spin`** (27 places) — if disabled, spinners freeze and users think the app is hung.
The same slice added an optional `id` to `Combobox` + `DatePicker` (purely additive) so 19 `<label>`s
in `BookFormModal` / `AccessoryFormModal` / `BulkCreateModal` / `settings` have `htmlFor`.
**18 labels** remain unattached (`MobileIntakeDialog` 10 · `SeriesModal` 8) and **19 `<div onClick>`** →
later slices. `Modal` lacked `role`/`aria-modal`/focus-trap at **10** render sites → later slice.

⚠️ **PowerShell trap (hit once):** `Get-Content -Raw` + `Set-Content` on PS **5.1** writes
the file in ANSI encoding ⇒ **destroys all Vietnamese diacritics** in a Vietnamese file. `git diff --stat`
exposes it immediately (AGENTS.md changed 186 lines instead of 1). Safe approach: use the `edit` tool, or
`Set-Content -Encoding UTF8`, then **always** check `git diff --stat` before committing.

**P2-3 slice 4 — 18/10:** 12 icon-only buttons in `VolumeGrid` (6) + `SymmetricalBlocks` (6) switched to `Button variant="ghost"`, adding `aria-label` (keeping `title`). Measured before/after: **25/25 rendered buttons have IDENTICAL `width`/`height`/`border-radius`**. Three verified traps:
- **Tab toggle** — `series/[id]` renders only **one** of the two views (`activeTab`), so the probe must click "Khối Đối Xứng (Sách & Phụ Kiện)" to see the `SymmetricalBlocks` buttons. The number of **rendered** buttons (25 with the fixture of 3 books + 2 accessories) differs from the number in **source** (12).
- **`VolumeGrid` has no DnD risk** — `dragHandleProps` applies to only **1 small `div` in the header** (the `GripVertical` icon); the buttons sit in the **footer, outside the drag handle**. The probe still performed real drag-and-drop and asserted `PUT /series/{id}/reorder-books` with the correct order payload.
- 🔴 `SymmetricalBlocks` L344/L350 (edit/delete accessories for the whole series) **previously had neither `title` nor `aria-label`** ⇒ screen readers read an empty "button". Fixed.
- **Deliberately not done in this slice:** 2 `Navbar` buttons (`impact` = **CRITICAL**, 8 files · 7 flows through `AppShell`) → done at **P2-6 slice 3** (see below); drag handle → **P2-6 slice 3** (the "not focusable" note below **was refuted by measurement**).

**P2-6 slice 3 — 18/10:** 2 `Navbar` buttons switched to `Button variant="ghost"` + `aria-label` (logout: `"Đăng xuất"`, keeping `title`; burger: `"Mở/Đóng menu điều hướng"` changing with state, replacing the English label `"Toggle navigation menu"` — P2-8 did not reopen Navbar) + hard overrides `h-[34px] w-[34px]` / `h-[38px] w-[38px] p-2 rounded-xl` per the measured profile. **0 pixel change** — JSON computed style at 3 viewports (1440/1280/390): w/h/pad/radius/border/bg **IDENTICAL** before/after, with an **emerald focus ring** from Button. The `VolumeGrid` drag handle got 1 line `aria-label={\`Di chuyển ${volLabel}\`}`.
- 🔴 **Correcting slice 4's conclusion:** the drag handle is **NOT** "not focusable" — `@hello-pangea/dnd` v18 provides `tabindex=0` + `role="button"` + `aria-describedby` (SR instructions) itself via `dragHandleProps`, and **keyboard DnD works fully**: `Space` (lift) → `ArrowRight` → `Space` (drop) produces the correct `PUT /series/{id}/reorder-books` (measured, payload `b-1↔b-2`). The only missing thing was `aria-label` — added. Lesson: the hello-pangea fork uses the attribute prefix `data-rfd-*` (not `data-rbd-*` like old react-beautiful-dnd).
- **Gate:** lint **71 problems** (= baseline; 1 pre-existing error `Navbar:28` `react-hooks/set-state-in-effect` + 1 pre-existing warning `VolumeGrid` `Layers` unused — **untouched**) · `tsc` 0 · build 0 · probe p32 before 6/6 → after **11/11** · regression of 9 suites **60/60 · 9/9 · 20/20 · 23/23 · 12/12 · 12/12 · 10/10 · 13/13 · 5/5**. `detect_changes`: 2 files · risk **high** (7 processes through Navbar — matches the predicted CRITICAL, covered by probe + full-page regression).

**P2-6 slice 4 — 19/10:** 19 `<div onClick>` (8 files) handled, **not all the same way**:

| Group | Count | How |
|---|---:|---|
| Thumbnail images + `+` sign cells | 14 | `<div onClick>` → `<Button type="button" variant="ghost">` + overrides to **keep 0 pixels changed** |
| Image-pick card `MobileIntakeDialog` | 1 | **keep `<div>`** — it contains 3 child `<button>`s, changing the outer one to `<button>` would be a **nested button** (HTML doesn't support it). Use `role="checkbox"` + `aria-checked` + `aria-label` + `tabIndex=0` + Space/Enter |
| `Modal` backdrop | 1 | **reversed the original plan** — added `aria-hidden="true"`, **not** `tabIndex`/`onKeyDown`. The backdrop is decorative (WAI-ARIA APG); the keyboard already has 2 valid close paths: Escape (Effect A) + the header X button |
| `combobox` option | 2 | `<div>` **keeps the tag**, adds `role="option"` + `aria-selected` + **roving tabindex** |

- **`combobox.tsx` genuinely upgraded (not just attributes):** the trigger has `aria-controls` + `aria-haspopup="listbox"` (previously missing → jsx-a11y warning `role-has-required-aria-props`, now gone); the option block has `role="listbox"`; each option `role="option"` + `aria-selected` + `tabIndex={activeIndex === i ? 0 : -1}`; **↑/↓/Home/End** move focus, **Enter/Space** select, **↑/↓ while in the search field** also jumps into the listbox. The active position is keyed by `filterKey = \`${search}|${filteredOptions.length}\`` and **derived in render** (no reset effect → avoids the `react-hooks/set-state-in-effect` lint error). `role="listbox"` is placed **nested inside** the scroll frame, so the "no results found" message isn't a direct child of the listbox.
- **Measured trap — `h-auto` overrides a fixed height:** `Button` has base `h-10`; adding `h-auto` to beat it is **correct** for `aspect-[3/4]` cells but **wrong** for cells already having `h-14`/`h-36`/`h-40`/`h-10`/`h-12`/`h-16` — the probe measured a `SpreadsheetGrid` thumbnail collapsing **56px → 18px**. Rule: only add `h-auto` when the element uses `aspect-*`; elements with hard `h-*` **keep** their `h-*`.
- **Trap of classes leaking from `buttonVariants`:** the base carries `whitespace-nowrap` + `font-semibold` + `rounded-xl` + `inline-flex`, ghost carries `hover:bg-slate-800/60` + `text-slate-400`. Every image cell must override `p-0 font-normal whitespace-normal text-inherit hover:bg-transparent` (and `block`/`rounded-none` for cells without rounding) — otherwise the computed style drifts from the original.
- **Gate:** `tsc` 0 · lint **70 problems** (baseline 71 — **1 jsx-a11y warning of combobox fixed**, 0 new errors; *this was the figure at P2-6 — P3-1 later brought it to **0***) · build 0 · probe p33 comparing before/after 3 pages: **0 shape deviations**, 13 elements changed semantics, `divClickables` **13 → 0**, `pageErrors` 0/0 · probe p37 combobox **15/15** · probe p38 image sizes **7/7** (`112x160` · `40x40` · `48x48` · `64x96` · `64x64`) · probe p39 batch mode **10/10** · probe p40 single mode **8/8**. `detect_changes`: 8 files · 15 symbols · 7 processes · risk **high**.
- 🔴 **Biggest trap of this slice — `preventDefault()` in the image-pick card's `onKeyDown` kills the child buttons.** The `MobileIntakeDialog` card has an `onKeyDown` calling `e.preventDefault()`; the event **bubbles up** from child `<button>`s (select badge, "Chọn" button, "Gắn Bìa Sách" button). `preventDefault()` also blocks the child button's default activation behavior (Space/Enter generating `click`), so child buttons **die silently** — measured in single mode: `Space`/`Enter` on "Gắn Bìa Sách" **did not run `handleApplySingle`, the dialog didn't close**. Fixed with `if (e.target !== e.currentTarget) return;` — only handle keys when focus is **exactly on the card**. Proven both ways: with the guard **8/8**, without the guard **6/8** (2 FAIL).
- ✅ **`MobileIntakeDialog` is now probeable** (advance to the `review` step via Playwright's `page.routeWebSocket()` — fake WebSocket sending `IMAGE_UPLOADED` + mocked POST `/intake/sessions`). Lesson: `<div role="checkbox">` + `onKeyDown` is only safe with the `e.target !== e.currentTarget` guard.
- ⚠️ **Probe trap:** `ui/select.tsx` (Radix Select) **renders `role="combobox"` + `role="listbox"` + `role="option"` itself** from the library → `document.querySelector('button[role="combobox"]').first()` clicks the wrong widget, producing meaningless measurements. Must filter `role="listbox"]:not([id^="radix"])`.

**P2-5 — 21/10:** the "Số Tập Đã Có" badge in `app/series/[id]/page.tsx` got a **sub-line**
`{completion_rate_percent}%` + (when incomplete) ` · thiếu {missing_volumes.length} tập`,
shown only when `max_volume_number > 0` (= some whole volume is currently owned). `title=`
explains the denominator is the **largest volume currently owned**, not the total volumes of the series, and
half volumes (e.g. 6.5) are not counted in the percentage — see `ARCHITECTURE.md` §2 ("Metric
`completion_rate_percent`").

- **Layout measurement (probe `probe-badge2.mjs`, 3 viewports 1440/1280/390, 2 fixtures):**
  badge is taller by **+15 px = exactly 1 text line**; `width` **unchanged**; grid column count
  **unchanged** (2 columns at 390, 4 columns on desktop); `hOverflow = false` **6/6**.
  Fixture "has missing volumes" ⇒ sub-line `"75% · thiếu 1 tập"`; fixture "complete + half volume"
  ⇒ sub-line `"100%"` (**no** "thiếu 0 tập") ⇒ the sub-line **does not break the layout**.
- ⚠️ **Don't** display `unique_volume_count / max_volume_number` in the sub-line: for
  a series with half volumes (18 volumes = 14 whole + 4 halves, max = 14) it would read **"18/14 tập"** —
  self-contradicting the "Số Tập Đã Có: 18" badge right above.
- **Probe trap:** select elements by **CLASS** (`[class*="emerald-950"]`), **not**
  by text — a task changing the text breaks text-based selectors immediately.
- `SeriesDetail extends SeriesSummary` so `completion_rate_percent` **already exists** in the FE
  type; only `max_volume_number` was added. On the backend `SeriesSummaryItem` and
  `SeriesDetailResponse` are **2 separate classes** (no inheritance) ⇒ both must be edited.

**P2-10 — 21/10:** fixed **2 copy sentences that described reality incorrectly** in the intake flow (only
**text** changed, not `className`/`style`/logic — diff = **2 files / 2 lines**):
- `components/intake/MobileIntakeDialog.tsx:872` — *"…chuyển đổi sang định dạng WebP
  **lossless** **tối ưu lưu trữ**"* → *"…tự chuyển sang WebP **để tải nhanh**, ảnh gốc vẫn
  được giữ nguyên"*. Wrong on 2 points: the server-generated WebP is **lossy q85** (`image_service.py:124`,
  no `lossless=True`), and the **storage** copy is the **original image** in `raw/`, WebP is only the
  **fast-download** copy.
- `mobile/app/review.tsx:124` — *"Ảnh đã được nén **chuẩn WebP**"* → *"Ảnh đã được nén"*.
  The compressor is **JPEG 0.82** (`imageOptimizer.ts:26-33`); only the **server** converts to WebP.
- ⚠️ **My initial proposal was "1 place remains" — WRONG**: grepping for the string `"đã nén WebP"`
  while the actual sentence was `"nén chuẩn WebP"` ⇒ 1 place left in `mobile/`. **Lesson: grep for
  conceptual fragments (`lossless`, `WebP`) then eyeball every line; don't trust a single grep command.**

- **DOM Probe** (`evidence/probe-intake-copy.mjs`, before/after, 3 viewports 1440/1280/390):
  open `/series/[id]` → click the "Chụp Điện Thoại" button → `MobileIntakeDialog` opens at step
  `'scan'` (default) → measure the footer. Select elements by **STRUCTURE** (`[role="dialog"]` →
  the "Đóng" button → parent → span) **not** by the text of the sentence being edited.

  | | before | after |
  |---|---|---|
  | span (desktop) | 395×16 | **404×16** (still 1 line) |
  | footer / dialog | 846×41 / 896×637 | **846×41 / 896×637 — unchanged** |
  | "Đóng" (x) button | 1081 | **1081 — unchanged** |
  | span→button gap | 389 px | **380 px** (margin left) |
  | span (mobile 390) | 246×32 | **246×32 — unchanged** (still 2 lines) |
  | `hOverflow` | false | **false** |
  | "lossless" occurrences in DOM | 1 | **0** |

  ⇒ **layout intact** across all 3 viewports.
- ⚠️ **Known limitation:** the mobile success card only renders when `uploadSuccess ===
  true` (requires a paired session + successful upload) ⇒ **no mobile probe exists** in the repo
  (`drafts/plans/*/evidence/` has FE probes only). Verify here via `tsc` + measuring string length
  (85 → 76) + the `successCardNote` style (`fontSize 11`, `lineHeight 16`, **no**
  `numberOfLines` ⇒ free wrap ⇒ shorter cannot break).

**P2-9 — 21/10:** `getImageUrl(null)` returned `/placeholder-book.png` which **did not exist**
(`frontend/public/` had none) ⇒ **404**. Created `frontend/public/placeholder-book.svg`
(**SVG = text**, reviewable diff, not a binary image; background `#020617` matching `bg-slate-950`,
3:4 ratio matching `aspect-[3/4]`) + changed **1 line** in `lib/api.ts`. **No** change to the 13 call sites.

- **DOM Probe** (`evidence/probe-placeholder.mjs`): `GET /placeholder-book.svg` → **200**,
  `content-type: image/svg+xml`, 549 bytes, root `<svg` ⇒ renderable (`naturalWidth 300 ×
  naturalHeight 400`).
- **Pixel Probe** (`evidence/probe-svg-pixels.mjs`): drew the SVG onto a canvas ⇒ **117 colors**
  (anti-aliasing ⇒ **really drew something**, not an empty file), **6.79%** of pixels differ from the background, and
  **exactly 3 painted colors**: background `#020617` 93.2% · book stroke `#334155` 5.9% · page stroke
  `#1e293b` 0.2%. The 300×400 ratio = **3:4** matches `aspect-[3/4]` of **all 3** containers
  (`MobileIntakeDialog:784` · `:921` · `:1061`) ⇒ **no cropping, no distortion**.
- The 2/3 unguarded spots verified by probe (simulated session + fake WebSocket to reach
  both steps): gallery `MobileIntakeDialog:787` (scan step) and the batch thumbnail `:924`
  (review step) ⇒ `src=/placeholder-book.svg`, `complete=true`, `natural=300×400`,
  **0** 404 responses, **0** failed requests. The third spot (`:1064`, single mode) is **the same
  `getImageUrl` call** + same markup ⇒ same result.
- ⚠️ **The fallback is a safety net, almost never hit**: the 3 spots above are images **from the phone**,
  and the server **always** sets `web_image_path` (`api/intake.py:302`) ⇒ only old/unconverted images
  reach this branch. The other 10 spots were already guarded (`x.web_image_path ? <img> : "Chưa có ảnh"`).
- **Probe trap (hit):** the "Tiếp Tục" button capitalizes **"Tục"** ⇒ Playwright's regex `/Tiếp tục/` is
  case-sensitive ⇒ no match ⇒ seemed impossible to reach the review step.
  Use `/Tiếp Tục/i`.
- 🔴 **Biggest trap: `src/proxy.ts` gates EVERY request without a cookie** — matcher
  `['/((?!login|_next|favicon.ico).*)']` ⇒ **even static files in `public/` are gated**:
  no cookie ⇒ **307 → `/login`** (returns HTML, not the file). Hit **twice** in
  this task: `Invoke-WebRequest` without a cookie ⇒ received a 19 KB login page (mistaken for 404 —
  but the `_next` text in the HTML made the "404" regex a false alarm); the Playwright probe
  without a cookie ⇒ `<img>` received HTML ⇒ `naturalWidth = 0`.
  ⇒ **Every probe must `ctx.addCookies([{ name: 'book_session_token', … }])`** before
  measuring any asset. No effect on the real app: every page showing images requires a cookie.

**P3-8 — 21/10:** the Analytics page draws 2 kinds of progress bars with **CSS width**; both were
"floored" by `Math.max` ⇒ **a 0% bar still rendered thick** ⇒ misleading data display:

| Location | Old | New |
|---|---|---|
| `analytics/page.tsx` monthly bar (L164) | `Math.max(spendPct, 5)` | `spendPct` |
| `analytics/page.tsx` publisher bar (L215) | `Math.max(pub.percentage, 4)` | `pub.percentage` |
| `analytics/page.tsx` `maxSpend` | computed **inside** `.map()` ⇒ O(n²) | `useMemo` **once** above the component |

⚠️ `pub.percentage` is the **% of TOTAL spend** (`analytics_service.py:108`
`spent / total_purch * 100`) ⇒ a 4% floor made **the bars total OVER 100%** and a publisher spending 0% rendered
**bigger** than one spending 1% ⇒ wrong visual order. **Backend needs no fix** —
the percentage is computed correctly, the bug is at display ⇒ **no** API / `schema.prisma` changes.

- **DOM Probe** (`evidence/probe-analytics-bars.mjs`, 2 fixtures × 3 viewports 1440/1280/390),
  measuring `style.width` **and** the actual px of each bar:

  | | before | after |
  |---|---|---|
  | 0% bar (monthly) | `width: 5%` — 31 px | **`width: 0%` — 0 px** |
  | 0% bar (publisher) | `width: 4%` — 17 px | **`width: 0%` — 0 px** |
  | **bars' total %** | monthly **105%** · publisher **104%** | **100%** · **100%** |
  | fixture "spent nothing" | 5% + 4% (2 filled bars) | **0% + 0%** (empty) |
  | `hOverflow` | false | **false** |

  ⇒ **Numeric proof the bug existed**: the probe ran **before** the fix and saw 105%/104%.
- ⚠️ **Don't** add `minWidth` to the 0% bar (adding a "thin sliver" = inventing more) — the row already
  shows the real amount (`formatVND`) so "empty" is legible.
- ⚠️ **Swept the whole repo** before concluding "this is the only occurrence":
  `git grep "Math.max" -- frontend/src` ⇒ 8 results, the remaining 5 are **correct** (computing the next
  page / clamping pages ≥ 1 / zoom ≥ 0.5) ⇒ **untouched**.

**P2-4 — fixed 18/10:** the series status badge previously had **2** diverging renderers —
`SpreadsheetGrid.getStatusBadge()` with all **4** branches (icon + sky/emerald/amber/rose tone),
while `app/series/[id]/page.tsx` used a 2-branch ternary **with hard-coded emerald**, so
`HIATUS` and `DROPPED` misrendered as "Đang phát hành" and every status had the same color.
Consolidated into the **single source of truth** `series/SeriesStatusBadge.tsx` (`STATUS_MAP` with 4
statuses + `SIZES.sm|lg`), shared by both places — the probe asserts badges of the same status match
`text` + `background` + `color` + `border`. `SeriesModal.tsx` (edit form) **keeps its own**
labels ("Tạm ngưng (Hiatus)"), since those are form labels, not badges.

`MobileIntakeDialog.tsx` defines `BOOK_CONDITIONS` with **6** values, adding
`UNSEALED_NEW` — **not** in the model. `Book.condition` and
`BookFormModal` only have 5 (`SEALED` `LIKE_NEW` `VERY_GOOD` `GOOD` `ACCEPTABLE`).

`BulkCreateModal` hard-caps 150 volumes per batch **client-side only** — the server does
not re-check.

The 9 accessory-type labels appear in 4 files; `SymmetricalBlocks.tsx` uses the
**emoji version** while the other 3 files use the plain-text version. `formatBytes` is duplicated in
`settings/page.tsx` and `OrphanCleanupPanel.tsx`.

## 7. `<img>` instead of `next/image`

**18 spots** in **10 files** use raw `<img>` with
`eslint-disable @next/next/no-img-element` (`MobileIntakeDialog.tsx` 3,
`SymmetricalBlocks.tsx` 3, `orphan-items/page.tsx` 4, `VolumeGrid.tsx` 2, the rest
1 per file). `next.config.ts` only has `{ devIndicators: false }` — **no**
`images.remotePatterns`, even though `storage/` is full of WebP derivatives.

## 8. Base URL

**P3-9 (21/10):** all 3 constants live in **one** file `lib/config.ts` (19 lines):
`API_PORT` (`NEXT_PUBLIC_API_PORT`, default 8000) · `API_BASE_URL`
(`NEXT_PUBLIC_API_URL`) · `STORAGE_BASE_URL` (`NEXT_PUBLIC_STORAGE_URL`).
The repo has no `.env` file in `frontend/`.

Before P3-9, `lib/intake.ts` **hard-coded port 8000** in the WebSocket URL ⇒ deploying
on another port broke intake. Now it takes `API_PORT` from `lib/config.ts`, while the **host**
still comes from `window.location.hostname` (dashboard and API on the same PC, but the
browser may access via a LAN IP).

⚠️ `NEXT_PUBLIC_*` values are **inlined at build time** ⇒ changing them after a build has no effect,
you must rebuild. The backend reads `PORT` from `.env` **at runtime** ⇒ changing the backend port
only requires editing `.env` (no web rebuild).

## 9. Data layer (SWR) — P1-4 (16/10)

Full replacement of the old `fetchData()` convention. Don't add another caching layer on your own.

| File | Role |
|---|---|
| `lib/swr.ts` (6 lines) | `fetcher` = wrap `apiFetch`; `refreshAll = () => mutate(() => true)` — called **once after each mutation** (replaces `fetchData()`), invalidates every cached key |
| `app/providers.tsx` (18) | global `SWRConfig`: `dedupingInterval: 60_000`, `revalidateOnFocus: false` |
| `components/layout/ErrorPanel.tsx` (28) | shared error panel + "Thử lại" button → `refreshAll()`; each page passes `error = OR of queries` (settings excludes `/auth/me`) |
| `app/error.tsx` (38) | root error boundary — Next 16 uses the `retry` prop (not `reset`) |

**⚠️ SWR has no `staleTime`** (that's TanStack Query). The 60s window is mapped via
`dedupingInterval`: SWR keeps a request marker for an extra `dedupingInterval` ms after it
finishes, so revisits within 60s = reuse the cache, **0 requests**; past 60s it
revalidates in the background. Don't "fix" it to `staleTime` — the type will fail the build.

**Mutations always refetch, not blocked by dedupe:** `mutate` removes `FETCH[key]`
before revalidating (SWR source, `config-context-*.mjs`). Errors also remove the marker
right in `catch` → retry-on-error and the "Thử lại" button work.

**Optimistic reorder** (`series/[id]/page.tsx`): PUT `/reorder-books` does **not**
return `SeriesDetail`, so use `mutate(key, promise, opts)` with promise =
PUT → GET detail again; `optimisticData` (sorted books), `rollbackOnError: true`,
`populateCache: true`, `revalidate: false`, `throwOnError: true`.
**Second place using this pattern (P3-18):** `orphan-items/page.tsx` — PUT
`/books/reorder/batch` + `/accessories/reorder/batch` also **do not** return lists ⇒
same recipe: PUT → GET the list again, `optimisticData` = the sorted list.
⇒ **Tip:** use **constants** for SWR keys (`lib/orphanReorder.ts`: `BOOKS_ORPHAN_LIST_KEY`
…) so `useSWR` and `mutate` **never diverge** — hand-typed strings are a classic error source.

**P1-4 measurements (16/10, Playwright on prod build):** cold tour of 6 pages
**59 → 10 requests**; the second tour (revisiting everything) **28 → 0**. Revisit = 0
requests within the 60s window and no mutation yet.
