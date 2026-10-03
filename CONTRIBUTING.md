# Contributing

## Development setup

Requirements:

- Node.js 20 LTS recommended (Node.js >=18 is supported by `package.json`).
- A Chromium-based browser for manual extension testing.

The project has no runtime npm dependencies.

## Before opening a pull request

Run:

```bash
npm run verify
git diff --check
```

The verification command must finish with all tests passing and the bundle smoke test reporting `OK`.

## Change scope

Prefer small, focused pull requests. Changes to the text engine, DOM observation, font handling, or browser integration should include regression tests whenever practical.

Do not edit generated files under `dist/`. They are produced by the build pipeline and intentionally ignored by Git.
