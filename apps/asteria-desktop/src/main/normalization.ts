import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { CorpusSummary, PageBoundsEstimate, PageData } from "../ipc/contracts.ts";

const MAX_PREVIEW_DIM = 1600;
const DEFAULT_PADDING_PX = 6;
const BORDER_SAMPLE_RATIO = 0.04;
const EDGE_THRESHOLD_SCALE = 1.4;
const MAX_SKEW_DEGREES = 8;
const COMMON_SIZES_MM = [
  { name: "A4", width: 210, height: 297 },
  { name: "Letter", width: 216, height: 279 },
  { name: "B5", width: 176, height: 250 },
  { name: "A5", width: 148, height: 210 },
  { name: "A3", width: 297, height: 420 },
];

interface PreviewImage {
  data: Uint8Array;
  width: number;
  height: number;
  scale: number;
}

interface ShadowDetection {
  present: boolean;
  side: "left" | "right" | "top" | "bottom" | "none";
  widthPx: number;
  confidence: number;
  darkness: number;
}

export interface NormalizationResult {
  pageId: string;
  normalizedPath: string;
  cropBox: [number, number, number, number];
  maskBox: [number, number, number, number];
  dimensionsMm: { width: number; height: number };
  dpi: number;
  dpiSource: "metadata" | "inferred" | "fallback";
  trimMm: number;
  bleedMm: number;
  skewAngle: number;
  shadow: ShadowDetection;
  stats: {
    backgroundMean: number;
    backgroundStd: number;
    maskCoverage: number;
    skewConfidence: number;
    shadowScore: number;
  };
}

const pxToMm = (px: number, dpi: number): number => (px / dpi) * 25.4;
const mmToInches = (mm: number): number => mm / 25.4;

const inferPhysicalSize = (
  widthPx: number,
  heightPx: number,
  density?: number,
  fallbackDpi = 300
): { widthMm: number; heightMm: number; dpi: number; source: NormalizationResult["dpiSource"] } => {
  if (density && density > 1) {
    return {
      widthMm: pxToMm(widthPx, density),
      heightMm: pxToMm(heightPx, density),
      dpi: density,
      source: "metadata",
    };
  }

  const ratio = widthPx / Math.max(1, heightPx);
  let best = { score: Number.POSITIVE_INFINITY, widthMm: 0, heightMm: 0, dpi: fallbackDpi };

  for (const size of COMMON_SIZES_MM) {
    const variants: Array<{ width: number; height: number }> = [
      { width: size.width, height: size.height },
      { width: size.height, height: size.width },
    ];
    for (const variant of variants) {
      const sizeRatio = variant.width / variant.height;
      const score = Math.abs(sizeRatio - ratio);
      if (score < best.score) {
        best = {
          score,
          widthMm: variant.width,
          heightMm: variant.height,
          dpi: widthPx / mmToInches(variant.width),
        };
      }
    }
  }

  if (best.score < 0.02) {
    return {
      widthMm: best.widthMm,
      heightMm: best.heightMm,
      dpi: best.dpi,
      source: "inferred",
    };
  }

  return {
    widthMm: pxToMm(widthPx, fallbackDpi),
    heightMm: pxToMm(heightPx, fallbackDpi),
    dpi: fallbackDpi,
    source: "fallback",
  };
};

const angleToBucket = (angle: number): number => {
  let normalized = angle;
  if (normalized > 90) normalized -= 180;
  if (normalized < -90) normalized += 180;
  return Math.max(0, Math.min(180, Math.round(normalized + 90)));
};

const gradientAt = (
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  gxKernel: number[],
  gyKernel: number[]
): { magnitude: number; angle: number } => {
  const idx = (ix: number, iy: number): number => iy * width + ix;
  let gx = 0;
  let gy = 0;
  let k = 0;
  for (let ky = -1; ky <= 1; ky++) {
    for (let kx = -1; kx <= 1; kx++) {
      const val = data[idx(x + kx, y + ky)];
      gx += gxKernel[k] * val;
      gy += gyKernel[k] * val;
      k++;
    }
  }
  return { magnitude: Math.hypot(gx, gy), angle: (Math.atan2(gy, gx) * 180) / Math.PI };
};

