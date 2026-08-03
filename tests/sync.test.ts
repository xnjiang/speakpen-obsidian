import { describe, it, expect, vi } from "vitest";
import {
  buildMarkdown,
  sanitizeFilename,
  getNewIdeas,
  ensureFolder,
  buildFilePath,
  syncIdeasToVault,
  migrateSyncFolder,
  hashContent,
  nextCursor,
} from "../src/sync";
import type { SyncState } from "../src/types";
import { makeIdea } from "./helpers";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\/+/g, "/"),
}));

/** Stands in for Obsidian's Vault, recording what the sync asked it to do. */
class FakeVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  /** Folder paths createFolder was called with, in order. */
  createFolderCalls: string[] = [];

  getAbstractFileByPath(path: string) {
    if (this.files.has(path)) return { path };
    if (this.folders.has(path)) return { path };
    return null;
  }

  getFileByPath(path: string) {
    return this.files.has(path) ? { path } : null;
  }

  async createFolder(path: string) {
    this.createFolderCalls.push(path);
    if (this.folders.has(path)) throw new Error(`Folder already exists: ${path}`);
    this.folders.add(path);
  }

  async create(path: string, content: string) {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    this.files.set(path, content);
    return { path };
  }

  async read(file: { path: string }) {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`No such file: ${file.path}`);
    return content;
  }

  async modify(file: { path: string }, content: string) {
    if (!this.files.has(file.path)) throw new Error(`No such file: ${file.path}`);
    this.files.set(file.path, content);
  }

  async rename(file: { path: string }, newPath: string) {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`No such file: ${file.path}`);
    this.files.delete(file.path);
    this.files.set(newPath, content);
  }
}

