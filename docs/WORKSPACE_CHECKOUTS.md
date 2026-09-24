# Kindred checkout and worktree audit

**Audit date:** 2026-09-24. Canonical source is GitHub `main` at
`7c264f6e5fecdee0739075bd66d432bb9fa6ba85`. The former stale outer checkout
was aligned after its only unique commit was archived; the separate clean
canonical clone was moved intact to a sibling archive. Other user-owned
worktrees with unrelated or uncommitted state were preserved. Clean delegated
worktrees whose changes were integrated were removed after review.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | local `main`, `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Aligned to canonical GitHub `origin/main`; clean | Its former unique `40c8841` commit was reviewed, not ported, and preserved at local ref `archive/kindred-local-main-40c8841`. It included a broken self-gitlink, a reversed AI privacy statement, a placeholder pnpm workspace value, and inventory edits superseded by this finalization. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean, no ignored or untracked files | Moved intact out of the stale parent checkout after verifying it exactly matched canonical `main`; preserved as a local snapshot. |
| `Kindred-Finalization` | `codex/kindred-finalization`, based on canonical `main` | Finalization implementation branch | Keep as the review branch until PR and CI disposition are complete. |
| Delegated temporary worktrees (12) | OpenCode, Devin, and Snyk task branches | Removed on 2026-09-24 after clean-status checks and confirming each task change was an ancestor, patch-equivalent, or exact file-content match in `codex/kindred-finalization` | Local branch refs remain for review evidence. The Fly runbook commit `8b67f0a` is integrated as `335508b`; no provider actions were performed. Devin delivered no changes because its Free-tier daily quota was exhausted. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions` at `0e072f53` | Preserved user-owned checkout; modified `pnpm-workspace.yaml` and untracked `auth0-deploy/` remain | Untouched. Review and disposition these local Auth0 changes separately; do not delete or merge them as part of Fly finalization. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | Registered branch `auth0-deploy-integration` | Directory exists, but `git -C` fails because its worktree metadata is invalid | Preserve the directory and registration until its owner identifies or authorizes repair/removal; no pruning was performed. |

The nested gitlink in the original checkout was part of its unmerged unique
commit, not a configured submodule in canonical `main`. The clone it pointed to
was clean and exactly matched canonical `main`; it was moved to the archive path
above before aligning the original checkout. The unique parent commit remains
reachable through its archive branch. The remaining checkouts are the canonical
main checkout, this finalization checkout, the preserved Auth0 migration
checkout with local changes, and the invalid Copilot worktree registration.
Delegation branch refs remain available even though their clean temporary
directories were removed.
