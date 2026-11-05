# Scope: SkillGuard

Version 1 — 2026-11-05 — Status: Draft — delivered without approval gate (approval waived by requester)

Problem: Agent skills and MCP tools fail in real use when the model misuses or skips a tool, and the
agent-skill benchmark field is crowded by general evals (SkillsBench, SWE-Skills-Bench,
skill-eval-action). Practitioners need a fast, deterministic local signal before shipping.
Source: /Users/rizkysap/OpenBot/Shared/project-operating-plan.md, section 1.

In:
- Dev can run `skillguard test <path>` on a local skill or MCP tool and get a deterministic PASS/FAIL
  exit code in under 3 seconds, with no LLM in the loop.
- Dev can write a mock tool-call assertion (expected tool + arguments) that runs without LLM token
  spend and fails on mismatch.

Out:
- LLM-as-judge / LLM-based grading (why: breaks determinism; v0.1 is no-LLM).
- Leaderboard / benchmark scoring / star ranking (why: different product; dev tool not scoreboard).
- Auto-fix / prompt optimization (why: requires generation; deterministic scope excludes it).
- Production runtime enforcement in live agents (why: v0.1 validates the mock layer).

Done when:
1. `skillguard test` exits 0 on the fixture suite and 1 on the intentional-failure fixture, identical
   output on repeat runs — measured by: CLI exit codes plus repeat-run diff on fixtures.
2. Runner makes zero network calls and no LLM API calls; no key required — measured by: static path
   check and keyless run.
3. Malformed fixture input is rejected before handler execution; no real handler runs in tests; failure
   output redacts secrets — measured by: security fixtures.

First deliverable: Deterministic mock runner + schema validator + minimal fixture set (pass / fail /
edge) — date: 2026-11-05 — proves: deterministic exit-code contract holds without LLM.

Risks:
- Mock/real divergence — trigger: live agent fails where mock passes — response: parity fixtures.
- Scope creep to LLM judge — trigger: "add LLM judging" — response: no-LLM gate in CI.

Decisions needed:
- CLI language/runtime (TS/Bun vs Python/uv) — options: TS/Bun / Python — decides: Backend Dev — blocks: engine.
- Fixture schema format (YAML/JSON) — decides: Sap Architect — blocks: fixtures.

Owners: Engine → Backend Dev. — Fixtures/spec → Scope Writer, Research Analyst. — Security → Engineering Reviewer.

Assumptions: No LLM key needed for v0.1. — Bun/Node present on dev machine.

Security boundaries:
- No real tool handler or agent code executes during tests; mock dispatcher only.
- No network egress by default; no telemetry; no LLM calls.
- Redaction of secrets / user content in reports and logs.
- Strict fixture schema validation with depth / size limits.

Decision Quality Check:
- Done-measures: binary, runnable, deterministic → pass. — First deliverable: proves the riskiest
  assumption (deterministic no-LLM runner) with smallest scope → pass.
