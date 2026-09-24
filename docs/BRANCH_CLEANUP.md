# GitHub branch cleanup record

**Audit date:** 2026-09-23; refreshed 2026-09-23. **Canonical repository:**
`Kindred-2026/Kindred-Asterling-AI-Coaching`. The audit inspected all 18 remote
branch refs and queried GitHub pull requests. No PRs were returned, so there is
no PR merge record to use as proof of incorporation.

The initial 18-ref count predates this finalization work. GitHub later listed 19
refs including `codex/kindred-finalization`; draft PR
[#146](https://github.com/Kindred-2026/Kindred-Asterling-AI-Coaching/pull/146)
is open against `main`. On 2026-09-24, the merged
`codex/auth0-identity-resolution-observability-20260921` branch was deleted
after confirming PR #145 was merged and its exact tip was an ancestor of
canonical `main`. GitHub now lists 18 refs. The canonical `main` SHA is still
`7c264f6e5fecdee0739075bd66d432bb9fa6ba85`.

Only `main` is currently ancestor-equivalent to canonical `main`. Every other
branch has unique commits not reachable from `main` or is the active finalization
review branch. Do not delete or force-update any of these refs until its changes
are reviewed and either incorporated or explicitly archived by the owner.

| Remote branch | Last commit date | Tip subject | Disposition |
| --- | --- | --- | --- |
| `add-helcim-client-tests-18084520937674059310` | 2026-08-05 | Add tests for helcimClient | Preserve; compare tests with current Helcim coverage |
| `clerk-deploy` | 2026-08-07 | Forward Clerk tokens to API requests | Preserve as historical auth rollback work until Clerk retirement is confirmed |
| `feature/test-requireAuth-middleware-16430618777044322343` | 2026-07-30 | fix(pnpm): Update package.json and lockfile to resolve pnpm lock mismatch in CI | Preserve; verify whether lockfile change remains relevant |
| `fix/profile-tab-and-calendar-1705918431524620065` | 2026-08-09 | Fix dock profile dynamic update and add Google Calendar sync to Profile tab | Preserve; Calendar integration is currently retired and branch has unique code |
| `jules-16422388435627167883-1a1e47ad` | 2026-08-04 | chore(deps): apply pnpm overrides for security vulnerabilities | Preserve; compare overrides with current lockfile |
| `jules-5339671808958995687-30f3b816` | 2026-07-28 | Add tests for daily quota tracking | Preserve; compare test coverage |
| `jules-add-temporary-debug-clerk-token-rejection-14625095024357557856` | 2026-08-24 | Update Bedrock dependency for fast-xml-parser vulnerabilities | Preserve until dependency/security effect is confirmed; Bedrock runtime is removed in this branch |
| `jules-add-tests-for-is-rate-limit-error-2942310381242336347` | 2026-07-30 | Fix lockfile mismatch for vitest by adding to catalog | Preserve; verify current lockfile makes it obsolete |
| `jules-testing-improvement-voice-api-8345765860717744160` | 2026-07-30 | Add tests for voice-api appendTranscript | Preserve; compare voice coverage |
| `palette-accessibility-improvement-5932597615083319181` | 2026-08-01 | Add aria labels to habit toggle and delete buttons | Preserve; review accessibility change for incorporation |
| `palette-focus-states-5302378551670806211` | 2026-08-05 | Add keyboard focus states to chat interface buttons | Preserve; review accessibility change for incorporation |
| `palette-ux-habit-delete-alert-8005619291881855247` | 2026-08-08 | Add confirmation dialog for deleting habits | Preserve; review UX change for incorporation |
| `perf/habit-streaks-n-plus-1-6665839726205118531` | 2026-08-24 | Resolve CodeQL warnings and upgrade fast-xml-parser | Preserve; re-run current CodeQL/dependency checks before disposition |
| `perf/optimize-mood-trend-queries-3907283663464276802` | 2026-08-24 | Update Bedrock dependency for fast-xml-parser vulnerabilities | Preserve until dependency/security effect is confirmed; Bedrock runtime is removed in this branch |
| `remove-clerk-debug-log-5059122180911178513` | 2026-08-24 | chore: ignore issue as codebase is clean | Preserve; inspect commit diff before disposition |
| `sentinel-fix-admin-users-wildcard-12420624341382487021` | 2026-08-04 | Fix SQL wildcard injection in /admin/users | Preserve and review for applicability to the current MongoDB query layer |

These refs remain available in GitHub. A future branch-pruning pass should compare
the exact path-level diffs with `main`, confirm no open or draft review depends
on each branch, record incorporated/archived changes, and only then delete refs
whose complete work is already represented in canonical history.
