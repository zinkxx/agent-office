# Contributing to Agent Office

Thanks for your interest! Bug reports, ideas, translations and code are all welcome. Türkçe yazabilirsiniz.

## Ground rules

Agent Office exists to show Claude Code sessions **without leaking anything**. Every change must keep these rules:

- `~/.claude` is **read-only**. Nothing is ever written, moved or deleted there. `~/.claude/sessions/*.key` files are
  never read.
- The server listens on `127.0.0.1` only, and **no data leaves the machine**. No analytics, no CDNs, no downloads at
  runtime (fonts, textures and sounds are generated in code or served from `web/public/`).
- Message contents, code, command text, full paths, account IDs and e-mail addresses are never shown. At most the
  action type and a bare file name, e.g. `Edit · pressable.dart`. The privacy filter lives in `server/src/parser.ts`.
- Never commit real session logs. Tests use the made-up data in `fixtures/`. Use invented names (Atlas, Nova, Pusula;
  paths like `/Users/kullanici`) in code, fixtures and screenshots.

## Setup

Requires Node.js 22+.

```bash
git clone https://github.com/zinkxx/agent-office.git && cd agent-office
npm install
npm run demo   # a lively office with made-up data, reads no files
npm start      # your real sessions (read-only)
```

The UI runs at http://127.0.0.1:5174 and the server at 127.0.0.1:5175.

## Before you open a pull request

```bash
npm run check    # type-check + all tests (CI runs this)
npm run format   # Prettier
```

- Add or update tests for behaviour changes. Tests are Vitest, `*.test.ts`, in the `node` environment.
- Keep pull requests small and focused; link the issue they solve (`Fixes #12`).
- New dependencies need a one-line reason in the PR description.

## Where things live

| Path                   | What                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `shared/types.ts`      | The single contract between server and UI. Change both sides together.             |
| `server/src/`          | Reads `~/.claude`, filters it (`parser.ts`), keeps state (`store.ts`), streams it. |
| `web/src/office/sim/`  | Pure, tested logic: pathfinding, floor plan, behaviour. Change behaviour here.     |
| `web/src/office/`      | React + three.js components. They only draw what `sim/` decides.                   |
| `docs/veri-bicimi.md`  | The log format (Turkish).                                                          |
| `PLAN.md`, `CLAUDE.md` | Roadmap, progress log and working rules (Turkish).                                 |

Imports use the `.ts` extension, types are imported with `import type`, and TypeScript runs in strict mode.

## Good first steps

Look for issues labelled [`good first issue`](https://github.com/zinkxx/agent-office/labels/good%20first%20issue) or
check the [roadmap board](https://github.com/users/zinkxx/projects/7). Questions and ideas are welcome in
[Discussions](https://github.com/zinkxx/agent-office/discussions).

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
