# Asteria Studio — Product Brief

## Vision

Asteria Studio is an offline-first, desktop GUI that ingests scanned page sequences and delivers enterprise-grade normalized outputs: deskewed, dewarped, consistently cropped, and harmonized layouts with detected page elements (titles, folios, ornaments, body text) and confidence scores. It behaves like a professional layout designer/typesetter while preserving user control and auditability.

## Target Users

- Layout designers and production artists who need precise control and rapid QA.
- Digitization specialists handling large, varied corpora.
- Reviewers who sign off on publication-ready pages.

## Primary Outcomes

- Consistent page geometry across a corpus (crop, DPI, bleed, trim) with minimal manual touch.
- Accurate detection of key elements with confidence scoring and overlays to accelerate QA.
- Repeatable, auditable runs with versioned outputs and reversible overrides.

## Key Capabilities

- Ingest PDFs or page image sequences; auto-detect page bounds, margins, and ornaments.
- Deskew and dewarp with adaptive strategies (classical + ML), with per-page quality scores.
- Normalize layout to user-provided book dimensions (mm, cm, inches) and target DPI; auto-select best crop ratio and scaling.
- Element detection: titles, chapter headers, running heads, folios, body text zones, drop caps, ornaments/decorators, marginalia, footnotes.
- Confidence-scored overlays with per-element actions (accept, adjust, ignore).
- Batch processing with a review queue (before/after, split view, zoom, compare).
- Rulesets/presets per project; bulk-apply normalization and overrides.
- Export: normalized images (PNG/TIFF/PDF) + JSON sidecars for layout metadata; run manifests for audit.
- Offline-first; optional remote accelerators for heavy models; local project storage.

## Success Criteria

- ≥95% correct deskew within ±0.3° on test sets; ≥90% accurate page bounding boxes within 2px tolerance.
- ≥90% element detection F1 on titles and folios; configurable thresholds for ornaments.
- QA throughput: reviewer clears ≥300 pages/hour with overlays and bulk actions.
- Deterministic, reproducible outputs given same inputs and config; versioned runs.

## Constraints & Principles

- Privacy by default: all processing local; optional remote model endpoints behind explicit opt-in.
- Deterministic pipelines with run manifests and checksums.
- Graceful degradation on CPU-only systems; GPU acceleration when present.
- Robustness to diverse scans: uneven lighting, curls, gutter shadow, bleed-through, rotated inserts.

## Not in Scope (initial)

- Full ePub/HTML reflow generation.
- Handwriting transcription.
- Cloud collaboration; initial release is single-machine with local projects.
