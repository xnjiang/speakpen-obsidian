# SpeakPen Obsidian Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that syncs SpeakPen voice summaries into the vault as Markdown files.

**Architecture:** TypeScript Obsidian plugin using `requestUrl` for API calls, `Vault` API for file creation, plugin data store for tracking synced IDs. Single `main.ts` entry point with separate modules for API client, sync engine, and settings UI.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, Node.js

---

## File Structure

```
speakpen-obsidian/
├── src/
│   ├── main.ts              # Plugin entry point, lifecycle, commands, ribbon, intervals
│   ├── api.ts               # SpeakPen API client (requestUrl wrapper)
│   ├── sync.ts              # Sync engine: diff, create files, track state
│   ├── settings.ts          # Settings tab UI
│   └── types.ts             # Shared TypeScript interfaces
├── tests/
│   ├── api.test.ts          # API client unit tests
│   ├── sync.test.ts         # Sync engine unit tests
│   └── helpers.ts           # Test helpers and mocks
├── manifest.json            # Obsidian plugin manifest
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript config
├── esbuild.config.mjs       # Build config
├── .gitignore
└── docs/                    # Specs and plans
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/jiangxin/projects/speakpen-obsidian
git init
```

- [ ] **Step 2: Create manifest.json**

```json
{
  "id": "speakpen-sync",
  "name": "SpeakPen Sync",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "Sync your SpeakPen voice summaries into Obsidian as Markdown notes.",
  "author": "SpeakPen",
  "isDesktopOnly": false
}
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "speakpen-obsidian",
  "version": "0.1.0",
  "description": "SpeakPen sync plugin for Obsidian",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.21.0",
    "obsidian": "latest",
    "tslib": "^2.6.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES2021"],
    "outDir": "./dist",
    "paths": {
      "obsidian": ["./node_modules/obsidian"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "tests"]
}
```

- [ ] **Step 5: Create esbuild.config.mjs**

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
}).catch(() => process.exit(1));
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
main.js
dist/
data.json
.DS_Store
```

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/jiangxin/projects/speakpen-obsidian
npm install
```

- [ ] **Step 8: Commit**

```bash
git add manifest.json package.json tsconfig.json esbuild.config.mjs .gitignore package-lock.json
git commit -m "chore: scaffold Obsidian plugin project"
```

---

### Task 2: Types and Interfaces

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
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
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit --skipLibCheck src/types.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions"
```

---

### Task 3: API Client

**Files:**
- Create: `src/api.ts`
- Create: `tests/helpers.ts`
- Create: `tests/api.test.ts`

- [ ] **Step 1: Create tests/helpers.ts with mock data**

```typescript
import { APIIdea, IdeasResponse } from "../src/types";

export function makeIdea(overrides: Partial<APIIdea & { attributes: Partial<APIIdea["attributes"]> }> = {}): APIIdea {
  return {
    id: overrides.id ?? "idea-1",
    type: "idea",
    attributes: {
      title: "Test Idea",
      message: "This is a summary.",
      transcript_text: "This is the transcript.",
      created_at: "2026-03-28T10:00:00Z",
      category: "Meeting",
      audio_url: "https://speakpen.app/audio/test.m4a",
      status: "completed",
      ...(overrides.attributes ?? {}),
    },
  };
}