function makeState(overrides: Partial<SyncState> = {}): SyncState {
  return { notes: {}, legacyIds: [], cursor: null, syncFolder: null, lastSyncTime: null, ...overrides };
}

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

  // The API presigns audio_url with a expiry measured in hours, and a note is
  // written once and never rewritten. Persisting the URL would bake a link into
  // the vault that stops working the same day, so it must stay out of the note.
  it("never writes the expiring audio_url into the note", () => {
    const idea = makeIdea({
      attributes: {
        audio_url:
          "https://r2.speakpen.app/audio/test.m4a?X-Amz-Signature=deadbeef&X-Amz-Expires=43200",
      } as any,
    });
    const md = buildMarkdown(idea);

    expect(md).not.toContain("audio_url");
    expect(md).not.toContain("X-Amz-Signature");
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

describe("ensureFolder", () => {
  it("creates a single-level folder", async () => {
    const vault = new FakeVault();
    await ensureFolder("SpeakPen", vault as any);
    expect(vault.createFolderCalls).toEqual(["SpeakPen"]);
  });

  // 这是这次修的那个：嵌套路径以前只调一次 createFolder，父目录不存在时
  // 首次同步会直接抛错，用户只看到 "Sync failed"。
  it("creates every missing level of a nested folder", async () => {
    const vault = new FakeVault();
    await ensureFolder("Notes/Voice/SpeakPen", vault as any);
    expect(vault.createFolderCalls).toEqual(["Notes", "Notes/Voice", "Notes/Voice/SpeakPen"]);
  });

  it("only creates the levels that are missing", async () => {
    const vault = new FakeVault();
    vault.folders.add("Notes");

    await ensureFolder("Notes/Voice", vault as any);

    expect(vault.createFolderCalls).toEqual(["Notes/Voice"]);
  });

  it("does nothing when the folder is already there", async () => {
    const vault = new FakeVault();
    vault.folders.add("SpeakPen");

    await ensureFolder("SpeakPen", vault as any);

    expect(vault.createFolderCalls).toEqual([]);
  });

  // 大小写不敏感的文件系统上，vault 索引和磁盘可能对 speakpen / SpeakPen 看法不一致，
  // createFolder 会抛「已存在」。同步不该因此中断。
  it("survives createFolder throwing because the folder exists after all", async () => {
    const vault = new FakeVault();
    vault.createFolder = async (path: string) => {
      vault.createFolderCalls.push(path);
      throw new Error("Folder already exists");
    };

    await expect(ensureFolder("SpeakPen", vault as any)).resolves.toBeUndefined();
  });

  it("ignores empty segments from stray slashes", async () => {
    const vault = new FakeVault();
    await ensureFolder("Notes//Voice/", vault as any);
    expect(vault.createFolderCalls).toEqual(["Notes", "Notes/Voice"]);
  });
});

describe("buildFilePath", () => {
  it("names a file after the title and creation date", () => {
    const vault = new FakeVault();
    const path = buildFilePath("SpeakPen", "Meeting notes", "2026-03-28T10:00:00Z", vault as any);
    expect(path).toBe("SpeakPen/Meeting notes - 2026-03-28.md");
  });

  it("suffixes a counter rather than overwriting an existing note", () => {
    const vault = new FakeVault();
    vault.files.set("SpeakPen/Meeting notes - 2026-03-28.md", "existing");

    const path = buildFilePath("SpeakPen", "Meeting notes", "2026-03-28T10:00:00Z", vault as any);

    expect(path).toBe("SpeakPen/Meeting notes - 2026-03-28 (1).md");
  });

  it("keeps counting past the first collision", () => {
    const vault = new FakeVault();
    vault.files.set("SpeakPen/Standup - 2026-03-28.md", "a");
    vault.files.set("SpeakPen/Standup - 2026-03-28 (1).md", "b");

    const path = buildFilePath("SpeakPen", "Standup", "2026-03-28T10:00:00Z", vault as any);

    expect(path).toBe("SpeakPen/Standup - 2026-03-28 (2).md");
  });
});


describe("syncIdeasToVault", () => {
  it("creates a note and records where it went", async () => {
    const vault = new FakeVault();
    const idea = makeIdea({ id: "1", attributes: { title: "First" } as any });

    const report = await syncIdeasToVault([idea], "Notes/Voice", vault as any, makeState());

    expect(report.created).toEqual(["1"]);
    expect(report.notes["1"].path).toBe("Notes/Voice/First - 2026-03-28.md");
    expect(report.notes["1"].updatedAt).toBe("2026-03-28T10:00:00Z");
    expect(vault.folders.has("Notes")).toBe(true);
  });

  it("skips notes that are not finished transcribing", async () => {
    const vault = new FakeVault();
    const ideas = [
      makeIdea({ id: "1", attributes: { status: "completed" } as any }),
      makeIdea({ id: "2", attributes: { status: "processing" } as any }),
    ];

    const report = await syncIdeasToVault(ideas, "SpeakPen", vault as any, makeState());

    expect(report.created).toEqual(["1"]);
    expect(vault.files.size).toBe(1);
  });

  // 这是「改了不回流」的正解：服务端 updated_at 变了，就把文件改写成新内容。
  it("rewrites a note when SpeakPen's copy has changed", async () => {
    const vault = new FakeVault();
    const original = makeIdea({ id: "1", attributes: { title: "Note", message: "old" } as any });

    const first = await syncIdeasToVault([original], "SpeakPen", vault as any, makeState());
    const path = first.notes["1"].path;

    const edited = makeIdea({
      id: "1",
      attributes: { title: "Note", message: "new text", updated_at: "2026-03-29T10:00:00Z" } as any,
    });
    const report = await syncIdeasToVault([edited], "SpeakPen", vault as any,
      makeState({ notes: first.notes }));

    expect(report.updated).toEqual(["1"]);
    expect(vault.files.size).toBe(1);
    expect(vault.files.get(path)).toContain("new text");
    expect(report.notes["1"].updatedAt).toBe("2026-03-29T10:00:00Z");
  });

// 落地页和 README 都声明「在 SpeakPen 里改名，仓库里那份保持原文件名、只换内容」。
// 上面那条 rewrites 测试两次用的是同一个标题，证明不到这一点——改名这条路径
// 此前没有任何测试覆盖，而它正是 2026-07-26 faee134 修正 README 时争的那句话。
// 依据：更新分支走 vault.modify(existing) 并记回 tracked.path，buildFilePath
// 只在两条创建分支上调用，所以标题变了也不会生成新文件名。
it("keeps the original filename when the note is renamed in SpeakPen", async () => {
  const vault = new FakeVault();
  const original = makeIdea({ id: "1", attributes: { title: "Old Title", message: "old" } as any });

  const first = await syncIdeasToVault([original], "SpeakPen", vault as any, makeState());
  const originalPath = first.notes["1"].path;
  expect(originalPath).toContain("Old Title");

  const renamed = makeIdea({
    id: "1",
    attributes: { title: "Brand New Title", message: "new text", updated_at: "2026-03-29T10:00:00Z" } as any,
  });
  const report = await syncIdeasToVault([renamed], "SpeakPen", vault as any,
    makeState({ notes: first.notes }));

  // 内容更新了，但文件名和路径都没动，也没有多出一个以新标题命名的文件。
  expect(report.updated).toEqual(["1"]);
  expect(vault.files.size).toBe(1);
  expect([...vault.files.keys()]).toEqual([originalPath]);
  expect(vault.files.get(originalPath)).toContain("new text");
  expect(report.notes["1"].path).toBe(originalPath);
});

  // 用户自己在 Obsidian 里写的东西没有别处可恢复，SpeakPen 那份有。绝不拿前者换后者。
  it("refuses to overwrite a note the user has edited in the vault", async () => {
    const vault = new FakeVault();
    const original = makeIdea({ id: "1", attributes: { title: "Note", message: "old" } as any });

    const first = await syncIdeasToVault([original], "SpeakPen", vault as any, makeState());
    const path = first.notes["1"].path;
    vault.files.set(path, "my own notes on top of this");

    const edited = makeIdea({
      id: "1",
      attributes: { title: "Note", message: "server text", updated_at: "2026-03-29T10:00:00Z" } as any,
    });
    const report = await syncIdeasToVault([edited], "SpeakPen", vault as any,
      makeState({ notes: first.notes }));

    expect(report.updated).toEqual([]);
    expect(report.localEdits).toHaveLength(1);
    expect(report.localEdits[0].path).toBe(path);
    expect(vault.files.get(path)).toBe("my own notes on top of this");
  });

  it("does no disk work when nothing changed server-side", async () => {
    const vault = new FakeVault();
    const idea = makeIdea({ id: "1" });
    const first = await syncIdeasToVault([idea], "SpeakPen", vault as any, makeState());

    const report = await syncIdeasToVault([idea], "SpeakPen", vault as any,
      makeState({ notes: first.notes }));

    expect(report.unchanged).toEqual(["1"]);
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
  });

  it("writes a note again if it has vanished from the vault", async () => {
    const vault = new FakeVault();
    const idea = makeIdea({ id: "1" });
    const first = await syncIdeasToVault([idea], "SpeakPen", vault as any, makeState());
    vault.files.delete(first.notes["1"].path);

    const changed = makeIdea({ id: "1", attributes: { updated_at: "2026-03-29T10:00:00Z" } as any });
    const report = await syncIdeasToVault([changed], "SpeakPen", vault as any,
      makeState({ notes: first.notes }));

    expect(report.created).toEqual(["1"]);
    expect(vault.files.size).toBe(1);
  });

  // 0.3.0 之前只记了 id，不知道文件在哪、内容是什么。不能更新，但必须记得，
  // 否则升级后第一次同步会把用户已有的每条笔记再写一份。
  it("does not duplicate notes synced by an older version", async () => {
    const vault = new FakeVault();
    const idea = makeIdea({ id: "1" });

    const report = await syncIdeasToVault([idea], "SpeakPen", vault as any,
      makeState({ legacyIds: ["1"] }));

    expect(report.created).toEqual([]);
    expect(report.unchanged).toEqual(["1"]);
    expect(vault.files.size).toBe(0);
  });

  it("keeps going when one note cannot be written", async () => {
    const vault = new FakeVault();
    const realCreate = vault.create.bind(vault);
    vault.create = async (path: string, content: string) => {
      if (path.includes("Broken")) throw new Error("disk on fire");
      return realCreate(path, content);
    };

    const ideas = [
      makeIdea({ id: "1", attributes: { title: "Fine" } as any }),
      makeIdea({ id: "2", attributes: { title: "Broken" } as any }),
      makeIdea({ id: "3", attributes: { title: "Also fine" } as any }),
    ];

    const report = await syncIdeasToVault(ideas, "SpeakPen", vault as any, makeState());

    expect(report.created).toEqual(["1", "3"]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].id).toBe("2");
  });
});

describe("nextCursor", () => {
  it("advances to the newest change in the batch", () => {
    const ideas = [
      makeIdea({ id: "1", attributes: { updated_at: "2026-03-28T10:00:00Z" } as any }),
      makeIdea({ id: "2", attributes: { updated_at: "2026-03-29T10:00:00Z" } as any }),
    ];

    expect(nextCursor(ideas, [], null)).toBe("2026-03-29T10:00:00Z");
  });

  // 失败的那条 id 没被记录。游标若越过它，它既不在磁盘上、也再不会被请求——永久丢失。
  it("stops at the earliest failure so it gets retried", () => {
    const ideas = [
      makeIdea({ id: "1", attributes: { updated_at: "2026-03-28T10:00:00Z" } as any }),
      makeIdea({ id: "2", attributes: { updated_at: "2026-03-29T10:00:00Z" } as any }),
      makeIdea({ id: "3", attributes: { updated_at: "2026-03-30T10:00:00Z" } as any }),
    ];
    const failures = [{ id: "2", title: "Broken", message: "nope" }];

    expect(nextCursor(ideas, failures, null)).toBe("2026-03-29T10:00:00Z");
  });

  it("advances past notes still being transcribed", () => {
    // 转写完成会更新 updated_at，所以未完成的笔记会自己回来，不必为它把游标钉住。
    const ideas = [
      makeIdea({ id: "1", attributes: { status: "completed", updated_at: "2026-03-28T10:00:00Z" } as any }),
      makeIdea({ id: "2", attributes: { status: "processing", updated_at: "2026-03-29T10:00:00Z" } as any }),
    ];

    expect(nextCursor(ideas, [], null)).toBe("2026-03-29T10:00:00Z");
  });

  it("keeps the old cursor when the batch is empty", () => {
    expect(nextCursor([], [], "2026-03-28T10:00:00Z")).toBe("2026-03-28T10:00:00Z");
  });
});

describe("migrateSyncFolder", () => {
  it("moves tracked notes when the folder setting changes", async () => {
    const vault = new FakeVault();
    vault.files.set("Old/Note - 2026-03-28.md", "content");
    const notes = {
      "1": { path: "Old/Note - 2026-03-28.md", hash: hashContent("content"), updatedAt: "x" },
    };

    const { moved, failures } = await migrateSyncFolder(notes, "Old", "New", vault as any);

    expect(failures).toEqual([]);
    expect(moved["1"].path).toBe("New/Note - 2026-03-28.md");
    expect(vault.files.has("New/Note - 2026-03-28.md")).toBe(true);
    expect(vault.files.has("Old/Note - 2026-03-28.md")).toBe(false);
  });

  it("does nothing when the folder has not changed", async () => {
    const vault = new FakeVault();
    vault.files.set("SpeakPen/Note.md", "content");
    const notes = { "1": { path: "SpeakPen/Note.md", hash: "h", updatedAt: "x" } };

    const { moved } = await migrateSyncFolder(notes, "SpeakPen", "SpeakPen", vault as any);

    expect(moved).toEqual({});
    expect(vault.files.has("SpeakPen/Note.md")).toBe(true);
  });

  it("does nothing on a vault that has never synced", async () => {
    const vault = new FakeVault();
    const { moved } = await migrateSyncFolder({}, null, "SpeakPen", vault as any);
    expect(moved).toEqual({});
  });

  it("leaves a note the user has moved themselves alone", async () => {
    const vault = new FakeVault();
    // 记录里说在 Old/，实际用户自己挪走了。
    const notes = { "1": { path: "Old/Gone.md", hash: "h", updatedAt: "x" } };

    const { moved, failures } = await migrateSyncFolder(notes, "Old", "New", vault as any);

    expect(moved).toEqual({});
    expect(failures).toEqual([]);
  });

  it("keeps both notes when the destination name is taken", async () => {
    const vault = new FakeVault();
    vault.files.set("Old/Note.md", "ours");
    vault.files.set("New/Note.md", "someone else's");
    const notes = { "1": { path: "Old/Note.md", hash: "h", updatedAt: "x" } };

    const { moved } = await migrateSyncFolder(notes, "Old", "New", vault as any);

    expect(moved["1"].path).toBe("New/Note (1).md");
    expect(vault.files.get("New/Note.md")).toBe("someone else's");
    expect(vault.files.get("New/Note (1).md")).toBe("ours");
  });
});
