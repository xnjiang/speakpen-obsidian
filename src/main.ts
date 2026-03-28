import { Plugin, Notice, normalizePath } from "obsidian";
import {
  SpeakPenSettings,
  DEFAULT_SETTINGS,
  SyncState,
  DEFAULT_SYNC_STATE,
  PluginData,
} from "./types";
import { SpeakPenAPI } from "./api";
import { getNewIdeas, syncIdeasToVault } from "./sync";
import { SpeakPenSettingTab } from "./settings";

export default class SpeakPenPlugin extends Plugin {
  settings: SpeakPenSettings = DEFAULT_SETTINGS;
  syncState: SyncState = DEFAULT_SYNC_STATE;
  private autoSyncIntervalId: number | null = null;
  private statusBarEl: HTMLElement | null = null;
  private isSyncing = false;

  async onload() {
    await this.loadPluginData();

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    this.updateStatusBar();

    // Ribbon icon
    this.addRibbonIcon("refresh-cw", "SpeakPen: Sync now", async () => {
      await this.runSync();
    });

    // Command
    this.addCommand({
      id: "speakpen-sync-now",
      name: "Sync now",
      callback: async () => {
        await this.runSync();
      },
    });

    // Settings tab
    this.addSettingTab(new SpeakPenSettingTab(this.app, this));

    // Auto sync
    this.resetAutoSync();
  }

  onunload() {
    this.clearAutoSync();
  }

  async loadPluginData() {
    const data: Partial<PluginData> | null = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    this.syncState = Object.assign({}, DEFAULT_SYNC_STATE, data?.syncState ?? {});
  }

  async savePluginData() {
    const data: PluginData = {
      settings: this.settings,
      syncState: this.syncState,
    };
    await this.saveData(data);
  }

  resetAutoSync() {
    this.clearAutoSync();
    if (this.settings.autoSyncEnabled && this.settings.apiToken) {
      const ms = this.settings.autoSyncIntervalMinutes * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(() => {
        this.runSync(true);
      }, ms);
      this.registerInterval(this.autoSyncIntervalId);
    }
  }

  private clearAutoSync() {
    if (this.autoSyncIntervalId !== null) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
  }

  private updateStatusBar() {
    if (!this.statusBarEl) return;
    if (this.syncState.lastSyncTime) {
      const t = new Date(this.syncState.lastSyncTime);
      const timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      this.statusBarEl.setText(`SpeakPen: last sync ${timeStr}`);
    } else {
      this.statusBarEl.setText("SpeakPen: not synced");
    }
  }

  async runSync(silent = false) {
    if (this.isSyncing) return;
    if (!this.settings.apiToken) {
      if (!silent) new Notice("SpeakPen: Please set your API token in settings.");
      return;
    }

    this.isSyncing = true;
    if (this.statusBarEl) this.statusBarEl.setText("SpeakPen: syncing...");

    try {
      const api = new SpeakPenAPI(this.settings.apiToken);
      const allIdeas = await api.fetchAllIdeas();

      const syncedSet = new Set(this.syncState.syncedIds);
      const newIdeas = getNewIdeas(allIdeas, syncedSet);

      if (newIdeas.length === 0) {
        if (!silent) new Notice("SpeakPen: No new ideas to sync.");
      } else {
        const count = await syncIdeasToVault(
          newIdeas,
          this.settings.syncFolder,
          this.app.vault,
        );

        // Track synced IDs
        for (const idea of newIdeas) {
          this.syncState.syncedIds.push(idea.id);
        }

        new Notice(`SpeakPen: Synced ${count} new idea${count > 1 ? "s" : ""}.`);
      }

      this.syncState.lastSyncTime = new Date().toISOString();
      await this.savePluginData();
    } catch (error: any) {
      const msg = error?.message ?? "Unknown error";
      new Notice(`SpeakPen: Sync failed — ${msg}`);
      console.error("SpeakPen sync error:", error);
    } finally {
      this.isSyncing = false;
      this.updateStatusBar();
    }
  }
}
