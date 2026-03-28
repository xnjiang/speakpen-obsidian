import { describe, it, expect, vi } from "vitest";
import { buildMarkdown, sanitizeFilename, getNewIdeas } from "../src/sync";
import { makeIdea } from "./helpers";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path,
}));

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
