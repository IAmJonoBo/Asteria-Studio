import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { info, section, startStep } from "./cli.mjs";

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

section("VITEST RUNNER");
info(`Workspace: ${appRoot}`);
info(`Args: ${args.length > 0 ? args.join(" ") : "(default)"}`);
const spawnStep = startStep("Launch Vitest");

const child = spawn(binPath, args, {
  cwd: appRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

child.on("exit", (code) => {
  spawnStep(code === 0 ? "ok" : "fail", `exit ${code ?? 1}`);
  process.exit(code ?? 1);
});
