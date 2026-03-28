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

/** Persisted sync state (saved via plugin.saveData alongside settings) */
export interface SyncState {
  syncedIds: string[];
  lastSyncTime: string | null;
}

export const DEFAULT_SYNC_STATE: SyncState = {
  syncedIds: [],
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
}

/** API response for GET /ideas */
export interface IdeasResponse {
  data: APIIdea[];
  meta: PaginationMeta;
}
