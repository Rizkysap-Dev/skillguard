# Reddit (r/LocalLLaMA) Launch Draft — SkillGuard v0.1.0

Status: **DRAFT** (not posted — pending final QA/packaging sign-off)

## Draft title

We built a deterministic, zero-LLM test runner for MCP tool-calling agents (local, airgapped, $0 tokens)

## Draft body

Self-hosted, fully local alternative to LLM-as-a-judge benchmarking for agent skills / MCP tools.

The problem: when agents call the right tool with the wrong arguments, skip prerequisites, or leak credentials in telemetry, LLM judges are slow ($$$/run), flaky, and non-deterministic.

What we built:

- Declarative `.skillguard.json` fixtures with mock tools and expected calls
- Deterministic runner: <1.0s for a full suite, byte-identical repeat runs, 100% stable
- Zero tokens, zero API keys, zero network egress
- Automatic secret redaction in failure diffs
- Exit codes: 0 pass / 1 fail / 2 invalid — drop straight into CI

```bash
npm test
node src/cli.js test fixtures/pass
```

Still early (v0.1.0). Would love feedback from the local-LLM / MCP community on fixture ergonomics and redaction coverage.

Repo: https://github.com/Rizkysap-Dev/skillguard

## Post-checklist

- [ ] Final QA sign-off (72/72 tests green)
- [ ] npm publish decision
- [ ] Finalize draft wording / add benchmark numbers
- [ ] Post to r/LocalLLaMA