const computeGradientHistogram = (preview: PreviewImage): Float64Array => {
  const { data, width, height } = preview;
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [1, 2, 1, 0, 0, 0, -1, -2, -1];
  const histogram = new Float64Array(181); // -90..90 degrees

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const { magnitude, angle } = gradientAt(data, width, x, y, gxKernel, gyKernel);
      if (magnitude < 10) continue;
      const bucket = angleToBucket(angle);
      histogram[bucket] += magnitude;
    }
  }

  return histogram;
};

const loadPreview = async (imagePath: string): Promise<PreviewImage> => {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const scale = Math.min(1, MAX_PREVIEW_DIM / Math.max(width, height, 1));
  const resized =
    scale < 1 ? image.resize(Math.round(width * scale), Math.round(height * scale)) : image;
  const { data, info } = await resized
    .ensureAlpha()
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height, scale };
};

const estimateSkewAngle = (preview: PreviewImage): { angle: number; confidence: number } => {
  const histogram = computeGradientHistogram(preview);
  const { width, height } = preview;

  let bestBucket = 90;
  let bestVal = 0;
  histogram.forEach((val, i) => {
    if (val > bestVal) {
      bestVal = val;
      bestBucket = i;
    }
  });

  // Weighted average around the best bucket to smooth
  const window = 3;
  let num = 0;
  let den = 0;
  for (let i = Math.max(0, bestBucket - window); i <= Math.min(180, bestBucket + window); i++) {
    const w = histogram[i];
    num += (i - 90) * w;
    den += w;
  }
  const angle = den > 0 ? num / den : 0;
  const clipped = Math.max(-MAX_SKEW_DEGREES, Math.min(MAX_SKEW_DEGREES, angle));
  const confidence = Math.min(1, bestVal / (width * height * 4));
  return { angle: clipped, confidence };
};

const computeBorderStats = (preview: PreviewImage): { mean: number; std: number } => {
  const { data, width, height } = preview;
  const border = Math.max(1, Math.round(Math.min(width, height) * BORDER_SAMPLE_RATIO));
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  const sample = (x: number, y: number): void => {
    const v = data[y * width + x];
    sum += v;
    sumSq += v * v;
    count++;
  };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < border; y++) sample(x, y);
    for (let y = height - border; y < height; y++) sample(x, y);
  }
  for (let y = border; y < height - border; y++) {
    for (let x = 0; x < border; x++) sample(x, y);
    for (let x = width - border; x < width; x++) sample(x, y);
  }

  const mean = count > 0 ? sum / count : 255;
  const variance = count > 0 ? Math.max(0, sumSq / count - mean * mean) : 0;
  return { mean, std: Math.sqrt(variance) };
};

const computeMaskBox = (
  preview: PreviewImage,
  intensityThreshold: number
): { box: [number, number, number, number]; coverage: number } => {
  const { data, width, height } = preview;
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x];
      if (v < intensityThreshold) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  const rowLimit = Math.max(2, Math.floor(width * 0.008));
  const colLimit = Math.max(2, Math.floor(height * 0.008));
  let top = 0;
  while (top < height && rowCounts[top] < rowLimit) top++;
  let bottom = height - 1;
  while (bottom > top && rowCounts[bottom] < rowLimit) bottom--;
  let left = 0;
  while (left < width && colCounts[left] < colLimit) left++;
  let right = width - 1;
  while (right > left && colCounts[right] < colLimit) right--;

  const maskArea = (bottom - top + 1) * (right - left + 1);
  const coverage = Math.max(0, maskArea) / (width * height);
  return { box: [left, top, right, bottom], coverage };
};

