# Reddit r/LocalLLaMA Post Draft: SkillGuard

**Target Subreddit:** `r/LocalLLaMA`<br>
**Flair:** `Project | [P]`<br>
**Post Title:** [P] SkillGuard: We built a zero-token, airgapped test runner for Agent Skills & MCP tools (< 1s local run, automated secret redaction)<br>
**Repository URL:** `https://github.com/Rizkysap-Dev/skillguard`<br>
**License:** MIT<br>

---

### Post Body Draft

Hi everyone,

When experimenting with local models (Llama 3, Qwen 2.5 Coder, Mistral, etc.) for function calling and Model Context Protocol (MCP) workflows, one of the biggest headaches is **tool calling regression**. A model update or system prompt tweak often results in subtle argument type mismatches, missing required parameters, or leaked auth tokens in test logs.

Running full local LLM inference in your CI pipeline or loop just to check if tool definitions and assertions hold up is slow, hogs your GPU, and introduces non-deterministic temperature noise.

To solve this for our own agent development, we built **SkillGuard** (https://github.com/Rizkysap-Dev/skillguard).

### What is it?
SkillGuard is a lightweight, airgapped CLI test runner designed specifically for agent skills and MCP tools. It gives you a fast (< 1s), deterministic PASS/FAIL signal locally before you spin up heavier LLM evaluation suites.

### Key Features:
- **Zero-Token Mock Runner:** Write declarative test cases with mock tool inputs/outputs. Assert tool names, expected parameters, subset arguments, and call sequences without spending GPU cycles or tokens.
- **100% Deterministic & Airgapped:** Operates with zero network calls and zero model API requirements. Repeat runs produce byte-identical output.
- **Automated Secret Redaction:** Catches sensitive credentials (API tokens, AWS keys, JWTs, passwords in free text like `"password used was [REDACTED]"`) in failure diffs and reports so you never leak secrets in CI or shared logs.
- **Security & Schema Hardened:** Built-in defenses against prototype pollution, maximum nesting depth checks, and terminal control character sanitization to prevent terminal injection.
- **CI Ready:** Standard exit codes (`0` pass, `1` assertion failure, `2` malformed schema or invalid usage) making it drop-in ready for GitHub Actions or pre-commit hooks.

### Quick Terminal Usage:
```bash
# Run all skill fixtures in a directory
npx skillguard test fixtures/pass

# Output machine-readable JSON for dashboards
npx skillguard test fixtures/ --json
```

### Roadmap & Local LLM Integration:
- Automated fuzzing & adversarial test generation from MCP JSON schemas (type boundary violations, missing keys, prompt injections).
- Direct MCP stdio client adapter to intercept and validate real local server calls.

The repo is completely open source under MIT:<br>
👉 **GitHub:** https://github.com/Rizkysap-Dev/skillguard

Curious to hear your thoughts: How are you currently verifying tool-calling reliability when fine-tuning or prompting local models for agentic tasks?
