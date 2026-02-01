# Asteria Studio Desktop

Electron + React desktop shell for Asteria Studio.

## Planned Modules

- UI shell (project selector, review queue, page inspector).
- IPC bridge to orchestrator (Node).
- Native module bindings to Rust CV core.
- Packaging with Electron Builder (Mac/Win/Linux).

## Next Actions

- Initialize package.json with Electron/Vite setup.
- Define IPC contracts (`startRun`, `cancelRun`, `fetchPage`, `applyOverride`, `exportRun`).
- Add Playwright smoke test harness.