const computeEdgeBox = (
  preview: PreviewImage,
  threshold: number
): [number, number, number, number] => {
  const { data, width, height } = preview;
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [1, 2, 1, 0, 0, 0, -1, -2, -1];
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const { magnitude } = gradientAt(data, width, x, y, gxKernel, gyKernel);
      if (magnitude > threshold) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  const rowLimit = Math.max(2, Math.floor(width * 0.004));
  const colLimit = Math.max(2, Math.floor(height * 0.004));
  let top = 0;
  while (top < height && rowCounts[top] < rowLimit) top++;
  let bottom = height - 1;
  while (bottom > top && rowCounts[bottom] < rowLimit) bottom--;
  let left = 0;
  while (left < width && colCounts[left] < colLimit) left++;
  let right = width - 1;
  while (right > left && colCounts[right] < colLimit) right--;

  return [left, top, right, bottom];
};

const computeEdgeThreshold = (preview: PreviewImage): number => {
  const { data, width, height } = preview;
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [1, 2, 1, 0, 0, 0, -1, -2, -1];
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const { magnitude } = gradientAt(data, width, x, y, gxKernel, gyKernel);
      sum += magnitude;
      sumSq += magnitude * magnitude;
      count++;
    }
  }

  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? Math.max(0, sumSq / count - mean * mean) : 0;
  const std = Math.sqrt(variance);
  return Math.max(8, mean + std * EDGE_THRESHOLD_SCALE);
};

const unionBox = (
  a: [number, number, number, number],
  b: [number, number, number, number]
): [number, number, number, number] => {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
};

const clampBox = (
  box: [number, number, number, number],
  width: number,
  height: number
): [number, number, number, number] => {
  const left = Math.max(0, Math.min(width - 2, box[0]));
  const top = Math.max(0, Math.min(height - 2, box[1]));
  const right = Math.max(left + 1, Math.min(width - 1, box[2]));
  const bottom = Math.max(top + 1, Math.min(height - 1, box[3]));
  return [left, top, right, bottom];
};

