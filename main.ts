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

// Signature of the functions built dynamically from user code blocks.
type RunnerFn = (app: App, print: (...args: unknown[]) => void) => unknown;

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

    // Capture console output
    const logs: Array<{ type: string; args: unknown[] }> = [];
    const consoleMethods = ["log", "warn", "error", "info"] as const;
    type ConsoleMethod = (typeof consoleMethods)[number];
    const originalConsole: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

    const intercept =
      (type: ConsoleMethod) =>
      (...args: unknown[]) => {
        logs.push({ type, args });
        originalConsole[type]?.(...args);
      };

    for (const method of consoleMethods) {
      originalConsole[method] = console[method].bind(console);
      console[method] = intercept(method);
    }

    let result: unknown = undefined;
    let errorOccurred = false;

    try {
      // Provide a simple `print` helper and `app` reference
      const print = (...args: unknown[]) => {
        logs.push({ type: "log", args });
      };

      if (this.settings.allowAsync) {
        // Wrap in async IIFE to support top-level await.
        // The Function constructor is intentional here: it is how this plugin
        // executes user-authored code blocks, which is its entire purpose.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const asyncFn = new Function(
          "app",
          "print",
          `return (async () => { ${source} })()`
        ) as RunnerFn;
        const promise = asyncFn(this.app, print);

        // Apply timeout
        const timeout = new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error(`Execution timed out after ${this.settings.maxExecutionTime}ms`)),
            this.settings.maxExecutionTime
          )
        );

        result = await Promise.race([promise, timeout]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const syncFn = new Function("app", "print", source) as RunnerFn;
        result = syncFn(this.app, print);
      }
    } catch (err) {
      errorOccurred = true;
      logs.push({ type: "error", args: [err instanceof Error ? err.message : String(err)] });
    } finally {
      // Restore console
      for (const method of consoleMethods) {
        const original = originalConsole[method];
        if (original) {
          console[method] = original;
        }
      }
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
        return Object.prototype.toString.call(value);
      }
    }
    if (typeof value === "function") {
      return "[Function]";
    }
    // Narrowed to string | number | boolean | bigint | symbol.
    return String(value);
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<JSRunnerSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// This settings tab uses the imperative Setting API. Migrating to the
// declarative getSettingDefinitions() API (Obsidian 1.13+) is a larger,
// optional follow-up and is intentionally out of scope here.
// eslint-disable-next-line obsidianmd/settings-tab/prefer-setting-definitions
class JSRunnerSettingTab extends PluginSettingTab {
  plugin: JSRunnerPlugin;

  constructor(app: App, plugin: JSRunnerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("JS Runner Settings").setHeading();

    new Setting(containerEl)
      .setName("Show execution time")
      .setDesc("Display how long each code block took to run.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showExecutionTime)
          .onChange(async (value) => {
            this.plugin.settings.showExecutionTime = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Allow async / await")
      .setDesc("Wrap code blocks in an async context to support top-level await.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.allowAsync)
          .onChange(async (value) => {
            this.plugin.settings.allowAsync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max execution time (ms)")
      .setDesc("Abort async code blocks that run longer than this many milliseconds.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxExecutionTime))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxExecutionTime = num;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}