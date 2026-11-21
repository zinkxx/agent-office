# Changelog

All notable changes to Agent Office are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Changed

- three.js 0.170 → 0.187, with a single copy in the bundle (the update alone pulled in two) and matching type
  definitions; shadows use `PCFShadowMap` (`PCFSoftShadowMap` was removed in three 0.187).
- GitHub Actions: `checkout` and `setup-node` v7, `upload-pages-artifact` and `deploy-pages` v5.
- Dependabot proposes only minor and patch updates; major versions are upgraded by hand after testing the office.

## [1.0.1] · 2026-11-21

### Fixed

- Plain brand: the brand wall showed the office name twice; the logo now shows only the icon above a single name
  ([#1](https://github.com/zinkxx/agent-office/issues/1)).

### Added

- Community files: [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) with private vulnerability reporting,
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), issue forms and a pull request template with a privacy checklist.
- Dependabot for npm packages and GitHub Actions (monthly, grouped).
- Live README badges for tests, latest release and open issues;
  [Discussions](https://github.com/zinkxx/agent-office/discussions) and a public
  [roadmap board](https://github.com/users/zinkxx/projects/7).

## [1.0.0] · 2026-11-20

First public release: Claude Code sessions and sub-agents as characters in a live 3D office, a city around the tower,
three themes, layout editor, mascots, low-power mode, and a [live demo](https://zinkxx.github.io/agent-office/) on
GitHub Pages. Runs only on `127.0.0.1`; nothing leaves the machine.

[1.0.1]: https://github.com/zinkxx/agent-office/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zinkxx/agent-office/releases/tag/v1.0.0
