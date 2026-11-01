# UI/UX & Component Design Rules — Shadcn/UI First

> Split out from AGENTS.md (P8-1) — read when touching `frontend/src/components/` or creating a new component.
> Referenced from the AGENTS.md Doc Trigger table.

---

## Shadcn/UI First — MANDATORY

- **Every UX/UI element** must first be checked against and built with **shadcn/ui** components (`frontend/src/components/ui/` such as `Select`, `Button`, `Input`, `Dialog`, `Popover`, `Combobox`, `DatePicker`, `Slider`, `Lightbox`...).
- **NEVER** use basic native HTML tags (such as bare `<select>`, `<input>`) because they lack consistency and aesthetic fit with the overall dark sleek / glassmorphism interface system.
- If shadcn/ui has no suitable component, **write it yourself** following the pattern of `ui/Modal.tsx` (dark glassmorphism + focus-trap + P3-1 render-phase adjust).

## Component Conventions

| Convention | Details |
|---|---|
| **State sync** | DO NOT use `useEffect` to sync prop → state (P3-1). Use the **render-phase adjust** pattern (see `BookFormModal.tsx:62-76`). |
| **Buttons** | `Button` from `ui/button.tsx` — variants `default` (emerald), `secondary`, `ghost`, `destructive`. Icon-only = `variant="ghost"` + `aria-label`. |
| **Images** | `<img>` + `eslint-disable @next/next/no-img-element` (repo uses `<img>` instead of `next/image` — 18 places in 10 files). |
| **CSS classes** | DO NOT use `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-top-2`, `custom-scrollbar` — they are no-ops (no definitions exist). |
| **Colors** | Dark mode hard-locked. `bg-slate-*` / `text-slate-*` / `border-slate-*` / glassmorphism `glass-panel`. |
| **Modals** | `ui/Modal.tsx` — `role="dialog"` + `aria-modal` + focus-trap + Escape close. Backdrop `aria-hidden="true"`. |
| **Accessibility** | Icon-only buttons need `aria-label` + `title`. Filter controls need `aria-label`. |

## CSS Classes No-Op — Don't Use

The following classes are used in 10 files but **have no definitions** — `tailwindcss-animate` is missing. They are no-ops. Do not "fix" them by adding them to new components — report instead of fixing.

| Class | Files |
|---|---|
| `animate-in` + variants | `ui/Modal.tsx` · `ui/Lightbox.tsx` · `ui/popover.tsx` · `ui/select.tsx` · `layout/AppShell.tsx` · `layout/Navbar.tsx` |
| `custom-scrollbar` | `ui/combobox.tsx` · `series/SpreadsheetGrid.tsx` · `series/VolumeGrid.tsx` · `app/orphan-items/page.tsx` |
