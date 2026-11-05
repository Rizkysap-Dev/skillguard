# SkillGuard

Deterministic, no-LLM test runner for agent skills and MCP tools. Write mock
tool-call assertions, run them locally or in CI, and fail the build when an
agent calls a tool with the wrong arguments.

```bash
node src/cli.js test fixtures/pass
node src/cli.js test fixtures/fail/wrong-arguments.skillguard.json
node src/cli.js test fixtures/pass --json
```

Exit codes: `0` pass, `1` test failure, `2` invalid fixture or usage.

## Why

- No LLM calls, no API keys, no network: the runner only replays declarative
  mock behavior.
- Deterministic output: stable key ordering and no timestamps, so repeat runs
  can be diffed byte-for-byte.
- Strict fixture validation (size, depth, key, and schema limits) rejects
  malformed input before any case runs.
- Secret-looking values and sensitive keys are redacted in reports.

## Fixture format

Fixture files are JSON. A fixture declares mock tools, a deterministic call
sequence, and the calls the agent should have made.

```json
{
  "version": 1,
  "name": "weather-skill",
  "tools": {
    "weather.get": { "result": { "city": "Bandung", "tempC": 24 } },
    "db.write": { "throws": { "message": "write blocked" } }
  },
  "cases": [
    {
      "name": "asks for the expected city",
      "calls": [
        { "tool": "weather.get", "arguments": { "city": "Bandung" } }
      ],
      "expect": {
        "calls": [
          { "tool": "weather.get", "arguments": { "city": "Bandung" } }
        ]
      }
    }
  ]
}
```

- `calls` is the scripted agent behavior. Each call is dispatched to the
  fixture-declared mock; no real tool handler or agent code runs.
- `expect.calls` is the assertion. Default mode is `exact`: same count, same
  order. Use `"mode": "contains"` to allow extra recorded calls.
- `match: "subset"` on an expected call asserts only the listed argument keys.
- Omitting `arguments` on an expected call matches any arguments.
- Expected calls must reference tools declared in `tools`; calls to undeclared
  tools are rejected at validation time.

Matching rules for `subset`: nested objects are subset-matched, arrays must
have the same length and order.

## Limits (v0.1)

Fixture file ≤ 256 KiB, JSON depth ≤ 12, string ≤ 8192 chars, array ≤ 500 items,
object ≤ 200 keys, ≤ 64 tools, ≤ 200 cases, ≤ 100 calls per side, ≤ 50,000
JSON values. Keys `__proto__`, `prototype`, and `constructor` are rejected.
Each case must have a name and a `calls` array; fixtures must declare at least
one case.

## Development

```bash
npm test
```

Requires Node.js 20+. No dependencies are installed or fetched.
