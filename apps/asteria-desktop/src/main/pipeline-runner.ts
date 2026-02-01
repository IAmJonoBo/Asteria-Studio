/* eslint-disable no-console */
/**
 * Pipeline Runner: End-to-end execution of corpus ingestion, analysis, and processing.
 * Used for testing and evaluation of the normalization pipeline.
 */

import path from "node:path";
import fs from "node:fs/promises";
import type {
  PipelineRunConfig,
  CorpusSummary,
  PipelineRunResult,
  PageData,
} from "../ipc/contracts.ts";
import { scanCorpus } from "../ipc/corpusScanner";
import { analyzeCorpus } from "../ipc/corpusAnalysis";
import { normalizePages, type NormalizationResult } from "./normalization";

type LayoutProfile = "cover" | "title" | "chapter" | "body";

const inferLayoutProfile = (page: PageData, index: number): LayoutProfile => {
  const name = page.filename.toLowerCase();
  if (index === 0 || name.includes("cover")) return "cover";
  if (name.includes("title") || name.includes("frontispiece")) return "title";
  if (name.includes("chapter") || name.includes("chap") || name.includes("page_001")) {
    return "chapter";
  }
  return "body";
};

export interface PipelineRunnerOptions {
  projectRoot: string;
  projectId: string;
  targetDpi?: number;
  targetDimensionsMm?: { width: number; height: number };
  sampleCount?: number; // Limit processing for eval
  outputDir?: string;
}

export interface PipelineRunnerResult {
  success: boolean;
  runId: string;
  projectId: string;
  pageCount: number;
  durationMs: number;
  scanConfig: PipelineRunConfig;
  analysisSummary: CorpusSummary;
  pipelineResult: PipelineRunResult;
  errors: Array<{ phase: string; message: string }>;
}

/**
 * Execute full pipeline: scan -> analyze -> process.
 */
