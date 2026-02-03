#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const findRepoRoot = (startDir) => {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
};

const supportsColor = Boolean(process.stdout.isTTY);
const colorize = (code) => (value) =>
  supportsColor ? `\u001b[${code}m${value}\u001b[0m` : value;
const dim = colorize("2");
const green = colorize("32");
const yellow = colorize("33");
const red = colorize("31");
const cyan = colorize("36");

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}m ${remainder.toFixed(1)}s`;
};

const timestamp = () => {
  const now = new Date();
  const pad = (value) => value.toString().padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const section = (title) => {
  const width = Math.max(48, Math.min(80, title.length + 12));
  const rule = "=".repeat(width);
  console.log(`\n${rule}`);
  console.log(cyan(title));
  console.log(rule);
};

const info = (message) => {
  console.log(`  ${message}`);
};

const note = (message) => {
  console.log(dim(`  ${message}`));
};

const statusLabel = (status) => {
  if (status === "ok") return green("ok");
  if (status === "warn") return yellow("warn");
  return red("fail");
};

const startStep = (label) => {
  const startedAt = Date.now();
  console.log(`${dim(timestamp())} [start] ${label}`);
  return (status = "ok", detail) => {
    const duration = formatDuration(Date.now() - startedAt);
    const suffix = detail ? ` - ${detail}` : "";
    console.log(`${dim(timestamp())} [${statusLabel(status)}] ${label}${suffix} ${dim(`(${duration})`)}`);
  };
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runCapture = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || "").trim();
};

const main = () => {
  const repoRoot = findRepoRoot(process.cwd());

  section("ASTERIA BOOTSTRAP");
  info(`Repo: ${repoRoot}`);

  const pnpmVersion = runCapture("pnpm", ["--version"]);
  if (!pnpmVersion) {
    console.error("pnpm not found. Install pnpm (or enable corepack) and retry.");
    process.exit(1);
  }
  info(`pnpm: ${pnpmVersion}`);

  section("Installing dependencies (pnpm install)");
  const installStep = startStep("pnpm install");
  run("pnpm", ["install"], { cwd: repoRoot });
  installStep("ok");

  section("Checking Rust toolchain (optional)");
  const rustcVersion = runCapture("rustc", ["--version"]);
  const cargoVersion = runCapture("cargo", ["--version"]);

  if (!rustcVersion && !cargoVersion) {
    note("Rust toolchain not found. This is optional for now.");
    note("If you plan to work on native CV stages, install via rustup.");
    return;
  }

  if (rustcVersion) info(`rustc: ${rustcVersion}`);
  if (cargoVersion) info(`cargo: ${cargoVersion}`);
  note("Rust toolchain OK.");
};

try {
  main();
} catch (error) {
  console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
