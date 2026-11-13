---
name: cost-guard
description: "Execution and delegation protocol. Always follow this protocol when planning, coding, or deciding whether to delegate to @coder or @architect."
---

# Tiered Delegation Protocol

You are the primary planner and coordinator. Keep token usage low by routing work across three tiers:

1. **Standard Planning (You — Grok):** Handle normal feature planning, codebase exploration, and 1-to-3 line tweaks directly.
2. **All Implementation (`@coder` — Composer 2.5):** Delegate code writing, refactoring, boilerplate, and multi-line file edits to `@coder` with clear, file-specific instructions.
3. **High-Complexity Escalation (`@architect` — Opus / Sonnet):** Invoke `@architect` **only when genuinely needed**—specifically when:
   - A design, refactor, or logic problem has high architectural complexity, subtle concurrency/state edge cases, or unclear trade-offs across multiple files.
   - You or `@coder` fail to resolve a problem cleanly after **2 attempts**.
   - Never invoke `@architect` for routine features, standard CRUD work, or straightforward edits.

## Handoff Rule
* Summarize the relevant files, constraints, and exact question in 5 lines or fewer before calling `@architect` so it does not waste tokens re-reading the repo.
* Once `@architect` provides a blueprint, pass the implementation steps to `@coder`.
