# Asteria Studio

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/427a86553dc34b87b99726b5ca8b6e6a)](https://app.codacy.com/gh/IAmJonoBo/Asteria-Studio?utm_source=github.com&utm_medium=referral&utm_content=IAmJonoBo/Asteria-Studio&utm_campaign=Badge_Grade)

Enterprise-grade, offline-first desktop app to normalize scanned pages (deskew, dewarp, crop, layout harmonization) with confidence-scored element detection and designer-friendly QA.

## Current Status

- Planning and specifications in `docs/` and `spec/`.
- Project scaffolding for desktop app (`apps/asteria-desktop`) and shared packages (`packages/`).

## Planned Stack

- Electron + React (Vite) for UI, Tailwind for styling.
- Rust CV/ML core (OpenCV, ONNX Runtime, Tesseract) via N-API bindings.
- Local project storage with versioned manifests and JSON sidecars.
- Optional remote accelerators for heavy models with automatic fallback.

## Project Structure (initial)

- `docs/` — product brief, architecture, model strategy, UI/UX.
- `spec/` — schemas and default pipeline config.
- `apps/asteria-desktop/` — desktop app code (to be populated).
- `packages/` — shared pipeline core and UI kit packages (to be populated).
- `projects/mind-myth-and-magick/` — sample corpus with `input/raw/` (original PDF + pages), `work/`, `output/normalized/`.

## Next Steps

- Add Electron packaging (electron-builder) and align main/renderer outputs.
- Implement IPC contracts and orchestrator stubs with preload bridges.
- Flesh out Rust N-API surface and add CV/ML dependencies plus golden tests.
- Generate sample manifests and JSON sidecars for the sample corpus.
