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

      if (response.meta.next_page === null) {
        break;
      }
      page = response.meta.next_page;
    }

    return allIdeas;
  }
}
