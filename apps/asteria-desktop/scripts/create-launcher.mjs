import { chmodSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const distDir = path.join(appRoot, "dist");
mkdirSync(distDir, { recursive: true });

const unixLauncher = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/node_modules/.bin/electron" "$ROOT" "$@"
`;

const winLauncher = `@echo off
set ROOT=%~dp0..\
"%ROOT%node_modules\\.bin\\electron.cmd" "%ROOT%" %*
`;

const unixPath = path.join(distDir, "asteria-studio");
const winPath = path.join(distDir, "asteria-studio.cmd");

writeFileSync(unixPath, unixLauncher, { encoding: "utf-8" });
writeFileSync(winPath, winLauncher, { encoding: "utf-8" });

try {
  chmodSync(unixPath, 0o755);
} catch {
  // Best-effort on non-POSIX filesystems.
}
