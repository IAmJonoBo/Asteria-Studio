import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const binName = process.platform === "win32" ? "vitest.cmd" : "vitest";
const binPath = path.resolve(appRoot, "node_modules", ".bin", binName);

const tmpFile = path.join(os.tmpdir(), "asteria-localstorage.json");
const existing = (process.env.NODE_OPTIONS ?? "")
  .split(/\s+/)
  .filter(Boolean)
  .filter((option) => !option.startsWith("--localstorage-file"));

const nodeOptions = [...existing, `--localstorage-file=${tmpFile}`].join(" ");

const child = spawn(binPath, args, {
  cwd: appRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
