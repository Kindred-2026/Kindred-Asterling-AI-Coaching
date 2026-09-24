# Kindred checkout and worktree audit

**Audit date:** 2026-09-24. Canonical source is GitHub `main` at
`17262dd72cd1c816e2d8f096e2b5378185473d55` after PRs #161–#163 merged.
PR #148 was closed as redundant after its Snyk changes were verified in #149.
The live GitHub branch API currently lists `main` and the open PR #164 branch;
15 stale local `origin/*` tracking refs were pruned after verifying they no
longer exist on the remote.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | `codex/remove-gitlab-operator-doc`, `1e3ad757bc703b6db190f578fdc2012079749c7c`, based on canonical `main` at `17262dd72cd1c816e2d8f096e2b5378185473d55` | PR #164 is open; untracked `.vscode/` preserved | The former unique `40c8841` commit remains preserved at `archive/kindred-local-main-40c8841`. Its gitlink, reversed AI privacy statement, workspace placeholder, and inventory edits were reviewed and not ported. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean snapshot | Preserved outside the stale parent checkout after verifying it matched its recorded canonical baseline. |
| `kindred-snyk-iac-followup` | `codex/snyk-iac-no-files` at `690853726651652c22ef8129b0ab559c788ce988` | Removed after merge of the equivalent Snyk workflow change in #149 | PR #148 was closed without merge; its remote branch was deleted. |
| `kindred-foundation-cleanup` | `codex/remove-dead-clerk-release-docs` at `6670cfbf096cf6461690262b4d733bf096da942f` | Removed after PR #149 merged | Changes are now on `main` at `c44d263`; its remote and local topic branches were deleted. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions` at `0e072f53d4c14f583bd502bde822945dca24b613` | Modified `pnpm-workspace.yaml`; untracked `auth0-deploy/` | Preserved user-owned worktree; untouched. Review and disposition separately; do not delete or merge as part of hosting finalization. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered `auth0-deploy-integration` | Directory exists, but `git -C` fails because its worktree metadata is invalid | Preserved; no pruning or repair performed. |

OpenCode's worktrees are complete and its Snyk changes are included in PR #149.
Its original commits `1492e01` and `347399b` remain preserved at
`archive/delegated/opencode-snyk-iac-scan-347399b`. Devin is authenticated on
the Free tier with no active session in this checkout; no Devin files changed.
The merged EKS cleanup branch was removed after its content was verified in
canonical `main`; its delegated review refs remain under `archive/delegated/`.

The separate canonical snapshot clone was moved intact after confirming it
had no ignored or untracked files. The invalid Copilot worktree registration
remains untouched. Current checkout locations are the PR #164 worktree (with
preserved untracked `.vscode/`), the clean historical snapshot clone, the
preserved Auth0 worktree with user changes, and the invalid Copilot worktree
registration.
