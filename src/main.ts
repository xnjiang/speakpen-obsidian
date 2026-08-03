import { Plugin, Notice } from "obsidian";
import {
  SpeakPenSettings,
  DEFAULT_SETTINGS,
  SyncState,
  DEFAULT_SYNC_STATE,
  PluginData,
  SyncReport,
} from "./types";
import { SpeakPenAPI } from "./api";
import { syncIdeasToVault, migrateSyncFolder } from "./sync";
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
    this.addRibbonIcon("refresh-cw", "Sync now", async () => {
      await this.runSync();
    });

    // Command
    this.addCommand({
      id: "sync-now",
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
    // loadData() 返回 any,直接赋给带类型的变量会触发
    // @typescript-eslint/no-unsafe-assignment(Obsidian 的自动审核会报)。
    // 显式断言把这个不安全点收在一处,而不是散进整个方法。
    const data = (await this.loadData()) as Partial<PluginData> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    this.syncState = migrateSyncState(data?.syncState);
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
        void this.runSync(true);
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
      this.statusBarEl.setText(`Synced ${timeStr}`);
    } else {
      this.statusBarEl.setText("Not synced");
    }
  }

  async runSync(silent = false) {
    if (this.isSyncing) return;
    if (!this.settings.apiToken) {
      if (!silent) new Notice("Please set your API token in settings.");
      return;
    }

    this.isSyncing = true;
    if (this.statusBarEl) this.statusBarEl.setText("Syncing...");

    try {
      const folder = this.settings.syncFolder;

      // Folder changes first: the incremental fetch only returns notes that changed, so
      // relocating on the way past would leave every older note in the previous folder.
      const migration = await migrateSyncFolder(
        this.syncState.notes,
        this.syncState.syncFolder,
        folder,
        this.app.vault,
      );
      Object.assign(this.syncState.notes, migration.moved);
      this.syncState.syncFolder = folder;
      for (const failure of migration.failures) {
        console.error(`SpeakPen: could not move "${failure.title}" — ${failure.message}`);
      }

      const api = new SpeakPenAPI(this.settings.apiToken);
      const changed = await api.fetchIdeasSince(this.syncState.cursor);

      const report = await syncIdeasToVault(changed, folder, this.app.vault, this.syncState);

      Object.assign(this.syncState.notes, report.notes);
      this.syncState.cursor = report.cursor;
      this.syncState.lastSyncTime = new Date().toISOString();
      await this.savePluginData();

      this.announce(report, migration.moved, silent);
    } catch (error: unknown) {
      const msg = (error as { message?: string })?.message ?? "Unknown error";
      new Notice(`Sync failed — ${msg}`);
      console.error("SpeakPen sync error:", error);
    } finally {
      this.isSyncing = false;
      this.updateStatusBar();
    }
  }

  /**
   * Tell the user what happened, but only when there is something to say.
   *
   * An automatic sync runs every few minutes and now usually has no work at all, so a
   * routine "nothing new" popup would be noise. Anything that changed the vault, or that
   * needs the user to act, is worth interrupting for either way.
   */
  private announce(report: SyncReport, moved: Record<string, unknown>, silent: boolean) {
    const movedCount = Object.keys(moved).length;
    const parts: string[] = [];

    if (report.created.length > 0) parts.push(`${report.created.length} new`);
    if (report.updated.length > 0) parts.push(`${report.updated.length} updated`);
    if (movedCount > 0) parts.push(`${movedCount} moved`);

    for (const skip of report.localEdits) {
      console.warn(`SpeakPen: left "${skip.title}" alone — it has been edited at ${skip.path}`);
    }
    for (const failure of report.failures) {
      console.error(`SpeakPen: could not write "${failure.title}" — ${failure.message}`);
    }

    if (report.failures.length > 0) {
      const summary = parts.length > 0 ? `${parts.join(", ")}. ` : "";
      new Notice(
        `${summary}${report.failures.length} note${report.failures.length > 1 ? "s" : ""} failed — see the console.`,
      );
      return;
    }

    if (report.localEdits.length > 0) {
      const summary = parts.length > 0 ? `${parts.join(", ")}. ` : "";
      new Notice(
        `${summary}${report.localEdits.length} note${report.localEdits.length > 1 ? "s" : ""} changed in SpeakPen but edited here, so left as-is.`,
      );
      return;
    }

    if (parts.length > 0) {
      new Notice(`Synced: ${parts.join(", ")}.`);
    } else if (!silent) {
      new Notice("Already up to date.");
    }
  }
}

/**
 * Bring sync state forward from the pre-0.3.0 shape.
 *
 * That version recorded a flat list of synced ids and nothing else — no path, no content,
 * no cursor. Those ids move to `legacyIds`, which still prevents duplicates but cannot
 * support updates or moves, since we know neither where those notes went nor whether the
 * user has since rewritten them. Everything synced from now on is tracked properly.
 *
 * The cursor deliberately stays null so the first run after upgrading walks the whole
 * history once: that is what populates `notes` for anything still current, and it is a
 * single expensive sync in exchange for cheap ones from then on.
 */
export function migrateSyncState(stored: unknown): SyncState {
  const state = Object.assign({}, DEFAULT_SYNC_STATE, (stored as Partial<SyncState>) ?? {});
  state.notes = state.notes ?? {};
  state.legacyIds = state.legacyIds ?? [];

  const legacy = (stored as { syncedIds?: unknown })?.syncedIds;
  if (Array.isArray(legacy) && legacy.length > 0) {
    const known = new Set(state.legacyIds);
    for (const id of legacy) {
      if (typeof id === "string" && !known.has(id) && !state.notes[id]) {
        state.legacyIds.push(id);
        known.add(id);
      }
    }
  }

  return state;
}
