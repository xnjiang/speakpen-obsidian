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
