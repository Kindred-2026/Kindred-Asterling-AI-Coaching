# GitHub branch cleanup record

**Audit date:** 2026-09-24. **Canonical repository:**
`Kindred-2026/Kindred-Asterling-AI-Coaching`.

GitHub's current branch inventory contains two active refs: `main` and
`codex/snyk-iac-no-files` for open PR #148. PR #147 merged at
`49e0be1199d1ce91e951d2b0d468fb352fb13381`; PR #148 carries the Snyk workflow
follow-up. Before cleanup, 16 historical work branches had exactly one commit
outside canonical `main`. All 16 exact tips were archived as annotated GitHub
tags and verified against the live branch SHAs before the old branch names
were deleted. No unique commit was lost. The temporary post-merge branch
`codex/remove-confirmed-unused-eks-assets` was deleted after its follow-up
workflow commits were copied to PR #148.

Canonical `main` is at `49e0be1199d1ce91e951d2b0d468fb352fb13381`. Each archive
Each archive
tag retains its original branch tip and history:

| Original branch | Archived tip commit | GitHub archive tag | Remaining disposition |
| --- | --- | --- | --- |
| `add-helcim-client-tests-18084520937674059310` | `a980fcc9330861e5f23db979366dcf44ced6097b` | `refs/tags/archive/kindred-finalization-2026-09-24/add-helcim-client-tests-18084520937674059310` | Compare Helcim tests with current coverage before incorporating. |
| `clerk-deploy` | `fd13463043cd7e2f9d9967c1ce87c624186ec0d0` | `refs/tags/archive/kindred-finalization-2026-09-24/clerk-deploy` | Historical Clerk/Ollama integration; retain until auth/AI archive review is complete. |
| `feature/test-requireAuth-middleware-16430618777044322343` | `f0d5718fd63f1bd5012ea199e309ba3202e7b1b7` | `refs/tags/archive/kindred-finalization-2026-09-24/feature/test-requireAuth-middleware-16430618777044322343` | Verify whether its pnpm lockfile change is already obsolete. |
| `fix/profile-tab-and-calendar-1705918431524620065` | `6f1439d47ec0b136e96107fc275cc309a88e7297` | `refs/tags/archive/kindred-finalization-2026-09-24/fix/profile-tab-and-calendar-1705918431524620065` | Calendar is retired; keep its unique feature change available for later product disposition. |
| `jules-16422388435627167883-1a1e47ad` | `e842129dbe780afee37bb18dd5c453aa99a3371e` | `refs/tags/archive/kindred-finalization-2026-09-24/jules-16422388435627167883-1a1e47ad` | Compare dependency overrides with the current lockfile. |
| `jules-5339671808958995687-30f3b816` | `dcf49a5ec3cc7fffb263b109bff6616824b3daab` | `refs/tags/archive/kindred-finalization-2026-09-24/jules-5339671808958995687-30f3b816` | Compare daily quota tests with current coverage. |
| `jules-add-temporary-debug-clerk-token-rejection-14625095024357557856` | `e31061f9d9919b947f037c6a42b2ee592cea20cb` | `refs/tags/archive/kindred-finalization-2026-09-24/jules-add-temporary-debug-clerk-token-rejection-14625095024357557856` | Confirm dependency/security relevance; Bedrock runtime is removed. |
| `jules-add-tests-for-is-rate-limit-error-2942310381242336347` | `ea6414c31e65a5ad0489fc4c000efff10175e519` | `refs/tags/archive/kindred-finalization-2026-09-24/jules-add-tests-for-is-rate-limit-error-2942310381242336347` | Verify whether the Vitest catalog change is already obsolete. |
| `jules-testing-improvement-voice-api-8345765860717744160` | `72320468684677ffb4e745ce3489f87408a4095c` | `refs/tags/archive/kindred-finalization-2026-09-24/jules-testing-improvement-voice-api-8345765860717744160` | Compare voice API tests with current coverage. |
| `palette-accessibility-improvement-5932597615083319181` | `be216f32bc2b46aafe358c0dc8f3569a39778326` | `refs/tags/archive/kindred-finalization-2026-09-24/palette-accessibility-improvement-5932597615083319181` | Review accessibility changes for later incorporation. |
| `palette-focus-states-5302378551670806211` | `ad0bbdf869b4c12544a9f6f2a83f8cfa7e42526b` | `refs/tags/archive/kindred-finalization-2026-09-24/palette-focus-states-5302378551670806211` | Review chat keyboard-focus changes for later incorporation. |
| `palette-ux-habit-delete-alert-8005619291881855247` | `969074e7e3ea14a132b701b800c7d5a4857ae457` | `refs/tags/archive/kindred-finalization-2026-09-24/palette-ux-habit-delete-alert-8005619291881855247` | Review habit-delete confirmation change for later incorporation. |
| `perf/habit-streaks-n-plus-1-6665839726205118531` | `a74b07e3032487f8c607110b9b270b55c76123e6` | `refs/tags/archive/kindred-finalization-2026-09-24/perf/habit-streaks-n-plus-1-6665839726205118531` | Re-run current CodeQL/dependency checks before disposition. |
| `perf/optimize-mood-trend-queries-3907283663464276802` | `6f73f554aaee5f4f85a9b70b96441264f2ad6682` | `refs/tags/archive/kindred-finalization-2026-09-24/perf/optimize-mood-trend-queries-3907283663464276802` | Confirm dependency/security relevance; Bedrock runtime is removed. |
| `remove-clerk-debug-log-5059122180911178513` | `a646c3a8b6f3e1f0c6f4e87b2bd90cbe6963e13d` | `refs/tags/archive/kindred-finalization-2026-09-24/remove-clerk-debug-log-5059122180911178513` | Inspect its unique commit before final disposition. |
| `sentinel-fix-admin-users-wildcard-12420624341382487021` | `47a35d305371f7c2466ecfee1cfd5a52d0189223` | `refs/tags/archive/kindred-finalization-2026-09-24/sentinel-fix-admin-users-wildcard-12420624341382487021` | Review against the current MongoDB admin query layer. |

To inspect an archived tip, fetch tags and use `git show <archive-tag>`; to
continue its work, create a new branch from the tag after reviewing it. Do not
delete an archive tag until its unique work is incorporated or its disposition
is explicitly resolved.
