# Phase 3 completion report

> **Historical document.** This completion report is superseded operational guidance.
> GitLab is confirmed unused by the owner; GitHub Actions is the sole active CI path.
> Current instructions and source of truth are in `docs/FINALIZATION_RECORD.md`
> and the current release/rollback documentation. No Fly.io deployment is claimed.

Branch: `codex/phase-3a-dev-workflow`
Baseline (merge-base with `origin/main`): `2205b98`
Local worktree: `/tmp/kindred-phase-3a` (git worktree of the shared repository).

The terminal SHA and post-commit validation results for this assignment are
recorded in the delivery response (or a nontracked evidence artifact), not
self-referentially committed here.

## Summary

Phases 3A–3D are implemented and locally verified. Everything is locally
committed only: nothing was pushed, merged, deployed, or production-verified in
this assignment. Real GitLab CI for the final SHA, live Auth0 acceptance, and
the Coolify production release remain pending external gates requiring an
authorized later handoff.

## Part SHAs

| Part | Commits | Contents |
| ---- | ------- | -------- |
| 3A groundwork + review | `84cae51` | root `pnpm dev` launcher (product UI + API + disposable MongoDB) |
| 3A | `ceebb23`, `983d90e` | supervise shutdown through startup, wait for descendants, truthful Auth0 fallback, late-provisioning cleanup and bounded service stops |
| 3A review (DB worker) | `6bdebb0` | owned disposable-DB worker using the real `MongoMemoryReplSet` interface; no fixture-only `forceStop` |
| 3B toolchain/regeneration | `7f5de78` | pin `orval` deps, regenerate OpenAPI clients |
| 3B verify machinery | `12516b1` | `pnpm verify` orchestrator, prettier boundary, `generate:check` sandbox drift check, sanitized child env |
| 3B review (evidence) | `650b22e` | content-bound evidence fingerprint, schema/toolchain version, full component set |
| 3C | `6513a40` | `.gitlab-ci.yml` parity, `pnpm release:check` read-only gate + evidence stamp + tests |
| 3D | `25bcc12` | root README, release/rollback + tools inventory docs |

## Final review corrections

The Phase 3 final-review findings were resolved in follow-up commits (the
terminal SHA is recorded in the delivery response):

1. Disposable-DB worker binds to the real library interface and releases a
   hanging stop through an owned process-group SIGKILL (bounded), rather than a
   fixture-only `forceStop`.
2. Verification evidence is bound to the candidate's actual contents (raw
   porcelain plus a per-path content hash), records the evidence schema, the
   complete component set and the pinned toolchain, and invalidates on failure,
   interruption, or a working tree that changed during the run.
3. `release:check` requires `VITE_AUTH0_CLIENT_ID`, rejects whitespace-only
   values, and distinguishes presence from coherence; `collectConfig(env)` uses
   its supplied environment. `pnpm verify` restores explicit synthetic public
   Auth0 build identifiers and isolates automated builds from ignored local env
   overrides.
4. `.gitlab-ci.yml` uses the correct `CI_PIPELINE_SOURCE == "schedule"` value and
   runs every component through the shared `scripts/ci-run.mjs` safe environment
   so CI provider variables cannot leak into tests/builds.
5. `pnpm verify` aborts the in-flight component and its owned process group on
   SIGINT/SIGTERM (no later component runs, no success evidence is written).
   `generate:check` snapshots only the generator inputs and never copies
   `.env*`/secret/operational files.
6. Codegen normalizes generated EOF to a single trailing newline via
   `scripts/generated-normalize.mjs`; the clients were regenerated so
   `git diff --check <baseline>..HEAD` exits 0.

## Decisions

- **No repo-wide reformat.** Only a maintained prettier boundary
  (`.prettierrc.json`/`.prettierignore`, auto-discovered `scripts/*`, configs,
  package.json) is enforced; legacy/generated files are untouched.
- **`generate:check` snapshots only the generator inputs** (api-spec contract +
  config, the generated-client packages, root workspace/toolchain config) into a
  temp copy with `node_modules` symlinked back; it never copies `.env*` or
  operational files and byte-compares regenerated output against tracked trees.
- **Sanitized child env with synthetic public identifiers.** `pnpm verify` and
  the shared CI runner forward only a whitelist; secrets and real `VITE_*`
  values are never forwarded. Builds receive explicit synthetic Auth0
  identifiers so they are deterministic and isolated from ignored `.env.local`.
- **Codegen toolchain pinned.** `orval` pinned (v8.23.0 in the lockfile); a
  narrow deterministic normalization collapses generated EOF blank lines so
  codegen and `generate:check` agree on canonical output.
- **CI = one job per verify component** run through `scripts/ci-run.mjs` with
  the same safe environment and pinned toolchain; workflow rules drop redundant
  feature-branch push pipelines while keeping MR, default-branch, tag and
  `schedule` coverage. Security includes (SAST, dependency scanning, secret
  detection) are unchanged.
- **release:check is read-only.** Reports, never mutates, never calls a remote;
  unverified remote/production evidence is never marked passed. Missing remote
  access ⇒ unverified.
- **Docs update existing sources**; no new competing sources except the missing
  root README (entry point) and the required release/rollback + tools inventory.

## Rollback and remote proof (distinguished)

- The rollback procedure in `docs/release-rollback.md` is **documented**, not
  **tested** against a live deployment in this assignment.
- `release:check` push/merge fields compare the candidate against **cached**
  `origin/*` refs when present; they are not fresh remote proof. Obtaining fresh
  remote proof requires an authorized push, which is out of scope here.

## Omitted checks / pending external gates

- Real GitLab pipeline for the terminal SHA — pending authorized push (external).
- Live Auth0 production sign-in acceptance — pending authorized handoff.
- Coolify release, deployed-revision evidence, and production acceptance —
  pending authorized handoff.
- No operational data commands were executed; provider settings untouched;
  no permissions/billing changes.