export async function runPipeline(options: PipelineRunnerOptions): Promise<PipelineRunnerResult> {
  const startTime = Date.now();
  const runId = `run-${Date.now()}`;
  const errors: Array<{ phase: string; message: string }> = [];

  try {
    // Phase 1: Scan corpus
    console.log(`[${runId}] Scanning corpus at ${options.projectRoot}...`);
    const scanConfig = await scanCorpus(options.projectRoot, {
      includeChecksums: true,
      targetDpi: options.targetDpi,
      targetDimensionsMm: options.targetDimensionsMm,
      projectId: options.projectId,
    });
    console.log(`[${runId}] Scan complete: ${scanConfig.pages.length} pages discovered`);

    // Apply overrides if provided
    if (options.targetDpi) {
      scanConfig.targetDpi = options.targetDpi;
    }
    if (options.targetDimensionsMm) {
      scanConfig.targetDimensionsMm = options.targetDimensionsMm;
    }
    scanConfig.projectId = options.projectId;

    // Sample if requested
    let configToProcess = scanConfig;
    if (options.sampleCount && options.sampleCount < scanConfig.pages.length) {
      configToProcess = {
        ...scanConfig,
        pages: scanConfig.pages.slice(0, options.sampleCount),
      };
      console.log(
        `[${runId}] Sampling ${options.sampleCount} of ${scanConfig.pages.length} pages for evaluation`
      );
    }

    // Phase 2: Analyze corpus
    console.log(`[${runId}] Analyzing corpus bounds for ${configToProcess.pages.length} pages...`);
    const analysisSummary = await analyzeCorpus(configToProcess);
    console.log(
      `[${runId}] Analysis complete: page bounds computed, ${analysisSummary.estimates.length} estimates`
    );

    // Phase 3: Normalization
    console.log(`[${runId}] Running normalization pipeline...`);
    const normalizationResults = await normalizePages(
      configToProcess.pages,
      analysisSummary,
      options.outputDir ?? path.join(process.cwd(), "pipeline-results")
    );
    console.log(`[${runId}] Normalized ${normalizationResults.size} pages`);

    const normArray = Array.from(normalizationResults.values());
    const avgSkew =
      normArray.reduce((sum, n) => sum + Math.abs(n.skewAngle), 0) / Math.max(1, normArray.length);
    const avgMaskCoverage =
      normArray.reduce((sum, n) => sum + n.stats.maskCoverage, 0) / Math.max(1, normArray.length);
    const shadowRate =
      normArray.filter((n) => n.shadow.present).length / Math.max(1, normArray.length);
    const lowCoverageCount = normArray.filter((n) => n.stats.maskCoverage < 0.5).length;

    const pipelineResult: PipelineRunResult = {
      runId,
      status: "success",
      pagesProcessed: configToProcess.pages.length,
      errors: [],
      metrics: {
        durationMs: Date.now() - startTime,
        estimatedPages: analysisSummary.pageCount,
        targetDpi: analysisSummary.dpi,
        normalizedPages: normalizationResults.size,
        normalization: {
          avgSkewDeg: avgSkew,
          avgMaskCoverage,
          shadowRate,
          lowCoverageCount,
        },
      },
    };
    console.log(`[${runId}] Pipeline complete in ${pipelineResult.metrics.durationMs}ms`);

    // Phase 4: Save results
    if (options.outputDir) {
      await fs.mkdir(options.outputDir, { recursive: true });
      const reportPath = path.join(options.outputDir, `${runId}-report.json`);
      await fs.writeFile(
        reportPath,
        JSON.stringify(
          {
            runId,
            projectId: options.projectId,
            scanConfig: {
              pageCount: scanConfig.pages.length,
              targetDpi: scanConfig.targetDpi,
              targetDimensionsMm: scanConfig.targetDimensionsMm,
            },
            analysisSummary,
            pipelineResult,
          },
          null,
          2
        )
      );
      console.log(`[${runId}] Report saved to ${reportPath}`);

      await writeSidecars(
        configToProcess,
        analysisSummary,
        normalizationResults,
        options.outputDir,
        runId
      );
    }

    return {
      success: true,
      runId,
      projectId: options.projectId,
      pageCount: configToProcess.pages.length,
      durationMs: Date.now() - startTime,
      scanConfig: configToProcess,
      analysisSummary,
      pipelineResult,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ phase: "pipeline", message });
    console.error(`[${runId}] Pipeline failed:`, message);

    return {
      success: false,
      runId,
      projectId: options.projectId,
      pageCount: 0,
      durationMs: Date.now() - startTime,
      scanConfig: {
        projectId: options.projectId,
        pages: [],
        targetDpi: options.targetDpi ?? 300,
        targetDimensionsMm: options.targetDimensionsMm ?? { width: 210, height: 297 },
      },
      analysisSummary: {
        projectId: options.projectId,
        pageCount: 0,
        dpi: options.targetDpi ?? 300,
        targetDimensionsMm: options.targetDimensionsMm ?? { width: 210, height: 297 },
        targetDimensionsPx: { width: 0, height: 0 },
        estimates: [],
      },
      pipelineResult: {
        runId,
        status: "error",
        pagesProcessed: 0,
        errors: errors.map((e) => ({ pageId: e.phase, message: e.message })),
        metrics: { durationMs: Date.now() - startTime },
      },
      errors,
    };
  }
}

