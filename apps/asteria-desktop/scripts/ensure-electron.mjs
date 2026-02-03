import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let electronPkgPath;
try {
  electronPkgPath = require.resolve("electron/package.json");
} catch (err) {
  console.error("Electron is not installed. Run pnpm install first.");
  process.exit(1);
}

const electronDir = path.dirname(electronPkgPath);
const pathFile = path.join(electronDir, "path.txt");

if (existsSync(pathFile)) {
  process.exit(0);
}

const installScript = path.join(electronDir, "install.js");
const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
