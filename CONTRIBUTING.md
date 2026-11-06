# Contributing to SkillGuard

Thank you for your interest in contributing to **SkillGuard**! SkillGuard is designed as a lightweight, zero-dependency, deterministic test runner for AI agent skills and MCP tools.

## Core Design Principles

1. **Zero LLM Overhead:** No runtime calls to LLM APIs. Tests must run offline and deterministically.
2. **Sub-second Execution:** Test execution must remain fast ($<1$ second) across suites.
3. **Strict Determinism:** Output diffs must be byte-identical across repeat runs.
4. **Security by Default:** All inputs are sanitized against prototype pollution, path traversal, and sensitive tokens are scrubbed.

## Development Workflow

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/Rizkysap-Dev/skillguard.git
   cd skillguard
   ```
2. Run test suite:
   ```bash
   npm test
   ```
3. Test against sample fixtures:
   ```bash
   npm run test:ci
   ```

## Pull Request Guidelines

- Ensure all 72+ unit tests pass (`npm test`).
- Add fixture files under `fixtures/` for any new feature or edge-case validation.
- Use conventional commits format (`feat:`, `fix:`, `docs:`, `chore:`).