const writeSidecars = async (
  config: PipelineRunConfig,
  analysis: CorpusSummary,
  normalization: Map<string, NormalizationResult>,
  outputDir: string,
  runId: string
): Promise<void> => {
  const sidecarDir = path.join(outputDir, "sidecars");
  await fs.mkdir(sidecarDir, { recursive: true });

  const estimatesById = new Map(analysis.estimates.map((e) => [e.pageId, e]));

  await Promise.all(
    config.pages.map(async (page, index) => {
      const estimate = estimatesById.get(page.id);
      const norm = normalization.get(page.id);
      if (!estimate || !norm) return;

      const bleedMm = norm.bleedMm;
      const trimMm = norm.trimMm;
      const layoutProfile = inferLayoutProfile(page, index);
      const deskewConfidence = Math.min(1, norm.stats.skewConfidence + 0.25);

      const shadowFlags = [] as string[];
      if (norm.shadow.present) {
        shadowFlags.push(`shadow:${norm.shadow.side}`);
      }
      if (norm.stats.maskCoverage < 0.6) {
        shadowFlags.push("low-coverage");
      }

      const accepted = norm.stats.maskCoverage >= 0.5 && deskewConfidence >= 0.2;
      const notes = accepted ? "Auto-accepted" : "Requires review";

      const sidecar = {
        version: "1.0.0",
        pageId: page.id,
        source: {
          path: page.originalPath,
          checksum: page.checksum ?? "",
        },
        dimensions: {
          width: norm.dimensionsMm.width,
          height: norm.dimensionsMm.height,
          unit: "mm",
        },
        dpi: Math.round(norm.dpi),
        normalization: {
          cropBox: norm.cropBox,
          pageMask: norm.maskBox,
          dpiSource: norm.dpiSource,
          bleed: bleedMm,
          trim: trimMm,
          scale: 1,
          skewAngle: norm.skewAngle,
          warp: { method: "affine", residual: 0 },
          shadow: norm.shadow,
        },
        elements: [
          {
            id: `${page.id}-page-bounds`,
            type: "page_bounds",
            bbox: norm.cropBox,
            confidence: 0.5,
            source: "local",
            flags: shadowFlags,
          },
        ],
        layoutProfile,
        metrics: {
          processingMs: (analysis as unknown as { processingMs?: number }).processingMs ?? 0,
          deskewConfidence,
          shadowScore: norm.stats.shadowScore,
          maskCoverage: norm.stats.maskCoverage,
          backgroundStd: norm.stats.backgroundStd,
        },
        decisions: {
          accepted,
          notes,
          overrides: shadowFlags,
        },
        normalizationRunId: runId,
      };

      const outPath = path.join(sidecarDir, `${page.id}.json`);
      await fs.writeFile(outPath, JSON.stringify(sidecar, null, 2));
    })
  );
};

const analyzeDimensions = (
  estimates: CorpusSummary["estimates"],
  pageCount: number
): {
  observations: string[];
  recommendations: string[];
  metrics: Record<string, number>;
} => {
  if (estimates.length === 0) {
    return { observations: [], recommendations: [], metrics: {} };
  }

  const widths = estimates.map((e) => e.widthPx);
  const heights = estimates.map((e) => e.heightPx);
  const avgWidth = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length);
  const avgHeight = heights.reduce((a, b) => a + b, 0) / Math.max(1, heights.length);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);

  const observations = [
    `Scanned ${pageCount} pages, analyzed ${estimates.length} bounds`,
    `Average page dimensions: ${Math.round(avgWidth)} x ${Math.round(avgHeight)} px`,
    `Width range: ${minWidth} - ${maxWidth} px`,
    `Height range: ${minHeight} - ${maxHeight} px`,
  ];

  const widthStdDev =
    Math.sqrt(widths.reduce((sum, w) => sum + Math.pow(w - avgWidth, 2), 0) / widths.length) /
    Math.max(1, avgWidth);
  const heightStdDev =
    Math.sqrt(heights.reduce((sum, h) => sum + Math.pow(h - avgHeight, 2), 0) / heights.length) /
    Math.max(1, avgHeight);

  const recommendations = [] as string[];
  if (widthStdDev > 0.1 || heightStdDev > 0.1) {
    recommendations.push(
      `High page dimension variance detected (${(widthStdDev * 100).toFixed(1)}% width, ${(heightStdDev * 100).toFixed(1)}% height)`
    );
  }

  const metrics = {
    widthVariance: widthStdDev,
    heightVariance: heightStdDev,
  } as Record<string, number>;

  const bleeds = estimates.map((e) => e.bleedPx);
  const trims = estimates.map((e) => e.trimPx);
  const avgBleed = bleeds.reduce((a, b) => a + b, 0) / Math.max(1, bleeds.length);
  const avgTrim = trims.reduce((a, b) => a + b, 0) / Math.max(1, trims.length);
  observations.push(
    `Average bleed: ${avgBleed.toFixed(1)} px, average trim: ${avgTrim.toFixed(1)} px`
  );

  if (avgBleed === 0 || avgTrim === 0) {
    observations.push("Bleed/trim detection used fallback values");
    recommendations.push("Verify JPEG SOF markers are readable; consider improving marker parsing");
  }

  return { observations, recommendations, metrics };
};

