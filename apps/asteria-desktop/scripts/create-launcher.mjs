import { chmodSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { info, note, section, startStep } from "./cli.mjs";

const appRoot = process.cwd();
const distDir = path.join(appRoot, "dist");
section("CREATE LAUNCHER");
info(`Dist: ${distDir}`);
const prepareStep = startStep("Prepare dist directory");
mkdirSync(distDir, { recursive: true });
prepareStep("ok");

const unixLauncher = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_ENV="production"
exec "$ROOT/node_modules/.bin/electron" "$ROOT" "$@"
`;

const winLauncher = `@echo off\r
set ROOT=%~dp0..\\\r
set NODE_ENV=production\r
"%ROOT%node_modules\\.bin\\electron.cmd" "%ROOT%" %*\r
`;

const unixPath = path.join(distDir, "asteria-studio");
const winPath = path.join(distDir, "asteria-studio.cmd");

const writeStep = startStep("Write launchers");
writeFileSync(unixPath, unixLauncher, { encoding: "utf-8" });
writeFileSync(winPath, winLauncher, { encoding: "utf-8" });
writeStep("ok");

try {
  chmodSync(unixPath, 0o755);
  note(`Marked executable: ${unixPath}`);
} catch {
  // Best-effort on non-POSIX filesystems.
}
