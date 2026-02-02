# Agent instructions

## Golden corpus requirements

- Any changes to shading, split, crop, or book-prior logic must update the golden corpus and pass `pnpm golden:test`.
- QA thresholds must remain config-driven. If a threshold changes, the failure reason should cite the config key that triggered it.
- When updating thresholds, also update the golden manifest thresholds and re-bless expected outputs.
