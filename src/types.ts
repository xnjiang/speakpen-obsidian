/** Plugin settings persisted to data.json */
export interface SpeakPenSettings {
  apiToken: string;
  syncFolder: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: SpeakPenSettings = {
  apiToken: "",
  syncFolder: "SpeakPen",
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 5,
};

/** What we know about a note we have already written to the vault */
export interface SyncedNote {
  /** Where we put it, so an update finds it and a folder change can move it */
  path: string;
  /**
   * Hash of the exact text we wrote. If the file no longer hashes to this, the
   * user has edited it in Obsidian and we must not overwrite their work.
   */
  hash: string;
  /** The note's updated_at when we last wrote it, so we can skip unchanged notes */
  updatedAt: string;
}

/** Persisted sync state (saved via plugin.saveData alongside settings) */
export interface SyncState {
  /**
   * Notes written by this version, keyed by SpeakPen id.
   */
  notes: Record<string, SyncedNote>;
  /**
   * Ids synced before 0.3.0, when only the id was recorded.
   *
   * Their location and content are unknown, so they cannot be safely updated or
   * moved — but they must still be remembered, or the next sync would write a
   * second copy of every note the user already has. New syncs record into `notes`.
   */
  legacyIds: string[];
  /**
   * Highest updated_at we have synced. Sent as `updated_since` so the server
   * returns only what changed. Null means we have never completed a sync and
   * should ask for everything.
   */
  cursor: string | null;
  /**
   * The sync folder in effect at the last sync. When the setting changes, tracked
   * notes are moved once rather than being left behind in the old folder.
   */
  syncFolder: string | null;
  lastSyncTime: string | null;
}

export const DEFAULT_SYNC_STATE: SyncState = {
  notes: {},
  legacyIds: [],
  cursor: null,
  syncFolder: null,
  lastSyncTime: null,
};

/** Data stored in plugin data.json */
export interface PluginData {
  settings: SpeakPenSettings;
  syncState: SyncState;
}

/** SpeakPen API idea attributes (snake_case from API) */
export interface IdeaAttributes {
  title: string;
  message: string | null;
  transcript_text: string | null;
  created_at: string;
  /** Drives incremental sync — the cursor and the "has this changed" check */
  updated_at: string;
  category: string | null;
  audio_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
}

/** Single idea from API response */
export interface APIIdea {
  id: string;
  type: string;
  attributes: IdeaAttributes;
}

/** Pagination metadata from API */
export interface PaginationMeta {
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  total_pages: number;
  total_count: number;
  per_page: number;
  /** Highest updated_at on this page; only sent for incremental requests */
  cursor?: string | null;
}

/** API response for GET /ideas */
export interface IdeasResponse {
  data: APIIdea[];
  meta: PaginationMeta;
}

/** An idea that could not be written to the vault */
export interface SyncFailure {
  id: string;
  title: string;
  message: string;
}

/** A note left untouched because the user had edited it in the vault */
export interface SyncSkip {
  id: string;
  title: string;
  path: string;
}

/**
 * Outcome of one sync pass.
 *
 * `notes` and `cursor` are what the caller persists. They describe what actually reached
 * the vault — recording the requested ideas instead would mark unwritten notes as done
 * and lose them, since the cursor would then move past them too.
 */
export interface SyncReport {
  created: string[];
  updated: string[];
  /** Already current, or synced before 0.3.0 and therefore not updatable */
  unchanged: string[];
  localEdits: SyncSkip[];
  failures: SyncFailure[];
  /** Entries to merge into SyncState.notes */
  notes: Record<string, SyncedNote>;
  cursor: string | null;
}