const analyzeNormalizationMetrics = (
  normalizationMetrics:
    | {
        avgSkewDeg?: number;
        avgMaskCoverage?: number;
        shadowRate?: number;
        lowCoverageCount?: number;
      }
    | undefined
): { observations: string[]; recommendations: string[] } => {
  if (!normalizationMetrics) {
    return { observations: [], recommendations: [] };
  }

  const observations: string[] = [];
  const recommendations: string[] = [];

  if (normalizationMetrics.avgSkewDeg !== undefined) {
    observations.push(`Average residual skew: ${normalizationMetrics.avgSkewDeg.toFixed(2)}°`);
  }
  if (normalizationMetrics.avgMaskCoverage !== undefined) {
    observations.push(
      `Average mask coverage: ${(normalizationMetrics.avgMaskCoverage * 100).toFixed(1)}%`
    );
  }
  if (normalizationMetrics.shadowRate !== undefined) {
    observations.push(
      `Shadow detection rate: ${(normalizationMetrics.shadowRate * 100).toFixed(1)}%`
    );
  }
  if ((normalizationMetrics.lowCoverageCount ?? 0) > 0) {
    recommendations.push(
      `${normalizationMetrics.lowCoverageCount} pages have low mask coverage (<50%); review crop padding or thresholding`
    );
  }
  if ((normalizationMetrics.shadowRate ?? 0) > 0.15) {
    recommendations.push(
      "Spine/edge shadows frequent; increase edge margin or shadow compensation"
    );
  }
  if ((normalizationMetrics.avgMaskCoverage ?? 1) < 0.7) {
    recommendations.push("Tight crops detected; increase padding or relax mask threshold");
  }

  return { observations, recommendations };
};

/**
 * Evaluate pipeline results and recommend improvements.
 */
export function evaluateResults(result: PipelineRunnerResult): {
  success: boolean;
  metrics: Record<string, unknown>;
  observations: string[];
  recommendations: string[];
} {
  const observations: string[] = [];
  const recommendations: string[] = [];

  if (!result.success) {
    observations.push(`Pipeline failed with ${result.errors.length} error(s)`);
    result.errors.forEach((e) => {
      recommendations.push(`[${e.phase}] ${e.message}`);
    });
    return { success: false, metrics: {}, observations, recommendations };
  }

  // Metrics
  const metrics: Record<string, unknown> = {
    totalPages: result.pageCount,
    durationMs: result.durationMs,
    throughputPagesPerSecond: (result.pageCount / result.durationMs) * 1000,
    avgTimePerPageMs: result.durationMs / Math.max(1, result.pageCount),
    normalization: (result.pipelineResult.metrics as { normalization?: unknown }).normalization,
  };

  // Page bounds analysis
  const dimensionInsights = analyzeDimensions(result.analysisSummary.estimates, result.pageCount);
  observations.push(...dimensionInsights.observations);
  recommendations.push(...dimensionInsights.recommendations);
  Object.assign(metrics, dimensionInsights.metrics);

  const targetObservations = [
    `Target DPI: ${result.analysisSummary.dpi}`,
    `Target dimensions: ${result.analysisSummary.targetDimensionsMm.width}mm x ${result.analysisSummary.targetDimensionsMm.height}mm`,
  ];
  observations.push(...targetObservations);

  const normalizationMetrics = (
    result.pipelineResult.metrics as { normalization?: Record<string, number> }
  ).normalization;
  const normalizationInsights = analyzeNormalizationMetrics(
    normalizationMetrics as {
      avgSkewDeg?: number;
      avgMaskCoverage?: number;
      shadowRate?: number;
      lowCoverageCount?: number;
    }
  );
  observations.push(...normalizationInsights.observations);
  recommendations.push(...normalizationInsights.recommendations);

  // General recommendations
  const generalRecommendations: string[] = [];
  if (result.pageCount > 100) {
    generalRecommendations.push("Consider batch processing for large corpora (100+ pages)");
  }

  if (result.analysisSummary.estimates.some((e) => e.pageBounds[2] === 0)) {
    generalRecommendations.push("Some pages have zero content bounds; review detection logic");
  }

  generalRecommendations.push(
    "Integrate Rust pipeline-core for advanced dewarp and detection outputs",
    "Implement parallel processing for page analysis and normalization"
  );
  recommendations.push(...generalRecommendations);

  return {
    success: true,
    metrics,
    observations,
    recommendations,
  };
}