export function makeIdeasResponse(ideas: APIIdea[], meta?: Partial<IdeasResponse["meta"]>): IdeasResponse {
  return {
    data: ideas,
    meta: {
      current_page: 1,
      next_page: null,
      prev_page: null,
      total_pages: 1,
      total_count: ideas.length,
      per_page: 50,
      ...(meta ?? {}),
    },
  };
}
```

- [ ] **Step 2: Create tests/api.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpeakPenAPI } from "../src/api";
import { makeIdea, makeIdeasResponse } from "./helpers";

// Mock obsidian's requestUrl
vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";

const mockRequestUrl = vi.mocked(requestUrl);

describe("SpeakPenAPI", () => {
  let api: SpeakPenAPI;

  beforeEach(() => {
    api = new SpeakPenAPI("test-token-123");
    vi.clearAllMocks();
  });

  it("fetches a single page of ideas", async () => {
    const idea = makeIdea();
    const response = makeIdeasResponse([idea]);
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: response } as any);

    const result = await api.fetchIdeasPage(1);

    expect(mockRequestUrl).toHaveBeenCalledWith({
      url: "https://speakpen.app/api/v1/ideas?page=1&per_page=50",
      method: "GET",
      headers: {
        Authorization: "Bearer test-token-123",
        Accept: "application/json",
      },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].attributes.title).toBe("Test Idea");
  });

  it("fetches all ideas across multiple pages", async () => {
    const idea1 = makeIdea({ id: "idea-1" });
    const idea2 = makeIdea({ id: "idea-2" });

    mockRequestUrl
      .mockResolvedValueOnce({
        status: 200,
        json: makeIdeasResponse([idea1], { current_page: 1, next_page: 2, total_pages: 2 }),
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        json: makeIdeasResponse([idea2], { current_page: 2, next_page: null, total_pages: 2 }),
      } as any);

    const ideas = await api.fetchAllIdeas();

    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    expect(ideas).toHaveLength(2);
    expect(ideas[0].id).toBe("idea-1");
    expect(ideas[1].id).toBe("idea-2");
  });

  it("throws on 401 unauthorized", async () => {
    mockRequestUrl.mockRejectedValueOnce({ status: 401 });

    await expect(api.fetchIdeasPage(1)).rejects.toThrow("Invalid API Token");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/api.test.ts
```

Expected: FAIL — `SpeakPenAPI` module not found.

- [ ] **Step 4: Create src/api.ts**

```typescript
import { requestUrl } from "obsidian";
import { APIIdea, IdeasResponse } from "./types";

const BASE_URL = "https://speakpen.app/api/v1";

export class SpeakPenAPI {
  constructor(private token: string) {}

  async fetchIdeasPage(page: number): Promise<IdeasResponse> {
    try {
      const response = await requestUrl({
        url: `${BASE_URL}/ideas?page=${page}&per_page=50`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });
      return response.json as IdeasResponse;
    } catch (error: any) {
      if (error?.status === 401) {
        throw new Error("Invalid API Token");
      }
      throw new Error(`API request failed: ${error?.message ?? "Unknown error"}`);
    }
  }

  async fetchAllIdeas(): Promise<APIIdea[]> {
    const allIdeas: APIIdea[] = [];
    let page = 1;

    while (true) {
      const response = await this.fetchIdeasPage(page);
      allIdeas.push(...response.data);

      if (response.meta.next_page === null) {
        break;
      }
      page = response.meta.next_page;
    }

    return allIdeas;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api.ts tests/helpers.ts tests/api.test.ts
git commit -m "feat: add SpeakPen API client with pagination"
```

---

### Task 4: Sync Engine

**Files:**
- Create: `src/sync.ts`
- Create: `tests/sync.test.ts`

- [ ] **Step 1: Create tests/sync.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { buildMarkdown, sanitizeFilename, getNewIdeas } from "../src/sync";
import { makeIdea } from "./helpers";

describe("sanitizeFilename", () => {
  it("removes invalid characters", () => {
    expect(sanitizeFilename('Hello: World / Test? "yes"')).toBe("Hello World  Test yes");
  });

  it("trims whitespace and dots", () => {
    expect(sanitizeFilename("  hello. ")).toBe("hello");
  });

  it("returns Untitled for empty string", () => {
    expect(sanitizeFilename("")).toBe("Untitled");
  });
});

