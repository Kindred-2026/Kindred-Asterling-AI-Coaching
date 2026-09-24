# Kindred checkout and worktree audit

**Audit date:** 2026-09-23. Canonical source is GitHub `main` at
`7c264f6e5fecdee0739075bd66d432bb9fa6ba85`. The former stale outer checkout
was aligned after its only unique commit was archived; the separate clean
canonical clone was moved intact to a sibling archive. Other user-owned
worktrees were preserved.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | local `main`, `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Aligned to canonical GitHub `origin/main`; clean | Its former unique `40c8841` commit was reviewed, not ported, and preserved at local ref `archive/kindred-local-main-40c8841`. It included a broken self-gitlink, a reversed AI privacy statement, a placeholder pnpm workspace value, and inventory edits superseded by this finalization. |
| `Kindred-Canonical-Checkout-Archive-7c264f6` | separate nested clone, `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` | Clean, no ignored or untracked files | Moved intact out of the stale parent checkout after verifying it exactly matched canonical `main`; preserved as a local snapshot. |
| `Kindred-Finalization` | `codex/kindred-finalization`, based on canonical `main` | Finalization implementation branch | Keep as the review branch until PR and CI disposition are complete. |
| `Kindred-OpenCode-Secrets` | `codex/opencode-secret-inventory` | Inventory change committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-Snyk-Fix` | `codex/snyk-nosql-findings` | Query-ID fix committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after Snyk confirms on the PR. |
| `Kindred-Devin-Audit` | `codex/devin-finalization-audit` | Next.js cleanup committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-OpenCode-Workflow` | `codex/opencode-workflow` | Workflow hardening committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-OpenCode-Postgres` | `codex/opencode-postgres-target` | Delegated PostgreSQL rehearsal implementation integrated and reviewed | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-Devin-Postgres` | `codex/devin-postgres-target` | Empty worktree; Devin exhausted its daily usage quota | No changes to integrate; preserve until this task closes, then remove the empty worktree. |
| `Kindred-OpenCode-Foundation-Audit` | detached at finalization baseline | Scratch-file cleanup and SEO brief relocation integrated; workflow audit completed | Temporary audit worktree; retain only until final review, then remove if clean. |
| `Kindred-Devin-Foundation-Audit` | detached at finalization baseline | No changes; Devin could not start because its daily usage quota was exhausted | No changes to integrate. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions`, `0e072f5` | Two modified files | Preserve; this checkout was not changed or inspected for content. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered worktree reference | Git could not open it as a valid checkout | Preserve the registration until its owner confirms the path can be retired. |

The nested gitlink in the original checkout was part of its unmerged unique
commit, not a configured submodule in canonical `main`. The clone it pointed to
was clean and exactly matched canonical `main`; it was moved to the archive path
above before aligning the original checkout. The unique parent commit remains
reachable through its archive branch. Clean up only temporary worktrees created
for this task after their branches are integrated and their working trees are
clean.
