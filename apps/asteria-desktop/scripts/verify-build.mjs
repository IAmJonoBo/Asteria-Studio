import fs from "node:fs/promises";
import path from "node:path";
import { info, note, section, startStep } from "./cli.mjs";

const appRoot = process.cwd();
const distRoot = path.join(appRoot, "dist");

const statSafe = async (target) => {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const main = async () => {
  section("BUILD ARTEFACT VERIFY");
  info(`Dist: ${distRoot}`);

  const checks = [
    { label: "Main bundle", file: path.join(distRoot, "main", "main.js") },
    { label: "Renderer index", file: path.join(distRoot, "renderer", "index.html") },
  ];

  const launcherCandidates = [
    path.join(distRoot, "asteria-studio"),
    path.join(distRoot, "asteria-studio.cmd"),
  ];

  const verifyStep = startStep("Verify build outputs");
  let missing = 0;

  for (const check of checks) {
    const stats = await statSafe(check.file);
    if (!stats) {
      missing += 1;
      note(`${check.label}: missing (${check.file})`);
      continue;
    }
    info(`${check.label}: ${formatBytes(stats.size)} (${check.file})`);
  }

  const launcherStats = await Promise.all(launcherCandidates.map((file) => statSafe(file)));
  const launcherIndex = launcherStats.findIndex(Boolean);
  if (launcherIndex === -1) {
    missing += 1;
    note(`Launcher: missing (${launcherCandidates.join(" or ")})`);
  } else {
    const stats = launcherStats[launcherIndex];
    info(`Launcher: ${formatBytes(stats.size)} (${launcherCandidates[launcherIndex]})`);
  }

  if (missing > 0) {
    verifyStep("fail", `${missing} artefact(s) missing`);
    process.exit(1);
  }

  verifyStep("ok", "all artefacts present");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
