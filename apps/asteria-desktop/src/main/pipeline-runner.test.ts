import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PipelineRunnerResult } from "./pipeline-runner";
import type { PageData } from "../ipc/contracts";
import { runPipeline, evaluateResults } from "./pipeline-runner";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("./normalization", () => ({
  normalizePages: vi.fn(async (pages: PageData[]) => {
    return new Map(
      pages.map((page) => [
        page.id,
        {
          pageId: page.id,
          normalizedPath: "/tmp/normalized.png",
          cropBox: [0, 0, 100, 100],
          maskBox: [0, 0, 100, 100],
          dimensionsMm: { width: 210, height: 297 },
          dpi: 300,
          dpiSource: "fallback",
          trimMm: 3,
          bleedMm: 3,
          skewAngle: 0,
          shadow: { present: false, side: "none", widthPx: 0, confidence: 0, darkness: 0 },
          stats: {
            backgroundMean: 240,
            backgroundStd: 5,
            maskCoverage: 0.9,
            skewConfidence: 0.8,
            shadowScore: 0,
          },
        },
      ])
    );
  }),
}));

describe("Pipeline Runner", () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "asteria-pipeline-"));
    projectRoot = tempDir;

    // Create sample JPEG files
    for (let i = 0; i < 5; i++) {
      const imgPath = path.join(projectRoot, `page-${i}.jpg`);
      // Write minimal JPEG marker
      await fs.writeFile(imgPath, Buffer.from([0xff, 0xd8, 0xff, 0xc0]));
    }
  });

  it("runPipeline scans and analyzes pages", async () => {
    const result = await runPipeline({
      projectRoot,
      projectId: "test-pipeline",
      sampleCount: 3,
    });

    expect(result.success).toBe(true);
    expect(result.projectId).toBe("test-pipeline");
    expect(result.pageCount).toBe(3);
    expect(result.scanConfig.pages).toHaveLength(3);
    expect(result.analysisSummary.estimates).toHaveLength(3);
    expect(result.pipelineResult.status).toBe("success");
  });

  it("runPipeline handles target DPI override", async () => {
    const result = await runPipeline({
      projectRoot,
      projectId: "test-dpi",
      targetDpi: 600,
      sampleCount: 2,
    });

    expect(result.success).toBe(true);
    expect(result.analysisSummary.dpi).toBe(600);
  });

  it("evaluateResults provides observations and recommendations", () => {
    const mockResult: PipelineRunnerResult = {
      success: true,
      runId: "run-test",
      projectId: "eval-test",
      pageCount: 100,
      durationMs: 5000,
      scanConfig: {
        projectId: "eval-test",
        pages: Array.from({ length: 100 }, (_, i) => ({
          id: `p${i}`,
          filename: `page${i}.jpg`,
          originalPath: "",
          confidenceScores: {},
        })),
        targetDpi: 300,
        targetDimensionsMm: { width: 210, height: 297 },
      },
      analysisSummary: {
        projectId: "eval-test",
        pageCount: 100,
        dpi: 300,
        targetDimensionsMm: { width: 210, height: 297 },
        targetDimensionsPx: { width: 2480, height: 3508 },
        estimates: Array.from({ length: 100 }, (_, i) => ({
          pageId: `p${i}`,
          widthPx: 2480,
          heightPx: 3508,
          bleedPx: 10,
          trimPx: 5,
          pageBounds: [10, 10, 2470, 3498] as [number, number, number, number],
          contentBounds: [50, 50, 2430, 3458] as [number, number, number, number],
        })),
      },
      pipelineResult: {
        runId: "run-test",
        status: "success",
        pagesProcessed: 100,
        errors: [],
        metrics: { durationMs: 5000 },
      },
      errors: [],
    };

    const evaluation = evaluateResults(mockResult);
    expect(evaluation.success).toBe(true);
    expect(evaluation.observations.length).toBeGreaterThan(0);
    expect(evaluation.recommendations.length).toBeGreaterThan(0);
    expect(evaluation.metrics.totalPages).toBe(100);
    expect(evaluation.metrics.throughputPagesPerSecond).toBeCloseTo(20);
  });

  it("evaluateResults flags high variance", () => {
    const estimates = Array.from({ length: 10 }, (_, i) => ({
      pageId: `p${i}`,
      widthPx: i % 2 === 0 ? 2000 : 3000, // High variance
      heightPx: 3500,
      bleedPx: 10,
      trimPx: 5,
      pageBounds: [0, 0, 2000, 3500] as [number, number, number, number],
      contentBounds: [0, 0, 2000, 3500] as [number, number, number, number],
    }));

    const mockResult: PipelineRunnerResult = {
      success: true,
      runId: "run-variance",
      projectId: "var-test",
      pageCount: 10,
      durationMs: 1000,
      scanConfig: {
        projectId: "var-test",
        pages: estimates.map((e) => ({
          id: e.pageId,
          filename: `${e.pageId}.jpg`,
          originalPath: "",
          confidenceScores: {},
        })),
        targetDpi: 300,
        targetDimensionsMm: { width: 210, height: 297 },
      },
      analysisSummary: {
        projectId: "var-test",
        pageCount: 10,
        dpi: 300,
        targetDimensionsMm: { width: 210, height: 297 },
        targetDimensionsPx: { width: 2500, height: 3500 },
        estimates,
      },
      pipelineResult: {
        runId: "run-variance",
        status: "success",
        pagesProcessed: 10,
        errors: [],
        metrics: { durationMs: 1000 },
      },
      errors: [],
    };

    const evaluation = evaluateResults(mockResult);
    expect(evaluation.recommendations.some((r) => r.includes("variance"))).toBe(true);
  });
});
