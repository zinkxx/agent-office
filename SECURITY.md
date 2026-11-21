# Security and privacy policy

Agent Office reads Claude Code session logs, so privacy problems are treated as security problems.

## What counts as a vulnerability

- Any data leaving the machine (network requests, telemetry, remote fonts or assets).
- The server being reachable from anything other than `127.0.0.1`, or accepting WebSocket connections from other
  origins.
- Message contents, code, command text, full paths, account IDs, e-mail addresses or `*.key` files reaching the UI or
  the WebSocket stream.
- Anything that writes to, moves or deletes files under `~/.claude`.

## Reporting

Please **do not open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/zinkxx/agent-office/security/advisories/new).

Include the version or commit, your OS, and steps to reproduce, ideally with `npm run demo` or the made-up data in
`fixtures/`. Do not attach real session logs.

You can expect a first reply within a week. Fixes are released as a new version and credited in the release notes
unless you prefer otherwise.

## Supported versions

Only the latest release on the `main` branch receives fixes.