describe("buildMarkdown", () => {
  it("builds full markdown with summary and transcript", () => {
    const idea = makeIdea();
    const md = buildMarkdown(idea);

    expect(md).toContain('speakpen_id: "idea-1"');
    expect(md).toContain('title: "Test Idea"');
    expect(md).toContain('category: "Meeting"');
    expect(md).toContain("created_at: 2026-03-28T10:00:00Z");
    expect(md).toContain("## Summary");
    expect(md).toContain("This is a summary.");
    expect(md).toContain("## Transcript");
    expect(md).toContain("This is the transcript.");
  });

  it("omits transcript section when transcript_text is null", () => {
    const idea = makeIdea({ attributes: { transcript_text: null } as any });
    const md = buildMarkdown(idea);

    expect(md).toContain("## Summary");
    expect(md).not.toContain("## Transcript");
  });

  it("omits summary section when message is null", () => {
    const idea = makeIdea({ attributes: { message: null } as any });
    const md = buildMarkdown(idea);

    expect(md).not.toContain("## Summary");
    expect(md).toContain("## Transcript");
  });
});

describe("getNewIdeas", () => {
  it("filters out already synced and non-completed ideas", () => {
    const ideas = [
      makeIdea({ id: "1", attributes: { status: "completed" } as any }),
      makeIdea({ id: "2", attributes: { status: "completed" } as any }),
      makeIdea({ id: "3", attributes: { status: "processing" } as any }),
    ];
    const syncedIds = new Set(["1"]);

    const newIdeas = getNewIdeas(ideas, syncedIds);

    expect(newIdeas).toHaveLength(1);
    expect(newIdeas[0].id).toBe("2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/sync.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/sync.ts**

```typescript
import { Vault, normalizePath } from "obsidian";
import { APIIdea } from "./types";

/** Remove characters that are invalid in filenames */
export function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim().replace(/\.+$/, "").trim();
  return sanitized || "Untitled";
}

/** Build a Markdown string from an API idea */
export function buildMarkdown(idea: APIIdea): string {
  const a = idea.attributes;
  const lines: string[] = [];

  lines.push("---");
  lines.push(`speakpen_id: "${idea.id}"`);
  lines.push(`title: "${(a.title ?? "Untitled").replace(/"/g, '\\"')}"`);
  if (a.category) lines.push(`category: "${a.category}"`);
  lines.push(`created_at: ${a.created_at}`);
  if (a.audio_url) lines.push(`audio_url: "${a.audio_url}"`);
  lines.push(`synced_at: ${new Date().toISOString()}`);
  lines.push("---");
  lines.push("");

  if (a.message) {
    lines.push("## Summary");
    lines.push("");
    lines.push(a.message);
    lines.push("");
  }

  if (a.transcript_text) {
    lines.push("## Transcript");
    lines.push("");
    lines.push(a.transcript_text);
    lines.push("");
  }

  return lines.join("\n");
}

/** Filter ideas to only new, completed ones */
export function getNewIdeas(ideas: APIIdea[], syncedIds: Set<string>): APIIdea[] {
  return ideas.filter(
    (idea) => idea.attributes.status === "completed" && !syncedIds.has(idea.id)
  );
}

/** Generate a unique file path, appending (1), (2), etc. if needed */
export function buildFilePath(folder: string, title: string, date: string, vault: Vault): string {
  const dateStr = date.slice(0, 10); // YYYY-MM-DD
  const safeName = sanitizeFilename(title);
  const baseName = `${safeName} - ${dateStr}`;

  let candidate = normalizePath(`${folder}/${baseName}.md`);
  let counter = 1;

  while (vault.getAbstractFileByPath(candidate)) {
    candidate = normalizePath(`${folder}/${baseName} (${counter}).md`);
    counter++;
  }

  return candidate;
}

/** Create idea files in the vault. Returns count of created files. */
export async function syncIdeasToVault(
  ideas: APIIdea[],
  folder: string,
  vault: Vault,
): Promise<number> {
  // Ensure folder exists
  if (!vault.getAbstractFileByPath(normalizePath(folder))) {
    await vault.createFolder(normalizePath(folder));
  }

  let created = 0;
  for (const idea of ideas) {
    const filePath = buildFilePath(folder, idea.attributes.title, idea.attributes.created_at, vault);
    const content = buildMarkdown(idea);
    await vault.create(filePath, content);
    created++;
  }

  return created;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/sync.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync.ts tests/sync.test.ts
git commit -m "feat: add sync engine with markdown generation"
```

---

### Task 5: Settings Tab

**Files:**
- Create: `src/settings.ts`

- [ ] **Step 1: Create src/settings.ts**

```typescript
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

    containerEl.createEl("h2", { text: "SpeakPen Sync Settings" });

    new Setting(containerEl)
      .setName("API Token")
      .setDesc("Your SpeakPen API token. Get it from the SpeakPen app settings.")
      .addText((text) =>
        text
          .setPlaceholder("Enter your API token")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("Sync Folder")
      .setDesc("Vault folder where SpeakPen notes will be created.")
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
      .setName("Auto Sync")
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
      .setName("Sync Interval (minutes)")
      .setDesc("How often to check for new ideas. Minimum 1 minute.")
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
```

- [ ] **Step 2: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add settings tab UI"
```

---

### Task 6: Main Plugin Entry Point

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create src/main.ts**

```typescript
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
      if (!silent) new Notice(`SpeakPen: Sync failed — ${msg}`);
      console.error("SpeakPen sync error:", error);
    } finally {
      this.isSyncing = false;
      this.updateStatusBar();
    }
  }
}
```

- [ ] **Step 2: Build the plugin**

```bash
cd /Users/jiangxin/projects/speakpen-obsidian
npm run build
```

Expected: Produces `main.js` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: add main plugin with sync, commands, ribbon, and auto-sync"
```

---

### Task 7: Build Verification and Manual Test

**Files:**
- Verify: `main.js` (build output)
- Verify: `manifest.json`

- [ ] **Step 1: Run all tests**

```bash
cd /Users/jiangxin/projects/speakpen-obsidian
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: `main.js` is generated, no TypeScript errors.

- [ ] **Step 3: Verify plugin can be loaded**

Check that these files exist and are valid:
- `main.js` — bundled plugin code
- `manifest.json` — valid JSON with required fields

```bash
ls -la main.js manifest.json
cat manifest.json | python3 -m json.tool
```

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: verify build and tests pass"
```

---

### Task 8: Backend — Add API Token Authentication

> This task requires changes to the SpeakPen backend (Rails or whatever framework). Outlined here for completeness; implement when ready.

- [ ] **Step 1: Design token model**

The backend needs:
- `api_tokens` table: `id`, `user_id`, `token` (hashed), `name`, `last_used_at`, `created_at`
- Generate token: `SecureRandom.hex(32)` or similar
- Store hashed (`bcrypt` or `SHA-256`)
- Return plaintext token only once at creation

- [ ] **Step 2: Add token authentication middleware**

In the API authentication layer, check for Bearer token:
1. First try JWT decode (existing flow)
2. If JWT fails, look up token in `api_tokens` table
3. If found and valid, authenticate as that user
4. Update `last_used_at`

- [ ] **Step 3: Add token management endpoints**

```
POST   /api/v1/api_tokens   — create new token (returns plaintext once)
GET    /api/v1/api_tokens   — list tokens (name, last_used_at, created_at only)
DELETE /api/v1/api_tokens/:id — revoke token
```

- [ ] **Step 4: Add token generation UI in SpeakPen app**

In Settings screen, add "API Tokens" section:
- "Generate Token" button → shows token once → user copies to Obsidian
- List existing tokens with revoke option

---

## Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Project scaffolding | None |
| 2 | Types and interfaces | Task 1 |
| 3 | API client + tests | Task 2 |
| 4 | Sync engine + tests | Task 2 |
| 5 | Settings tab | Task 2 |
| 6 | Main plugin entry | Tasks 3, 4, 5 |
| 7 | Build verification | Task 6 |
| 8 | Backend token auth | Independent |
