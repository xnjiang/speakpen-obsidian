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

    new Setting(containerEl).setName("SpeakPen Sync settings").setHeading();

    new Setting(containerEl)
      .setName("API token")
      .setDesc("Your SpeakPen API token. You can find it in the SpeakPen app settings.")
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
      .setDesc("The vault folder where SpeakPen notes will be created.")
      .addText((text) =>
        text
          .setPlaceholder("SpeakPen")
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
