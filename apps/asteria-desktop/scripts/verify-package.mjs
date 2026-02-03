import fs from "node:fs/promises";
import path from "node:path";
import { info, note, section, startStep } from "./cli.mjs";

const appRoot = process.cwd();
const distRoot = path.join(appRoot, "dist-app");

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

const walk = async (root, matcher) => {
  const matches = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stats = await statSafe(current);
    if (!stats) continue;
    if (stats.isDirectory()) {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        stack.push(path.join(current, entry.name));
      }
    } else if (matcher(current)) {
      matches.push(current);
    }
  }
  return matches;
};

const findUnpackedRoots = async (root) => {
  return walk(root, (target) => target.endsWith("app.asar.unpacked"));
};

const fileSize = async (file) => {
  const stats = await statSafe(file);
  return stats ? formatBytes(stats.size) : "missing";
};

const listArtifacts = async (root) => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(root, entry.name);
    info(`${entry.name}: ${await fileSize(full)}`);
  }
};

const main = async () => {
  section("PACKAGED ARTEFACT VERIFY");
  info(`Dist: ${distRoot}`);

  const distStats = await statSafe(distRoot);
  if (!distStats || !distStats.isDirectory()) {
    console.error(`Missing dist-app directory at ${distRoot}`);
    process.exit(1);
  }

  note("Top-level artefacts:");
  await listArtifacts(distRoot);

  const unpackedRoots = await findUnpackedRoots(distRoot);
  if (unpackedRoots.length === 0) {
    console.error("No app.asar.unpacked directory found.");
    process.exit(1);
  }

  const verifyStep = startStep("Verify native module unpacking");
  let missing = 0;

  for (const root of unpackedRoots) {
    const sharpDir = path.join(root, "node_modules", "sharp");
    const imgDir = path.join(root, "node_modules", "@img");
    const sharpStats = await statSafe(sharpDir);
    const imgStats = await statSafe(imgDir);

    if (!sharpStats?.isDirectory()) {
      missing += 1;
      note(`Missing sharp in ${root}`);
    } else {
      info(`Sharp unpacked: ${sharpDir}`);
    }

    if (!imgStats?.isDirectory()) {
      missing += 1;
      note(`Missing @img in ${root}`);
    } else {
      info(`@img unpacked: ${imgDir}`);
    }

    const nodeBinaries = await walk(root, (target) => target.endsWith(".node"));
    if (nodeBinaries.length === 0) {
      missing += 1;
      note(`No native .node binaries found in ${root}`);
    } else {
      info(`Native binaries: ${nodeBinaries.length}`);
    }
  }

  if (missing > 0) {
    verifyStep("fail", `${missing} check(s) failed`);
    process.exit(1);
  }

  verifyStep("ok", "native modules unpacked");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
