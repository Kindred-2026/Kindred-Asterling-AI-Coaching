# Kindred checkout and worktree audit

**Audit date:** 2026-09-23. Canonical source is GitHub `main` at
`7c264f6e5fecdee0739075bd66d432bb9fa6ba85`. The original checkout and
user-owned worktrees were inspected read-only and left intact.

| Local checkout | Branch / HEAD | State | Disposition |
| --- | --- | --- | --- |
| `Kindred-Asterling-AI-Coaching` | local `main`, `40c8841b58ef96b930ae9dd478bfc664f17d9ca2` | Clean; 237 commits behind canonical `main`, one unique commit ahead | Preserve untouched. Its unique commit adds a nested repository gitlink plus workspace/config/inventory edits; review and port intentional changes before any reset or deletion. |
| `Kindred-Finalization` | `codex/kindred-finalization`, based on canonical `main` | Finalization implementation branch | Keep as the review branch until PR and CI disposition are complete. |
| `Kindred-OpenCode-Secrets` | `codex/opencode-secret-inventory` | Inventory change committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-Snyk-Fix` | `codex/snyk-nosql-findings` | Query-ID fix committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after Snyk confirms on the PR. |
| `Kindred-Devin-Audit` | `codex/devin-finalization-audit` | Next.js cleanup committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-OpenCode-Workflow` | `codex/opencode-workflow` | Workflow hardening committed and integrated | Retain branch commit as delegation evidence; remove the temporary worktree after final review if clean. |
| `Kindred-OpenCode-Postgres` | `codex/opencode-postgres-target` | Active delegated implementation | Preserve until implementation and review are complete. |
| `Kindred-Devin-Postgres` | `codex/devin-postgres-target` | Empty worktree; Devin exhausted its daily usage quota | Preserve until this task closes, then remove the empty worktree. |
| `kindred-auth0-migration` | `codex/auth0-rules-to-actions`, `0e072f5` | Two modified files | Preserve; this checkout was not changed or inspected for content. |
| `copilot-worktrees/.../griffixchips15-bookish-sniffle` | registered worktree reference | Git could not open it as a valid checkout | Preserve the registration until its owner confirms the path can be retired. |

The nested gitlink in the original checkout is part of its unmerged unique commit,
not a submodule in canonical `main`. Do not initialize, reset, remove, or rewrite
that checkout as part of this finalization branch. Clean up only temporary
worktrees created for this task after their branches are integrated and their
working trees are clean.
