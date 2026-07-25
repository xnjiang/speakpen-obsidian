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

  it("gives up when pagination stops advancing", async () => {
    // 服务端若把 next_page 报成同一页，旧写法会无限循环、内存无上限增长，
    // 而且 isSyncing 一直卡在 true，之后再也不会有同步启动。
    const stuck = makeIdeasResponse([makeIdea()], { next_page: 1 });
    mockRequestUrl.mockResolvedValue({ status: 200, json: stuck } as any);

    await expect(api.fetchIdeasSince(null)).rejects.toThrow("Pagination did not advance");
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

    const ideas = await api.fetchIdeasSince(null);

    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    expect(ideas).toHaveLength(2);
    expect(ideas[0].id).toBe("idea-1");
    expect(ideas[1].id).toBe("idea-2");
  });

  // 这条是整个增量同步省下请求的关键：游标没上到 query string 上，
  // 服务端就会照旧返回全量，插件却以为自己在做增量。
  it("sends the cursor as updated_since", async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: makeIdeasResponse([makeIdea()]),
    } as any);

    await api.fetchIdeasSince("2026-03-28T10:00:00Z");

    const url = mockRequestUrl.mock.calls[0][0].url;
    expect(url).toContain("updated_since=2026-03-28T10%3A00%3A00Z");
  });

  it("omits updated_since on a first sync so the whole history arrives", async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: makeIdeasResponse([makeIdea()]),
    } as any);

    await api.fetchIdeasSince(null);

    expect(mockRequestUrl.mock.calls[0][0].url).not.toContain("updated_since");
  });

  it("throws on 401 unauthorized", async () => {
    mockRequestUrl.mockRejectedValueOnce({ status: 401 });

    await expect(api.fetchIdeasPage(1)).rejects.toThrow("Invalid API token");
  });
});
