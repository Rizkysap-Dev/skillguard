# Changelog

All notable changes to SkillGuard will be documented in this file.

## [0.1.0] - 2026-11-05

### Added

- **Core CLI** (`skillguard` bin, `test` command): deterministic local runner for agent skills and MCP tool fixtures, with strict exit codes — `0` (PASS), `1` (FAIL), `2` (INVALID/USAGE).
- **Zero-token mock runner**: complete suite executes in under 1 second, costs `$0.00` tokens, requires no API keys, and is fully airgapped (zero network egress).
- **Schema validator**: strict pre-execution fixture validation — version integrity, unknown keys, unsafe integers, JSON depth/size limits, tool-definition conflicts, and unknown tool references.
- **Secret redaction**: automatic multi-layer scrubbing of high-entropy tokens, sensitive keys (`password`, `token`, `secret`, `apikey`), and copula-text assignments in failure diffs.
- **Matching strategies**: exact (default), contains, subset arguments, wildcard arguments, and tool-throws simulation.
- **Machine-readable CI output**: `--json` flag for dashboards and bots.
- **GitHub Actions CI**: `.github/workflows/ci.yml` running the unit/security suite plus pass/fail/invalid exit-code contracts.

### Security

- Resource limits enforced before execution: file ≤ 256 KiB, JSON depth ≤ 12, string ≤ 8,192 chars, array ≤ 500 items, object ≤ 200 keys, tools ≤ 64, cases ≤ 200, calls ≤ 100 per case, JSON nodes ≤ 50,000.
- Prototype defense: `__proto__`, `prototype`, and `constructor` keys rejected.
- Terminal armor: ANSI escapes and directional control characters sanitized.

### Tests

- 72 unit and security tests passing (`npm test`), covering the core runner, schema, redaction, CLI, runner, and security suites.

### Release

- Initial local package baseline: `skillguard@0.1.0` with MIT license. npm publishing remains disabled in `package.json` until distribution is explicitly approved.

[0.1.0]: https://github.com/Rizkysap-Dev/skillguard/releases/tag/v0.1.0
