# Kindred checkout and worktree audit

**Audit date:** 2026-09-24. Canonical source is GitHub `main` at
`49e0be1199d1ce91e951d2b0d468fb352fb13381`. PR #147 merged. PR #149 is the
combined review branch (Snyk workflow fix plus repository cleanup) and targets
`main`; PR #148 remains open but its Snyk fix is included in #149. Do not merge
both. PR #149 checks passed before this checkout-audit update; rerun CI on the
new head before merge.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | local `main`, `49e0be1199d1ce91e951d2b0d468fb352fb13381` | Aligned to canonical GitHub `origin/main`; untracked `.vscode/` preserved | The former unique `40c8841` commit remains preserved at `archive/kindred-local-main-40c8841`. Its gitlink, reversed AI privacy statement, workspace placeholder, and inventory edits were reviewed and not ported. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean snapshot | Preserved outside the stale parent checkout after verifying it matched its recorded canonical baseline. |
| `kindred-snyk-iac-followup` | `codex/snyk-iac-no-files` at `690853726651652c22ef8129b0ab559c788ce988` | Clean; PR #148 open; CI passed | PR #149 contains the same fix and targets `main`; if #149 merges, close #148 as redundant without merging it separately. |
| `kindred-foundation-cleanup` | `codex/remove-dead-clerk-release-docs` | Clean; PR #149 open; checks passed on the previous head | Combined Snyk workflow and repository/docs cleanup review. Rerun checks after this documentation update; do not deploy or migrate provider resources from this PR. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions` at `0e072f53d4c14f583bd502bde822945dca24b613` | Modified `pnpm-workspace.yaml`; untracked `auth0-deploy/` | Preserved user-owned worktree; untouched. Review and disposition separately; do not delete or merge as part of hosting finalization. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered `auth0-deploy-integration` | Directory exists, but `git -C` fails because its worktree metadata is invalid | Preserved; no pruning or repair performed. |

OpenCode's worktrees are complete and its Snyk changes are included in PR #149.
Its original commits `1492e01` and `347399b` remain preserved at
`archive/delegated/opencode-snyk-iac-scan-347399b`. Devin is authenticated on
the Free tier with no active session in this checkout; no Devin files changed.
The merged EKS cleanup branch was removed after its content was verified in
canonical `main`; its delegated review refs remain under `archive/delegated/`.

The separate canonical clone was moved intact after confirming it had no
ignored or untracked files. The invalid Copilot worktree registration remains
untouched. Current active checkouts are canonical `main` (with preserved
untracked `.vscode/`), the clean PR #148 and #149 worktrees, the preserved Auth0
worktree with user changes, and the invalid Copilot worktree registration.
