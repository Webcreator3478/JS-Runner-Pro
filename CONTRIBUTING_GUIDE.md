# Contributing Guide

Thank you for considering a contribution to **JS Runner**! This document explains how to set up a development environment, the conventions used in the codebase, and the steps required to get a pull request merged.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting up the development environment](#setting-up-the-development-environment)
3. [Project structure](#project-structure)
4. [Development workflow](#development-workflow)
5. [Coding conventions](#coding-conventions)
6. [Submitting a pull request](#submitting-a-pull-request)
7. [Releasing a new version](#releasing-a-new-version)
8. [Code of Conduct](#code-of-conduct)

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 18 | LTS recommended |
| npm | 9 | ships with Node 18 |
| Obsidian | 1.0.0 | desktop build |
| Git | any recent | — |

---

## Setting up the development environment

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-fork>/obsidian-js-runner.git
cd obsidian-js-runner

# 2. Install dependencies
npm install

# 3. Start the watcher — rebuilds main.js on every save
npm run dev
```

Then symlink (or copy) the plugin folder into a **test vault** so Obsidian picks up changes:

```bash
# macOS / Linux — symlink
ln -s "$(pwd)" "/path/to/test-vault/.obsidian/plugins/js-runner"

# Windows (run as Administrator)
mklink /D "C:\path\to\test-vault\.obsidian\plugins\js-runner" "%CD%"
```

Enable the plugin in **Obsidian → Settings → Community Plugins** and reload after each rebuild (Ctrl/Cmd + R inside Obsidian, or use the **Hot Reload** community plugin).

---

## Project structure

```
obsidian-js-runner/
├── main.ts              # All plugin logic (single-file source)
├── styles.css           # Scoped CSS for the code-block UI
├── manifest.json        # Obsidian plugin metadata
├── esbuild.config.mjs   # Bundle config (dev watcher + production build)
├── tsconfig.json        # TypeScript compiler options
├── package.json
├── package-lock.json
├── RELEASE_NOTES.md
├── CONTRIBUTING_GUIDE.md
└── .github/
    └── workflows/
        └── release.yml  # CI/CD: build → attest → publish GitHub Release
```

`main.ts` compiles to `main.js` via esbuild. The three files that ship in a release are `main.js`, `manifest.json`, and `styles.css`.

---

## Development workflow

### Making a change

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes in `main.ts` and/or `styles.css`.
3. Keep `npm run dev` running in a terminal — esbuild will rebuild automatically.
4. Test manually in Obsidian. Reload the plugin after each rebuild.
5. Commit with a short, imperative message (see conventions below).

### Running a production build locally

```bash
npm run build
```

This runs `tsc --noEmit` for type-checking first, then esbuild for the final bundle.

---

## Coding conventions

### TypeScript

- All new code goes in `main.ts`. If the file grows beyond ~600 lines, split into logically named modules and import them; discuss this in your PR first.
- Use strict TypeScript — no `any` unless absolutely necessary and clearly commented.
- Prefer `const` over `let`; avoid `var`.
- Name boolean variables and parameters with an `is`/`has`/`should` prefix.
- All public methods on the plugin class must have JSDoc comments.

### CSS

- All selectors must be scoped under `.js-runner-*` to avoid collisions with Obsidian or other plugins.
- Use CSS variables from Obsidian's design system (`--background-primary`, `--text-normal`, `--interactive-accent`, etc.) so the plugin respects every theme automatically. Avoid hard-coded colour values.
- Keep `styles.css` sorted by component section (wrapper → code section → controls → output), with a comment header for each section.

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add syntax highlighting to output blocks
fix: restore console methods after timeout error
docs: expand async/await example in README
chore: bump esbuild to 0.18
```

Squash fixup commits before opening a PR.

---

## Submitting a pull request

1. Push your branch and open a PR against `main`.
2. Fill in the PR template: describe **what** changed and **why**, and link any related issues.
3. Ensure `npm run build` passes with zero TypeScript errors.
4. Describe how you tested the change (vault setup, Obsidian version, OS).
5. A maintainer will review and either approve, request changes, or close with explanation.

PRs that introduce behaviour-changing features should update `README.md` and add an entry to `RELEASE_NOTES.md` under an `## Unreleased` heading.

---

## Releasing a new version

> Only maintainers with push access perform releases.

1. Update `manifest.json` → bump `"version"`.
2. Add a dated section to `RELEASE_NOTES.md` (e.g. `## 1.1.0`).
3. Commit: `chore: release 1.1.0`.
4. Tag and push:
   ```bash
   git tag 1.1.0
   git push origin main --tags
   ```
5. The `release.yml` GitHub Actions workflow will automatically build, attest `main.js` provenance, and publish a GitHub Release with `main.js`, `manifest.json`, and `styles.css` attached.

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Please be respectful and constructive in all interactions. Reports of unacceptable behaviour can be sent to the repository maintainers via a private GitHub issue.