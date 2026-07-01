# JS Runner PRO — Obsidian Plugin

Run JavaScript directly inside your `.md` notes. Supports `console.log`, `async/await`, return values, and full access to the Obsidian `app` API.

---

## Installation

### Manual (recommended for development)

1. Build the plugin (see below), or download a release.
2. Copy the three files — `main.js`, `manifest.json`, `styles.css` — into:
   ```
   <your-vault>/.obsidian/plugins/js-runner/
   ```
3. In Obsidian → **Settings → Community Plugins**, enable **JS Runner**.

### Build from source

```bash
npm install
npm run build
```

This produces `main.js` in the project root. Copy it along with `manifest.json` and `styles.css` to your vault's plugin folder.

---

## Usage

Use a fenced code block with the language tag `js-run` (or `javascript-run`):

````markdown
```js-run
const x = 6 * 7;
console.log("The answer is", x);
```
````

A **▶ Run** button appears below the code. Click it to execute.

### Examples

**Basic output**
````markdown
```js-run
console.log("Hello from JS Runner!");
console.warn("This is a warning");
console.error("This is an error");
```
````

**Return value**
````markdown
```js-run
const arr = [1, 2, 3, 4, 5];
arr.reduce((a, b) => a + b, 0);
```
````

**Async / await**
````markdown
```js-run
const res = await fetch("https://api.github.com/zen");
const text = await res.text();
console.log(text);
```
````

**Access Obsidian API**
````markdown
```js-run
const files = app.vault.getMarkdownFiles();
console.log(`Vault contains ${files.length} markdown files`);
files.slice(0, 5).forEach(f => console.log(f.path));
```
````

**Helper: `print()`**

A `print()` function is available as a shorthand for `console.log()`:
````markdown
```js-run
for (let i = 1; i <= 5; i++) {
  print(`Line ${i}`);
}
```
````

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Show execution time | On | Shows elapsed ms in the status badge |
| Allow async/await | On | Wraps code in async IIFE for `await` support |
| Max execution time | 5000 ms | Timeout for async code blocks |

---

## Security Note

This plugin executes arbitrary JavaScript inside Obsidian's Electron context with full Node.js access. **Only run code you trust.** Do not open vaults from untrusted sources with this plugin enabled.
