import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const fixturesRoot = path.join(repoRoot, "tests", "fixtures", "golden_corpus", "v1");
const generatorPath = path.join(repoRoot, "tools", "golden_corpus", "generate.py");

const resolvePython = (): string => {
  const candidates = [process.env.GOLDEN_PYTHON, "python3.11", "python3"].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (result.status === 0) return candidate;
  }
  throw new Error("No compatible Python found. Set GOLDEN_PYTHON=python3.11");
};

const python = resolvePython();
const result = spawnSync(python, [generatorPath, "--seed", "1337", "--out", fixturesRoot], {
  stdio: "inherit",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
