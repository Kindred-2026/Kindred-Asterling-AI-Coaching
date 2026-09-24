# Kindred checkout and worktree audit

**Audit date:** 2026-09-24. Canonical source is GitHub `main` at
`9aa3ee2d46a2565ec391706d6063e7356cda8af7` after PR #165 merged.
PR #148 was closed as redundant after its Snyk changes were verified in #149.
The live GitHub branch API and `git ls-remote --heads origin` list only `main`.
After verifying both merged PR branches were absent remotely, their two stale
local `origin/*` tracking refs were pruned. The three latest `main` push
workflows completed successfully at `9aa3ee2`.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | `main` at `9aa3ee2d46a2565ec391706d6063e7356cda8af7` | Clean tracked tree; untracked `.vscode/` preserved | The former unique `40c8841` commit remains preserved at `archive/kindred-local-main-40c8841`. Its gitlink, reversed AI privacy statement, workspace placeholder, and inventory edits were reviewed and not ported. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean snapshot | Preserved outside the stale parent checkout after verifying it matched its recorded canonical baseline. |
| `kindred-snyk-iac-followup` | `codex/snyk-iac-no-files` at `690853726651652c22ef8129b0ab559c788ce988` | Removed after merge of the equivalent Snyk workflow change in #149 | PR #148 was closed without merge; its remote branch was deleted. |
| `kindred-foundation-cleanup` | `codex/remove-dead-clerk-release-docs` at `6670cfbf096cf6461690262b4d733bf096da942f` | Removed after PR #149 merged | Changes are now on `main` at `c44d263`; its remote and local topic branches were deleted. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions` at `0e072f53d4c14f583bd502bde822945dca24b613` | Modified `pnpm-workspace.yaml`; untracked `auth0-deploy/` | Preserved user-owned worktree; untouched. Review and disposition separately; do not delete or merge as part of hosting finalization. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered `auth0-deploy-integration` | Directory exists, but `git -C` fails because its `.git` pointer targets a missing worktree metadata directory | Preserved; no pruning or repair performed. Its files have not been classified as clean/dirty because Git metadata is unavailable. |

OpenCode's Snyk changes are included in PR #149. Its original commits `1492e01`
and `347399b` remain preserved at `archive/delegated/opencode-snyk-iac-scan-347399b`.
The 2026-09-24 status check found recent OpenCode session history and its local
service available; no session was interrupted or deleted. Devin had no session
in this checkout, was authenticated on the Free tier, and listed allowed models;
the CLI did not expose quota availability. No Devin files changed in that check.
The merged EKS cleanup branch was removed after its content was verified in
canonical `main`; its delegated review refs remain under `archive/delegated/`.

The separate canonical snapshot clone was moved intact after confirming it
had no ignored or untracked files. The invalid Copilot worktree registration
remains untouched. Current checkout locations are the canonical `main`
worktree (with preserved untracked `.vscode/`), the clean historical snapshot
clone, the preserved Auth0 worktree with user changes, and the invalid Copilot
worktree registration.
