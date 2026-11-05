# Show HN: SkillGuard – Deterministic, Zero-Token Test Runner for Agent Skills & MCP Tools

**Target Platform:** Hacker News (`news.ycombinator.com/show`)<br>
**Proposed Title:** Show HN: SkillGuard – Fast, deterministic mock test runner for Agent Skills and MCP tools<br>
**Repository URL:** `https://github.com/Rizkysap-Dev/skillguard`<br>
**License:** MIT<br>

---

### Post Body Draft

Hey HN,

We built **SkillGuard** (https://github.com/Rizkysap-Dev/skillguard), an open-source, deterministic test runner for AI agent skills and Model Context Protocol (MCP) tools. Think of it as Jest / Pytest specifically built for agentic tool-use contracts.

### The Problem

If you're building agent workflows or MCP servers, you've likely seen this failure mode: an agent picks the right tool, but calls it with the wrong argument types, forgets required parameters, or leaks environment secrets in logs.

Today, most teams try to catch these regressions with **LLM-as-a-judge**:
- **Slow & Flaky:** Each test takes 15–60 seconds, and temperature jitter means a test passes in CI at 2 PM and fails at 3 PM.
- **Expensive:** Running an entire eval suite on every commit burns real API tokens.
- **Airgap / Privacy Risks:** Real credentials and internal data often get forwarded to external model APIs during evaluations.

### How SkillGuard Works

SkillGuard replaces slow, non-deterministic eval loops with a **fast (< 1s), zero-token mock assertion engine**:

1. **Declarative Mock Assertions:** You declare expected tool calls, input arguments, and mock responses in standard JSON fixtures (`*.skillguard.json`).
2. **Deterministic Matching:** Supports both `exact` and `contains` execution modes, subset argument matching, and wildcard parameters. Repeat runs produce 100% byte-identical output.
3. **Multi-Layer Secret Redaction:** Automatically detects and redacts AWS keys, GitHub tokens, Slack tokens, OpenAI/Anthropic keys, JWTs, and passwords embedded in free text (e.g. `password used was [REDACTED]`) before anything hits stdout or CI logs.
4. **Strict Schema & Terminal Protection:** Protects against prototype pollution, enforces nesting limits (≤ 16 depth), and sanitizes terminal control characters / bidirectional Unicode to prevent terminal injection.
5. **Drop-in CI Contract:** Native exit codes (`0` Pass, `1` Fail, `2` Invalid Schema/Usage) that seamlessly integrate into GitHub Actions or local pre-commit hooks.

### Quick Example

```json
{
  "version": "0.1",
  "name": "Database Migration Skill",
  "mock": {
    "tools": [
      {
        "name": "execute_query",
        "result": { "rowsAffected": 1 }
      }
    ]
  },
  "cases": [
    {
      "name": "calls execute_query with correct sql and parameters",
      "calls": [
        {
          "tool": "execute_query",
          "arguments": {
            "query": "UPDATE users SET active = true WHERE id = 42"
          }
        }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          {
            "tool": "execute_query",
            "arguments": {
              "query": "UPDATE users SET active = true WHERE id = 42"
            }
          }
        ]
      }
    }
  ]
}
```

Run in terminal:
```bash
npx skillguard test fixtures/
```
Runs in ~40ms with zero network requests and zero LLM calls.

### What's Next

v0.1.0 is pure, airgapped core CLI and runner. Next on our roadmap:
- Auto-generating boundary tests and adversarial fixtures directly from MCP tool schemas.
- Adapter for Model Context Protocol (MCP) server stdio/SSE pipes.
- Bi-directional integration with OpenBot agent skill format.

The project is MIT-licensed and available on GitHub: https://github.com/Rizkysap-Dev/skillguard

We'd love your feedback: How do you currently test tool-calling reliability in your agents, and what assertion styles would make this most useful in your pipeline?
