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
