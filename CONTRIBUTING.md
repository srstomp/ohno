# Contributing to Ohno

Thanks for your interest in contributing to Ohno! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 10.0.0
- **Git**

## Getting Started

1. Fork and clone the repo:

```bash
git clone https://github.com/<your-username>/ohno.git
cd ohno
```

2. Install dependencies:

```bash
cd packages
npm install
```

3. Build all packages:

```bash
make build
```

4. Run tests:

```bash
make test
```

## Project Structure

Ohno is a TypeScript monorepo managed with [Turborepo](https://turbo.build/repo):

```
packages/
  ohno-core/   # Shared database layer (sql.js/WebAssembly SQLite)
  ohno-mcp/    # MCP server (Model Context Protocol tools)
  ohno-cli/    # CLI tool and visual kanban board
```

- **ohno-core** is the shared foundation. Changes here affect both the MCP server and CLI.
- **ohno-mcp** exposes task management as MCP tools for AI agents (e.g., Claude Code).
- **ohno-cli** provides shell commands and the `ohno serve` kanban board.

## Development Workflow

Start development mode (watches for changes and rebuilds):

```bash
make dev
```

Build and test:

```bash
make build
make test
```

Clean build artifacts:

```bash
make clean
```

## Making Changes

1. Create a branch from `master`:

```bash
git checkout -b my-feature
```

2. Make your changes. Keep commits focused and well-described.

3. Ensure tests pass:

```bash
make test
```

4. Push your branch and open a pull request against `master`.

## Code Conventions

- **TypeScript** throughout. All packages use strict TypeScript.
- **Vitest** for testing.
- **No native dependencies.** Ohno uses sql.js (WebAssembly) instead of native SQLite bindings to ensure zero-install compatibility via `npx`.
- Keep the CLI and MCP outputs consistent - both read from the same SQLite database and should behave identically.

## What to Contribute

- Bug fixes
- New CLI commands or MCP tools
- Improvements to the kanban board UI
- Documentation improvements
- Test coverage

## Reporting Issues

Open an issue on GitHub with:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
