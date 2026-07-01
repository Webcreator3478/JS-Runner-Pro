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

    console.log("JS Runner plugin loaded.");
  }

  onunload() {
    console.log("JS Runner plugin unloaded.");
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
    outputSection.style.display = "none";
    const outputLabel = outputSection.createDiv({ cls: "js-runner-output-label", text: "Output" });
    const outputEl = outputSection.createDiv({ cls: "js-runner-output" });

    clearBtn.addEventListener("click", () => {
      outputEl.empty();
      outputSection.style.display = "none";
      statusEl.setText("");
      statusEl.className = "js-runner-status";
    });

    runBtn.addEventListener("click", () => {
      this.executeCode(source, outputEl, outputSection, statusEl, runBtn);
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
    outputSection.style.display = "block";
    statusEl.setText("Running…");
    statusEl.className = "js-runner-status running";
    (runBtn as HTMLButtonElement).disabled = true;

    const startTime = performance.now();

    // Capture console output
    const logs: Array<{ type: string; args: unknown[] }> = [];
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    const intercept =
      (type: string) =>
      (...args: unknown[]) => {
        logs.push({ type, args });
        (originalConsole as Record<string, (...a: unknown[]) => void>)[type](...args);
      };

    console.log = intercept("log");
    console.warn = intercept("warn");
    console.error = intercept("error");
    console.info = intercept("info");

    let result: unknown = undefined;
    let errorOccurred = false;

    try {
      // Provide a simple `print` helper and `app` reference
      const print = (...args: unknown[]) => {
        logs.push({ type: "log", args });
      };

      if (this.settings.allowAsync) {
        // Wrap in async IIFE to support top-level await
        const asyncFn = new Function(
          "app",
          "print",
          `return (async () => { ${source} })()`
        );
        const promise = asyncFn(this.app, print);

        // Apply timeout
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Execution timed out after ${this.settings.maxExecutionTime}ms`)),
            this.settings.maxExecutionTime
          )
        );

        result = await Promise.race([promise, timeout]);
      } else {
        const syncFn = new Function("app", "print", source);
        result = syncFn(this.app, print);
      }
    } catch (err) {
      errorOccurred = true;
      logs.push({ type: "error", args: [err instanceof Error ? err.message : String(err)] });
    } finally {
      // Restore console
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
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

      const text = entry.args
        .map((a) => {
          if (typeof a === "object") {
            try { return JSON.stringify(a, null, 2); }
            catch { return String(a); }
          }
          return String(a);
        })
        .join(" ");

      const textNode = line.createSpan({ cls: "js-runner-text" });
      textNode.setText(text);
    }

    // Show return value if meaningful
    if (result !== undefined) {
      const retLine = outputEl.createDiv({ cls: "js-runner-line js-runner-return" });
      const retPrefix = retLine.createSpan({ cls: "js-runner-prefix" });
      retPrefix.setText("↩ ");
      const retText = retLine.createSpan({ cls: "js-runner-text" });
      retText.setText(
        typeof result === "object"
          ? JSON.stringify(result, null, 2)
          : String(result)
      );
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class JSRunnerSettingTab extends PluginSettingTab {
  plugin: JSRunnerPlugin;

  constructor(app: App, plugin: JSRunnerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "JS Runner Settings" });

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