import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { info, note, section, startStep } from "./cli.mjs";

const require = createRequire(import.meta.url);

let electronPkgPath;
try {
  electronPkgPath = require.resolve("electron/package.json");
} catch (err) {
  section("ELECTRON SETUP");
  console.error("Electron is not installed. Run pnpm install first.");
  process.exit(1);
}

const electronDir = path.dirname(electronPkgPath);
const pathFile = path.join(electronDir, "path.txt");

if (existsSync(pathFile)) {
  section("ELECTRON SETUP");
  note("Electron already installed.");
  process.exit(0);
}

const installScript = path.join(electronDir, "install.js");
section("ELECTRON SETUP");
info(`Install script: ${installScript}`);
const installStep = startStep("Install Electron");
const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
});
installStep(result.status === 0 ? "ok" : "fail");

process.exit(result.status ?? 1);
