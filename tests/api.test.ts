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

    await expect(api.fetchIdeasPage(1)).rejects.toThrow("Invalid API token");
  });
});
