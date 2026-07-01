import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownPostProcessorContext,
} from "obsidian";

interface JSRunnerSettings {
  showExecutionTime: boolean;
  allowAsync: boolean;
  maxExecutionTime: number;
}

const DEFAULT_SETTINGS: JSRunnerSettings = {
  showExecutionTime: true,
  allowAsync: true,
  maxExecutionTime: 5000,
};

// A minimal console-like object handed to user code blocks. Kept separate
// from the real global console so we never need to monkey-patch it.
type ConsoleLike = Record<
  "log" | "warn" | "error" | "info",
  (...args: unknown[]) => void
>;

// Signature of the functions built dynamically from user code blocks.
type RunnerFn = (
  app: App,
  print: (...args: unknown[]) => void,
  console: ConsoleLike
) => unknown;

export default class JSRunnerPlugin extends Plugin {
  settings: JSRunnerSettings;

  async onload() {
    await this.loadSettings();

    // Register the ```js-run code block processor
    this.registerMarkdownCodeBlockProcessor(
      "js-run",
      (source, el, ctx) => {
        this.processJSBlock(source, el, ctx);
      }
    );

    // Also support ```javascript-run
    this.registerMarkdownCodeBlockProcessor(
      "javascript-run",
      (source, el, ctx) => {
        this.processJSBlock(source, el, ctx);
      }
    );

    // Add a command to run all JS blocks in the current file
    this.addCommand({
      id: "run-all-js-blocks",
      name: "Run all JS blocks in current file",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        new Notice("Re-open or refresh the note to re-run all JS blocks.");
      },
    });

