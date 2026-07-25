import { App, PluginSettingTab, Setting } from "obsidian";
import type SpeakPenPlugin from "./main";

export class SpeakPenSettingTab extends PluginSettingTab {
  plugin: SpeakPenPlugin;

  constructor(app: App, plugin: SpeakPenPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 说明里点明 token 存在哪、什么动作会带走它、以及可以随时吊销。
    // 语气保持平实：token 是只读的，说清事实即可，不必渲染成风险提示。
    const tokenDesc = new DocumentFragment();
    tokenDesc.append(
      "Generate a token in the SpeakPen web app at speakpen.app/app, under Settings → API Tokens, then paste it here."
    );
    tokenDesc.append(tokenDesc.createEl("br"));
    tokenDesc.append(
      "Like any Obsidian plugin setting, it is saved as plain text in this vault, so it travels with the vault if you sync or commit it. The token is read-only, and you can revoke it in SpeakPen at any time."
    );

    new Setting(containerEl)
      .setName("API token")
      .setDesc(tokenDesc)
      .addText((text) =>
        text
          .setPlaceholder("Paste your API token")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("Sync folder")
      .setDesc("Vault folder where synced notes will be created.")
      .addText((text) =>
        text
          .setPlaceholder("Enter folder name")
          .setValue(this.plugin.settings.syncFolder)
          .onChange(async (value) => {
            this.plugin.settings.syncFolder = value || "SpeakPen";
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("Auto sync")
      .setDesc("Automatically sync new ideas on an interval.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncEnabled = value;
            await this.plugin.savePluginData();
            this.plugin.resetAutoSync();
          })
      );

    new Setting(containerEl)
      .setName("Sync interval (minutes)")
      .setDesc("How often to check for new ideas (minimum 1 minute).")
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.autoSyncIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSyncIntervalMinutes = value;
            await this.plugin.savePluginData();
            this.plugin.resetAutoSync();
          })
      );
  }
}
