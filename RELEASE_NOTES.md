# Release Notes

All notable changes to **JS Runner** are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## 0.0.1

Initial public release.

### Added
- `js-run` and `javascript-run` fenced code block processors — write JavaScript directly in any `.md` note and click **▶ Run** to execute it.
- Captured output for `console.log`, `console.warn`, `console.error`, and `console.info`, each rendered with distinct colour coding.
- `print()` shorthand available inside every block as an alias for `console.log`.
- Return-value display — the final evaluated value of a block is shown with a `↩` prefix.
- Top-level `async/await` support — blocks run inside an async IIFE so `await` works without any wrapper.
- Configurable execution timeout (default 5 000 ms) to prevent runaway async code from freezing Obsidian.
- Full Obsidian API access via the `app` global inside every block.
- Execution-time badge displayed in the controls bar after each run.
- **✕ Clear** button to reset the output area without re-running the block.
- Settings tab with three options: show/hide execution time, enable/disable async mode, and set the max execution timeout.
- Desktop-only flag set in `manifest.json` (Node.js context required).
