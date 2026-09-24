# Kindred checkout and worktree audit

**Audit date:** 2026-09-24. Canonical source is GitHub `main` at
`49e0be1199d1ce91e951d2b0d468fb352fb13381`. The finalization branch was
merged as PR #147. PR #148 is the active review branch for the Snyk IaC workflow
follow-up; its full CI passed at `50d801a081c0fd4d30c2d9fdc731ac44e439debf`.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | local `main`, `49e0be1199d1ce91e951d2b0d468fb352fb13381` | Aligned to canonical GitHub `origin/main`; clean | The former unique `40c8841` commit remains preserved at `archive/kindred-local-main-40c8841`. Its gitlink, reversed AI privacy statement, workspace placeholder, and inventory edits were reviewed and not ported. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean snapshot | Preserved outside the stale parent checkout after verifying it matched its recorded canonical baseline. |
| `kindred-snyk-iac-followup` | `codex/snyk-iac-no-files` at `50d801a081c0fd4d30c2d9fdc731ac44e439debf` | Clean; PR #148 open; CI passed | Keep for review and merge disposition. The Snyk IaC change skips only when no supported IaC inputs exist; real IaC scan failures remain fatal. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions` at `0e072f53d4c14f583bd502bde822945dca24b613` | Modified `pnpm-workspace.yaml`; untracked `auth0-deploy/` | Preserved user-owned worktree; untouched. Review and disposition separately; do not delete or merge as part of hosting finalization. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered `auth0-deploy-integration` | Directory exists, but `git -C` fails because its worktree metadata is invalid | Preserved; no pruning or repair performed. |

OpenCode's Snyk workflow worktree and the empty Devin audit worktree were
removed after review. OpenCode commits `1492e01` and `347399b` are preserved at
`archive/delegated/opencode-snyk-iac-scan-347399b` and their changes are copied
to PR #148. Devin authenticated on the Free tier, but the selected model
required Pro; no Devin files changed. The merged EKS cleanup branch was
removed after its content was verified in canonical `main`; its delegated
review refs remain under `archive/delegated/`.

The separate canonical clone was moved intact after confirming it had no
ignored or untracked files. The invalid Copilot worktree registration remains
untouched. Current active checkouts are canonical `main`, the clean PR #148
worktree, the preserved Auth0 worktree with user changes, and the invalid
Copilot worktree registration.
