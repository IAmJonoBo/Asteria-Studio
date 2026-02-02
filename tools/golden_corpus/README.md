# Golden corpus generator

Seeded generator for the Asteria Studio golden corpus v1.

## Quick start

From repo root:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r tools/golden_corpus/requirements.txt
python3 tools/golden_corpus/generate.py --seed 1337 --out tests/fixtures/golden_corpus/v1
```

If your system `python3` is too new for some dependencies, prefer `python3.11`.

## Adding a new case

1) Add a new page spec in `generate.py` with a unique id.
2) Provide truth fields (bounds, gutter, baseline grid, ornaments).
3) Update the manifest entry with tags and SSIM threshold.
4) Run `pnpm golden:bless` to regenerate expected outputs.

## Determinism

- The generator seeds Python, NumPy, and OpenCV RNGs.
- Outputs are saved with fixed PNG compression level and no metadata.
- Re-running with the same seed should produce identical bytes.
