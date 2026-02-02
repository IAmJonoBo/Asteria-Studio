import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { runPipeline } from "../src/main/pipeline-runner.ts";
import {
  getRunDir,
  getRunManifestPath,
  getRunReviewQueuePath,
} from "../src/main/run-paths.ts";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const fixturesRoot = path.join(repoRoot, "tests", "fixtures", "golden_corpus", "v1");
const inputsDir = path.join(fixturesRoot, "inputs");
const truthDir = path.join(fixturesRoot, "truth");
const expectedDir = path.join(fixturesRoot, "expected");
const generatorPath = path.join(repoRoot, "tools", "golden_corpus", "generate.py");

const hashDirectory = async (dir: string): Promise<string> => {
  const files: string[] = [];
  const walk = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  await walk(dir);
  files.sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const rel = path.relative(dir, file);
    const data = await fs.readFile(file);
    hash.update(rel);
    hash.update(data);
  }
  return hash.digest("hex");
};

const resolvePython = (): string => {
  const candidates = [process.env.GOLDEN_PYTHON, "python3.11", "python3"].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No compatible Python found. Set GOLDEN_PYTHON=python3.11");
};

const runGenerator = () => {
  const python = resolvePython();
  const result = spawnSync(python, [generatorPath, "--seed", "1337", "--out", fixturesRoot], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Golden generator failed");
  }
};

const copyDir = async (src: string, dest: string) => {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
};

const main = async () => {
  runGenerator();
  const inputsHash = await hashDirectory(inputsDir);
  const truthHash = await hashDirectory(truthDir);
  runGenerator();
  const inputsHash2 = await hashDirectory(inputsDir);
  const truthHash2 = await hashDirectory(truthDir);
  if (inputsHash !== inputsHash2 || truthHash !== truthHash2) {
    throw new Error("Golden generator is not deterministic across runs");
  }

  delete process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT;
  delete process.env.ASTERIA_REMOTE_LAYOUT_TOKEN;
  delete process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS;

  const runId = "golden-v1";
  const runRoot = path.join(process.cwd(), ".cache", "golden", "bless");
  await fs.mkdir(runRoot, { recursive: true });

  const result = await runPipeline({
    projectRoot: inputsDir,
    projectId: runId,
    runId,
    targetDpi: 300,
    targetDimensionsMm: { width: 184.15, height: 260.35 },
    outputDir: runRoot,
    enableSpreadSplit: true,
    enableBookPriors: false,
    bookPriorsSampleCount: 0,
    pipelineConfigPath: path.join(repoRoot, "spec", "pipeline_config.yaml"),
  });

  if (!result.success) {
    throw new Error("Pipeline failed during bless run");
  }

  const runDir = getRunDir(runRoot, runId);
  await copyDir(path.join(runDir, "normalized"), path.join(expectedDir, "normalized"));
  await copyDir(path.join(runDir, "sidecars"), path.join(expectedDir, "sidecars"));

  await fs.copyFile(getRunReviewQueuePath(runDir), path.join(expectedDir, "review-queue.json"));
  await fs.copyFile(getRunManifestPath(runDir), path.join(expectedDir, "manifest.json"));

  console.log("Golden expected outputs updated.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
