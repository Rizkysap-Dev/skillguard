# SkillGuard

Deterministic, zero-LLM test runner for Agent Skills and MCP (Model Context Protocol) Tools. Write declarative mock tool-call assertions, run them locally or in CI, and catch tool misuses in sub-seconds.

[![Tests](https://img.shields.io/badge/tests-72%2F72%20passing-22c55e?style=flat-square)](#development)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3b82f6?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-zinc?style=flat-square)](package.json)

```bash
# Run all passing fixtures
node src/cli.js test fixtures/pass

# Run a specific failure fixture
node src/cli.js test fixtures/fail/wrong-arguments.skillguard.json

# Output machine-readable JSON
node src/cli.js test fixtures/pass --json
```

---

## Architecture Overview

SkillGuard evaluates agent tool sequences against declarative fixture contracts without LLM token spend, network requests, or dynamic code execution.

<p align="center">
  <img src="docs/assets/skillguard-banner.svg" alt="SkillGuard Architecture Pipeline" width="100%">
</p>

### Key Properties

- **Zero LLM Overhead:** No API keys, no network sockets, zero tokens billed.
- **Byte-Identical Determinism:** Strict object key sorting and omitted timestamps ensure byte-identical diffs across repeat runs.
- **Security Boundaries:** Rejects prototype pollution (`__proto__`), recursions deeper than 12 levels, files $>256$ KiB, and integers exceeding safe bounds before executing any mock call.
- **Automatic Secret Scrubbing:** High-entropy tokens (`sk-...`, `ghp_...`, AWS keys, JWTs) and sensitive keys (`password`, `token`, `secret`, `api_key`) are redacted in terminal reports and failure diffs.

---

## Exit Codes

SkillGuard implements strict Unix exit codes for seamless CI/CD integration:

| Exit Code | Status | Description |
|:---:|:---|:---|
| `0` | **PASS** | All fixtures and test cases passed their assertions. |
| `1` | **FAIL** | Fixture was syntactically valid, but tool assertions failed. |
| `2` | **INVALID / USAGE** | Fixture failed schema validation or CLI flags were invalid. |

---

## Fixture Specification

Fixtures are declarative JSON files (`*.skillguard.json`) defining mock tool behaviors, simulated call sequences, and expected assertions.

```json
{
  "version": 1,
  "name": "weather-skill-test",
  "tools": {
    "weather.get": { "result": { "city": "Bandung", "tempC": 24 } },
    "db.audit": { "result": { "logged": true } }
  },
  "cases": [
    {
      "name": "calls weather with the expected city and units",
      "calls": [
        { "tool": "weather.get", "arguments": { "city": "Bandung" } }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          { "tool": "weather.get", "arguments": { "city": "Bandung" } }
        ]
      }
    }
  ]
}
```

### Matcher Rules

- **`mode: "exact"` (default):** Requires a 1-to-1 match on call count, tool names, and arguments in order.
- **`mode: "contains"`:** Allows intermediate or unasserted calls, ensuring the expected sequence appears in order.
- **`match: "subset"`:** Asserts only specified argument keys, ignoring dynamic fields like timestamps or request IDs.
- **Wildcard Arguments:** Omitting `arguments` in an expected call matches any parameter payload.
- **Throws Simulation:** Declare `"throws": { "message": "error text", "code": 500 }` on a mock tool to test error handling.

---

## CLI Output Example

### Pass Report
```
SkillGuard 0.1.0
PASS fixtures/pass/basic.skillguard.json
  PASS calls weather with the expected city and units

PASS fixtures/pass/edge.skillguard.json
  PASS subset args with extra recorded calls
  PASS unicode arguments
  PASS no calls expected

PASS fixtures/pass/redaction.skillguard.json
  PASS sensitive arguments match
Summary: 3 fixture(s), 5 case(s), 5 passed, 0 failed
Result: PASS
```

### Failure Report with Secret Redaction
```
SkillGuard 0.1.0
FAIL fixtures/fail/wrong-arguments.skillguard.json
  FAIL wrong city argument
    call 1 arguments.city: expected "Jakarta", got "Bandung"
  FAIL missing second call
    call 2: missing expected call "search.web"
Summary: 1 fixture(s), 2 case(s), 0 passed, 2 failed
Result: FAIL
```

---

## Limits (v0.1)

To prevent resource exhaustion when running untrusted fixtures, SkillGuard enforces:
- File size $\le 256$ KiB
- Object/array nesting depth $\le 12$
- String length $\le 8,192$ characters
- Array length $\le 500$ elements
- Object keys $\le 200$ keys
- Maximum declared tools $\le 64$
- Maximum cases $\le 200$
- Maximum calls per side $\le 100$
- Total AST nodes $\le 50,000$

---

## Documentation

- [Architecture & Runtime Specification](docs/spec-architecture.md)
- [Fixture Authoring Guide & Recipes](docs/fixture-guide.md)

---

## Development

Requires Node.js 20+. Zero external dependencies.

```bash
# Run unit & security test suite
npm test

# Run CI verification pipeline
npm run test:ci
```