    // Add settings tab
    this.addSettingTab(new JSRunnerSettingTab(this.app, this));
  }

  onunload() {
    // Nothing to clean up currently; kept for future teardown logic.
  }

  private processJSBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    // Wrapper container
    const wrapper = el.createDiv({ cls: "js-runner-wrapper" });

    // Code display section
    const codeSection = wrapper.createDiv({ cls: "js-runner-code-section" });
    const pre = codeSection.createEl("pre", { cls: "js-runner-pre" });
    const code = pre.createEl("code", { cls: "js-runner-code language-javascript" });
    code.setText(source);

    // Controls bar
    const controls = wrapper.createDiv({ cls: "js-runner-controls" });
    const runBtn = controls.createEl("button", {
      cls: "js-runner-run-btn",
      text: "▶ Run",
    });
    const clearBtn = controls.createEl("button", {
      cls: "js-runner-clear-btn",
      text: "✕ Clear",
    });
    const statusEl = controls.createSpan({ cls: "js-runner-status" });

    // Output section
    const outputSection = wrapper.createDiv({ cls: "js-runner-output-section" });
    outputSection.addClass("js-runner-hidden");
    outputSection.createDiv({ cls: "js-runner-output-label", text: "Output" });
    const outputEl = outputSection.createDiv({ cls: "js-runner-output" });

    clearBtn.addEventListener("click", () => {
      outputEl.empty();
      outputSection.addClass("js-runner-hidden");
      statusEl.setText("");
      statusEl.className = "js-runner-status";
    });

    runBtn.addEventListener("click", () => {
      void this.executeCode(source, outputEl, outputSection, statusEl, runBtn);
    });
  }

  private async executeCode(
    source: string,
    outputEl: HTMLElement,
    outputSection: HTMLElement,
    statusEl: HTMLElement,
    runBtn: HTMLElement
  ) {
    outputEl.empty();
    outputSection.removeClass("js-runner-hidden");
    statusEl.setText("Running…");
    statusEl.className = "js-runner-status running";
    (runBtn as HTMLButtonElement).disabled = true;

    const startTime = performance.now();

    // Capture console output. Rather than monkey-patching the global
    // console object, we hand user code a local `console` parameter of
    // the same name - JS scoping means their calls resolve to this
    // sandboxed version instead of the real one, so nothing needs to be
    // restored afterwards.
    const logs: Array<{ type: string; args: unknown[] }> = [];
    const makeLogger =
      (type: "log" | "warn" | "error" | "info") =>
      (...args: unknown[]) => {
        logs.push({ type, args });
      };
    const sandboxConsole: ConsoleLike = {
      log: makeLogger("log"),
      warn: makeLogger("warn"),
      error: makeLogger("error"),
      info: makeLogger("info"),
    };

    let result: unknown = undefined;
    let errorOccurred = false;

    try {
      // Provide a simple `print` helper and `app` reference
      const print = (...args: unknown[]) => {
        logs.push({ type: "log", args });
      };

      if (this.settings.allowAsync) {
        // Wrap in async IIFE to support top-level await.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Function constructor is intentional here: it is how this plugin executes user-authored code blocks, which is its entire purpose. (no-new-func is disabled for this file via obsidianmd/rule-custom-message in eslint config.)
        const asyncFnRaw: unknown = new Function(
          "app",
          "print",
          "console",
          `return (async () => { ${source} })()`
        );
        const asyncFn = asyncFnRaw as RunnerFn;
        const promise = asyncFn(this.app, print, sandboxConsole);

        // Apply timeout
        const timeout = new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error(`Execution timed out after ${this.settings.maxExecutionTime}ms`)),
            this.settings.maxExecutionTime
          )
        );

        result = await Promise.race([promise, timeout]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Function constructor is intentional here: it is how this plugin executes user-authored code blocks, which is its entire purpose. (no-new-func is disabled for this file via obsidianmd/rule-custom-message in eslint config.)
        const syncFnRaw: unknown = new Function("app", "print", "console", source);
        const syncFn = syncFnRaw as RunnerFn;
        result = syncFn(this.app, print, sandboxConsole);
      }
    } catch (err) {
      errorOccurred = true;
      logs.push({ type: "error", args: [err instanceof Error ? err.message : String(err)] });
    }

    const elapsed = (performance.now() - startTime).toFixed(1);

    // Render captured logs
    if (logs.length === 0 && result === undefined && !errorOccurred) {
      const emptyEl = outputEl.createDiv({ cls: "js-runner-empty" });
      emptyEl.setText("(no output)");
    }

    for (const entry of logs) {
      const line = outputEl.createDiv({ cls: `js-runner-line js-runner-${entry.type}` });
      const prefix = outputEl.createSpan({ cls: "js-runner-prefix" });
      if (entry.type === "warn") prefix.setText("⚠ ");
      if (entry.type === "error") prefix.setText("✖ ");
      if (entry.type === "info") prefix.setText("ℹ ");
      line.appendChild(prefix);

      const text = entry.args.map((a) => this.formatValue(a)).join(" ");

      const textNode = line.createSpan({ cls: "js-runner-text" });
      textNode.setText(text);
    }

    // Show return value if meaningful
    if (result !== undefined) {
      const retLine = outputEl.createDiv({ cls: "js-runner-line js-runner-return" });
      const retPrefix = retLine.createSpan({ cls: "js-runner-prefix" });
      retPrefix.setText("↩ ");
      const retText = retLine.createSpan({ cls: "js-runner-text" });
      retText.setText(this.formatValue(result));
    }

    // Update status
    if (errorOccurred) {
      statusEl.setText("Error");
      statusEl.className = "js-runner-status error";
    } else {
      statusEl.setText(
        this.settings.showExecutionTime ? `Done · ${elapsed}ms` : "Done"
      );
      statusEl.className = "js-runner-status done";
    }

    (runBtn as HTMLButtonElement).disabled = false;
  }

  /**
   * Safely render an arbitrary value captured from user code as a string,
   * without relying on the default Object.prototype.toString() behavior.
   */
  private formatValue(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "undefined") return "undefined";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(Object.prototype.toString.call(value));
      }
    }
    if (typeof value === "function") {
      return "[Function]";
    }
    // Narrowed to string | number | boolean | bigint | symbol.
    return String(value as string | number | boolean | bigint | symbol);
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<JSRunnerSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// Settings definitions are declared once and used both to build the
// imperative display() UI (required for Obsidian < 1.13, and generally
// for the settings to render at all) and, potentially, any future
// declarative registration (Obsidian 1.13+) so these settings could also
// show up in the global settings search.
class JSRunnerSettingTab extends PluginSettingTab {
  plugin: JSRunnerPlugin;

  constructor(app: App, plugin: JSRunnerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const def of this.getSettingDefinitions()) {
      const setting = new Setting(containerEl).setName(def.name).setDesc(def.desc);

      if (def.control.type === "toggle") {
        const key = def.control.key;
        setting.addToggle((toggle) =>
          toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          })
        );
      } else if (def.control.type === "number") {
        const key = def.control.key;
        setting.addText((text) => {
          text.inputEl.type = "number";
          text
            .setValue(String(this.plugin.settings[key]))
            .onChange(async (value) => {
              const parsed = Number(value);
              const error = def.control.validate?.(parsed);
              if (error) {
                new Notice(error);
                return;
              }
              this.plugin.settings[key] = parsed;
              await this.plugin.saveSettings();
            });
        });
      }
    }
  }

  getSettingDefinitions() {
    return [
      {
        name: "Show execution time",
        desc: "Display how long each code block took to run.",
        control: { type: "toggle" as const, key: "showExecutionTime" as const },
      },
      {
        name: "Allow async / await",
        desc: "Wrap code blocks in an async context to support top-level await.",
        control: { type: "toggle" as const, key: "allowAsync" as const },
      },
      {
        name: "Max execution time (ms)",
        desc: "Abort async code blocks that run longer than this many milliseconds.",
        control: {
          type: "number" as const,
          key: "maxExecutionTime" as const,
          min: 1,
          step: 1,
          validate: (value: number) =>
            !Number.isFinite(value) || value <= 0
              ? "Enter a positive number of milliseconds."
              : undefined,
        },
      },
    ];
  }
}