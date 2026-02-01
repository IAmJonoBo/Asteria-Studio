# Asteria Studio — UI/UX

## Principles

- Designer-first: accurate, responsive, with trustworthy overlays.
- Low-friction QA: minimal clicks to approve/reject/fix elements.
- Offline clarity: explicit indicators for local vs remote model use.

## Core Screens

- **Workspace / Project Home**: choose project, show recent runs, hardware status (GPU/CPU), model mode (local/remote/auto).
- **Import Wizard**: select PDF or image folder; map to pages; set target dimensions (mm/cm/in) and DPI; choose preset.
- **Batch Dashboard**: run controls, progress, queue; pause/cancel; logs and metrics per stage.
- **Review Queue**: list of pages sorted by confidence/risk; filters (low bounds confidence, warp warnings).
- **Page Inspector**: side-by-side before/after, overlay toggles, zoom/pan; element list with confidences; manual nudge/resize; per-element accept/reject; bulk apply to range.
- **Export Wizard**: choose output formats (PNG/TIFF/PDF), color profile, naming scheme; include JSON sidecars and manifest.

## Key Interactions

- Manual dimension entry dialog accepts mm/cm/in with live preview of crop ratio and DPI-derived pixel targets.
- Overlay layers per element type with distinct colors; show confidence tooltip and shortcuts for accept/reject.
- Bulk operations: apply crop or margin adjustments to selection or entire chapter.
- Undo/redo stack per page and per run; version timeline to compare runs.
- Keyboard shortcuts for fast QA (approve, flag, jump to next low-confidence page).

## Status & Feedback

- Clear banners for remote/offline mode and fallbacks.
- Stage-level confidence/quality bars; warnings for risky operations (extreme warp).
- Run summary with metrics, errors, and files written.

## Accessibility & Responsiveness

- Works on 13" laptops and large monitors; resizable panels; remembers layout.
- High-contrast theme and font scaling; keyboard-first navigation where possible.

## File Conventions in UI

- Show project tree (`input/`, `work/`, `output/`, `manifests/`).
- Link from page list to JSON sidecar and normalized image.
