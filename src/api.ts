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
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err?.status === 401) {
        throw new Error("Invalid API token");
      }
      throw new Error(`API request failed: ${err?.message ?? "Unknown error"}`);
    }
  }

  async fetchAllIdeas(): Promise<APIIdea[]> {
    const allIdeas: APIIdea[] = [];
    let page = 1;

    while (true) {
      const response = await this.fetchIdeasPage(page);
      allIdeas.push(...response.data);

      const nextPage = response.meta.next_page;
      if (nextPage === null) {
        break;
      }

      // The cursor has to move forward. A next_page that repeats or goes backwards
      // would otherwise loop here indefinitely, growing allIdeas without bound and
      // leaving isSyncing stuck true so no later sync could start.
      if (nextPage <= page) {
        throw new Error(`Pagination did not advance past page ${page}`);
      }
      page = nextPage;
    }

    return allIdeas;
  }
}
