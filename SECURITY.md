# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Architecture

SkillGuard is designed from the ground up for safe offline evaluation of AI skills and MCP tools:
- **Zero dynamic code evaluation:** No `eval()`, `new Function()`, or unsafe deserialization.
- **Prototype Pollution Prevention:** Object prototype mutations (`__proto__`, `constructor.prototype`) are intercepted and rejected prior to mock execution.
- **Secret Scrubbing:** High-entropy API tokens, authorization headers, and private keys are redacted from assertion diffs and terminal output.

## Reporting a Vulnerability

If you discover a security vulnerability within SkillGuard, please do not disclose it publicly in an issue. Instead, report it directly by opening a private security advisory on GitHub or emailing `rizkysapp01@gmail.com`.
