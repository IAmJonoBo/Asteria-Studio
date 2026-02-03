#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * CLI runner for executing the pipeline on the Mind, Myth and Magick corpus
 * and generating evaluation reports.
 */

import { runPipeline, evaluateResults } from "../src/main/pipeline-runner.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { getRunDir } from "../src/main/run-paths.ts";
import { loadEnv } from "../src/main/config.ts";
import { info, note, section, startStep } from "./cli.ts";

loadEnv();

async function main(): Promise<void> {
  const projectRoot =
    process.argv[2] || path.join(process.cwd(), "projects/mind-myth-and-magick/input/raw");
  const sampleCount = process.argv[3] ? Number.parseInt(process.argv[3], 10) : undefined;
  const outputDir = path.join(process.cwd(), "pipeline-results");

  section("ASTERIA PIPELINE EXECUTION");
  info(`Project Root: ${projectRoot}`);
  info(`Sample Count: ${sampleCount || "all pages"}`);
  info(`Output Dir: ${outputDir}`);

  try {
    // Verify project exists
    const verifyStep = startStep("Verify project root");
    const stat = await fs.stat(projectRoot);
    if (!stat.isDirectory()) {
      throw new Error(`Project root is not a directory: ${projectRoot}`);
    }
    verifyStep.end("ok");

    // Run pipeline
    const runStep = startStep("Run pipeline");
    const startTime = Date.now();
    const result = await runPipeline({
      projectRoot,
      projectId: "mind-myth-magick",
      targetDpi: 300,
      targetDimensionsMm: { width: 184.15, height: 260.35 },
      sampleCount,
      outputDir,
    });
    const totalTime = Date.now() - startTime;
    runStep.end(result.success ? "ok" : "fail");

    section("PIPELINE RESULTS");
    info(`Status: ${result.success ? "SUCCESS" : "FAILED"}`);
    info(`Run ID: ${result.runId}`);
    info(`Pages Processed: ${result.pageCount}`);
    info(`Duration: ${(totalTime / 1000).toFixed(2)}s`);
    info(`Throughput: ${((result.pageCount / totalTime) * 1000).toFixed(2)} pages/sec`);

    if (!result.success) {
      note("Errors:");
      result.errors.forEach((e) => {
        info(`[${e.phase}] ${e.message}`);
      });
      process.exit(1);
    }

    // Evaluate results
    section("EVALUATION");
    const evalStep = startStep("Compute evaluation");
    const evaluation = evaluateResults(result);
    evalStep.end("ok");

    note("Observations:");
    evaluation.observations.forEach((obs) => {
      info(`- ${obs}`);
    });

    note("Metrics:");
    Object.entries(evaluation.metrics).forEach(([key, value]) => {
      let displayValue: string | number = value as string | number;
      if (typeof value === "number") {
        displayValue = Number.isInteger(value) ? value : value.toFixed(2);
      }
      info(`${key}: ${displayValue}`);
    });

    note("Recommendations:");
    evaluation.recommendations.forEach((rec) => {
      info(`- ${rec}`);
    });

    // Save full evaluation report
    const runDir = getRunDir(outputDir, result.runId);
    const reportPath = path.join(runDir, "evaluation.json");
    const writeStep = startStep("Write evaluation report");
    await fs.writeFile(reportPath, JSON.stringify({ executedAt: new Date().toISOString(), result, evaluation }, null, 2));
    writeStep.end("ok", reportPath);
  } catch (error) {
    console.error("Pipeline execution failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
