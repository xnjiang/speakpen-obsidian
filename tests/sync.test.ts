import { describe, it, expect, vi } from "vitest";
import {
  buildMarkdown,
  sanitizeFilename,
  getNewIdeas,
  ensureFolder,
  buildFilePath,
  syncIdeasToVault,
} from "../src/sync";
import { makeIdea } from "./helpers";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\/+/g, "/"),
}));

/** Stands in for Obsidian's Vault, recording what the sync asked it to create. */
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
  it("writes one file per idea into a nested folder", async () => {
    const vault = new FakeVault();
    const ideas = [
      makeIdea({ id: "1", attributes: { title: "First" } as any }),
      makeIdea({ id: "2", attributes: { title: "Second" } as any }),
    ];

    const { syncedIds, failures } = await syncIdeasToVault(ideas, "Notes/Voice", vault as any);

    expect(syncedIds).toEqual(["1", "2"]);
    expect(failures).toEqual([]);
    expect(vault.folders).toContain("Notes");
    expect(vault.folders).toContain("Notes/Voice");
    expect([...vault.files.keys()].every((p) => p.startsWith("Notes/Voice/"))).toBe(true);
  });

  // 这条锁住的是审核里发现的重复 bug：以前一条写失败会中断整批，已经落盘的那几条
  // 因为 id 没被记录，下次同步会被当成新笔记，再写一份 " (1)"。
  it("reports the ideas it wrote even when one of them fails", async () => {
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

    const { syncedIds, failures } = await syncIdeasToVault(ideas, "SpeakPen", vault as any);

    // 失败的那条不该拖垮它后面的
    expect(syncedIds).toEqual(["1", "3"]);
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("2");
    expect(failures[0].title).toBe("Broken");
    expect(failures[0].message).toBe("disk on fire");
    expect(vault.files.size).toBe(2);
  });

  it("does not duplicate an already written note when a later sync retries", async () => {
    const vault = new FakeVault();
    const ideas = [makeIdea({ id: "1", attributes: { title: "Once only" } as any })];

    const first = await syncIdeasToVault(ideas, "SpeakPen", vault as any);
    expect(first.syncedIds).toEqual(["1"]);

    // 调用方把返回的 id 记进 syncedIds 之后，这条就不会再进入下一轮的候选集
    const remaining = getNewIdeas(ideas, new Set(first.syncedIds));
    expect(remaining).toEqual([]);
    expect(vault.files.size).toBe(1);
  });

  it("creates the folder once, not once per idea", async () => {
    const vault = new FakeVault();
    const ideas = Array.from({ length: 5 }, (_, i) =>
      makeIdea({ id: String(i), attributes: { title: `Note ${i}` } as any }),
    );

    await syncIdeasToVault(ideas, "SpeakPen", vault as any);

    expect(vault.createFolderCalls).toEqual(["SpeakPen"]);
  });

  it("gives colliding titles distinct filenames instead of overwriting", async () => {
    const vault = new FakeVault();
    const ideas = [
      makeIdea({ id: "1", attributes: { title: "Standup" } as any }),
      makeIdea({ id: "2", attributes: { title: "Standup" } as any }),
    ];

    const { syncedIds } = await syncIdeasToVault(ideas, "SpeakPen", vault as any);

    expect(syncedIds).toEqual(["1", "2"]);
    expect(vault.files.size).toBe(2);
    expect([...vault.files.keys()]).toEqual([
      "SpeakPen/Standup - 2026-03-28.md",
      "SpeakPen/Standup - 2026-03-28 (1).md",
    ]);
  });
});