const detectShadows = (preview: PreviewImage): ShadowDetection => {
  const { data, width, height } = preview;
  const stripSize = Math.max(4, Math.round(width * 0.04));
  const idx = (x: number, y: number): number => y * width + x;

  const columnMean = (xStart: number, xEnd: number): number => {
    let sum = 0;
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      for (let y = 0; y < height; y++) {
        sum += data[idx(x, y)];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  };

  const globalMean = columnMean(0, width);
  const leftMean = columnMean(0, stripSize);
  const rightMean = columnMean(width - stripSize, width);

  const leftDelta = globalMean - leftMean;
  const rightDelta = globalMean - rightMean;
  const darkness = Math.max(leftDelta, rightDelta);
  const isLeft = leftDelta > rightDelta;
  const delta = isLeft ? leftDelta : rightDelta;
  const present = delta > Math.max(8, globalMean * 0.08);
  const confidence = Math.min(1, delta / Math.max(1, globalMean));
  let side: ShadowDetection["side"] = "none";
  if (present) {
    side = isLeft ? "left" : "right";
  }

  return {
    present,
    side,
    widthPx: present ? stripSize : 0,
    confidence,
    darkness,
  };
};

const expandBox = (
  box: [number, number, number, number],
  padding: number,
  width: number,
  height: number
): [number, number, number, number] => {
  const [x0, y0, x1, y1] = box;
  const left = Math.max(0, x0 - padding);
  const top = Math.max(0, y0 - padding);
  const right = Math.min(width - 1, x1 + padding);
  const bottom = Math.min(height - 1, y1 + padding);
  return [left, top, right, bottom];
};

export async function normalizePage(
  page: PageData,
  estimate: PageBoundsEstimate,
  analysis: CorpusSummary,
  outputDir: string
): Promise<NormalizationResult> {
  const imageMeta = await sharp(page.originalPath).metadata();
  const widthPx = imageMeta.width ?? estimate.widthPx;
  const heightPx = imageMeta.height ?? estimate.heightPx;
  const density = imageMeta.density ?? undefined;
  const physical = inferPhysicalSize(widthPx, heightPx, density, analysis.dpi);

  const preview = await loadPreview(page.originalPath);
  const skew = estimateSkewAngle(preview);

  const rotated = sharp(page.originalPath).rotate(skew.angle, {
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  });
  const rotatedRaw = await rotated
    .clone()
    .ensureAlpha()
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rotatedPreview: PreviewImage = {
    data: new Uint8Array(rotatedRaw.data),
    width: rotatedRaw.info.width,
    height: rotatedRaw.info.height,
    scale: 1,
  };

  const borderStats = computeBorderStats(rotatedPreview);
  const intensityThreshold = Math.max(
    0,
    Math.min(borderStats.mean - borderStats.std * 0.45, borderStats.mean - 6)
  );
  const intensityMask = computeMaskBox(rotatedPreview, intensityThreshold);
  const edgeThreshold = computeEdgeThreshold(rotatedPreview);
  const edgeBox = computeEdgeBox(rotatedPreview, edgeThreshold);
  let combinedBox = unionBox(intensityMask.box, edgeBox);

  const shadow = detectShadows(rotatedPreview);
  if (shadow.present && shadow.confidence > 0.25) {
    const trimPx = Math.round(shadow.widthPx * 0.75);
    if (shadow.side === "left") {
      combinedBox = [combinedBox[0] + trimPx, combinedBox[1], combinedBox[2], combinedBox[3]];
    }
    if (shadow.side === "right") {
      combinedBox = [combinedBox[0], combinedBox[1], combinedBox[2] - trimPx, combinedBox[3]];
    }
  }

  combinedBox = clampBox(combinedBox, rotatedPreview.width, rotatedPreview.height);

  const autoPadding = Math.max(
    DEFAULT_PADDING_PX,
    Math.round(Math.min(rotatedPreview.width, rotatedPreview.height) * 0.002)
  );
  const expanded = expandBox(combinedBox, autoPadding, rotatedPreview.width, rotatedPreview.height);
  const cropWidth = expanded[2] - expanded[0] + 1;
  const cropHeight = expanded[3] - expanded[1] + 1;

  const normalizedDir = path.join(outputDir, "normalized");
  await fs.mkdir(normalizedDir, { recursive: true });
  const normalizedPath = path.join(normalizedDir, `${page.id}.png`);

  await rotated
    .clone()
    .extract({ left: expanded[0], top: expanded[1], width: cropWidth, height: cropHeight })
    .withMetadata({ density: physical.dpi })
    .png({ compressionLevel: 6 })
    .toFile(normalizedPath);

  const trimMm = pxToMm(estimate.trimPx, physical.dpi);
  const bleedMm = pxToMm(estimate.bleedPx, physical.dpi);
  const maskArea = (expanded[2] - expanded[0] + 1) * (expanded[3] - expanded[1] + 1);
  const maskCoverage = Math.max(0, maskArea) / (rotatedPreview.width * rotatedPreview.height);

  return {
    pageId: page.id,
    normalizedPath,
    cropBox: [expanded[0], expanded[1], expanded[2], expanded[3]],
    maskBox: combinedBox,
    dimensionsMm: { width: physical.widthMm, height: physical.heightMm },
    dpi: physical.dpi,
    dpiSource: physical.source,
    trimMm,
    bleedMm,
    skewAngle: skew.angle,
    shadow,
    stats: {
      backgroundMean: borderStats.mean,
      backgroundStd: borderStats.std,
      maskCoverage,
      skewConfidence: skew.confidence,
      shadowScore: shadow.darkness,
    },
  };
}

export async function normalizePages(
  pages: PageData[],
  analysis: CorpusSummary,
  outputDir: string
): Promise<Map<string, NormalizationResult>> {
  const estimateById = new Map(analysis.estimates.map((e) => [e.pageId, e]));
  const results = new Map<string, NormalizationResult>();

  await Promise.all(
    pages.map(async (page) => {
      const estimate = estimateById.get(page.id);
      if (!estimate) return;
      const normalized = await normalizePage(page, estimate, analysis, outputDir);
      results.set(page.id, normalized);
    })
  );

  return results;
}
