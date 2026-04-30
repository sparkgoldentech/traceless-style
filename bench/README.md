# traceless-style benchmarks

Concrete measurements that back up the scale claims in the main README.

## Quick start

```bash
npm run build              # required first
node bench/run-all.mjs     # full sweep — ~10 seconds
```

Output lands at `bench/RESULTS.md` and on stdout.

## What's measured

| Bench | What it proves |
|---|---|
| **hash-collision** | Atomic class names stay collision-free at 100K, 1M, 5M unique rules. The 8-char base36 hash distributes uniformly. |
| **synthetic-project** | Cold + warm extraction time on a 10K-file synthetic project. Validates the file-level cache delivers a real speedup. |

## Scale knobs

| Env var | Default | Effect |
|---|---|---|
| `BENCH_FILES` | `10000` | Number of synthetic files |
| `BENCH_GROUPS` | `5` | `tl.create` groups per file |
| `BENCH_PROPS` | `8` | Properties per group |
| `BENCH_SKIP_HASH` | unset | Skip the 5M-rule hash sweep (~5s saved) |

```bash
# 100K-file sweep (slow — only run if you have time):
BENCH_FILES=100000 node bench/run-all.mjs

# Smoke test — fast, useful for iterating on the bench itself:
BENCH_FILES=500 BENCH_SKIP_HASH=1 node bench/run-all.mjs
```

## When to re-run

- Before tagging a release
- After touching `src/compiler/hash.ts` or the FNV impl in `src/runtime/index.ts`
- After changing the cache machinery (`src/cli/file-cache.ts`)
- After significant `src/compiler/extractor*.ts` changes

Commit the updated `RESULTS.md` with the relevant change so the README's
performance claims stay backed by current numbers.

## CI integration

`.github/workflows/bench.yml` runs the benchmark suite automatically:

- **On every PR** that touches `src/`, `bench/`, or workflow files: runs the
  bench at `BENCH_FILES=5000` (smaller than the local 10K default to keep
  CI fast), then **posts a sticky comment on the PR** with the results.
  The comment is updated in place across pushes (no spam).
- **On pushes to `main`**: runs the same bench and uploads the result as a
  workflow artifact named `bench-baseline` (90-day retention). PRs fetch
  this artifact and render a side-by-side comparison so reviewers can spot
  perf regressions at a glance.

CI scale (5K files) is calibrated so a full job finishes in under 2 minutes
on a free-tier `ubuntu-latest` runner. Use the local `npm run bench`
command for the full 10K-scale measurements before tagging releases.
