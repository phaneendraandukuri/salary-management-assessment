# ACME Salary Management — Codex Instructions

Read `REQUIREMENTS.md` before doing any work. Follow the assessment's requirement for incremental development and meaningful testing.

## Roles and approval gates
- The candidate owns requirements, design decisions, code review, and Git commits.
- You are an implementation assistant. Work only on the **single task the candidate explicitly authorizes**.
- **Stop after each task.** Do not automatically start the next feature, refactor other areas, or add extras.
- Never run `git add`, `git commit`, `git push`, force-push, release, or deployment commands without explicit approval. Propose a commit message instead.
- Do not silently resolve ambiguous product requirements; identify them for discussion.

## TDD is required
For business behavior, use genuine **Red → Green → Refactor**:
1. Describe the next small observable behavior and expected result.
2. Write a focused test **before** production implementation.
3. Run it and confirm it fails for the **expected behavior-related reason** (not a broken import/configuration).
4. Implement the minimum code that makes it pass.
5. Refactor when justified; rerun tests, type checking and relevant linting.
6. Report what ran, the actual results, and anything unverified.

Do not write production code and then retroactively add tests while calling it TDD. Small tooling or project configuration tasks may not have a meaningful test-first cycle; state this explicitly.

## Architecture and code quality
- Preferred stack: TypeScript, Node.js, Express, React, PostgreSQL and Vitest/Supertest unless the candidate approves a change.
- Choose straightforward implementations over abstractions or frameworks that are not required.
- Explain any non-obvious TypeScript constructs or library patterns in plain language.
- Preserve currency boundaries: salary statistics must not combine unlike currencies.
- Seed **synthetic** data only; never check real employee records or secrets into Git.
- Avoid speculative features and dependencies, and keep server queries appropriate for 10,000 employees.

## Review checkpoint — mandatory after every task
Present:
- Behavior completed and why it matters
- Changed files and meaningful design choices
- Red test failure, Green test success, refactoring and final validation results
- Implementation details or TypeScript concepts the candidate should understand
- Trade-offs, limitations, and any outstanding questions
- Suggested human-written commit message

**Then STOP.** Wait for the candidate to review the diff, discuss any doubts, and manually commit before the next task.

## Deliverables
A working deployed frontend and backend, 10,000-employee seed script, tests, demo video, one-page requirements, design/trade-off notes, performance considerations and honest AI-use notes. Don't claim anything is deployed or tested unless verified.
