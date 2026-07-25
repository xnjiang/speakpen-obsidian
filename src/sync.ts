import { Vault, normalizePath } from "obsidian";
import { APIIdea, SyncFailure, SyncResult } from "./types";

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
  lines.push(a.category ? `category: "${a.category}"` : "category: null");
  lines.push(`created_at: ${a.created_at}`);
  // `audio_url` is deliberately not written. The API returns a presigned URL that
  // expires within hours, and notes are only ever created, never rewritten — so
  // persisting it would leave every note holding a link that is dead by the next
  // day. `speakpen_id` is enough to find the recording back in SpeakPen.
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

/**
 * Create the sync folder, including any missing parent folders.
 *
 * A nested sync folder such as `Notes/Voice` used to be created with a single
 * createFolder call. Obsidian's API contract only promises to "create a new folder"
 * and says nothing about intermediate levels, so that relied on unspecified behaviour:
 * if the parent did not exist, the first sync of a fresh vault would throw and the
 * user would see nothing but "Sync failed". Walking the path makes it work either way.
 *
 * createFolder throws when the folder already exists, and check-then-create is not
 * atomic against a vault index that can lag the filesystem, so a failure here is not
 * conclusive. Folder creation is treated as best effort: vault.create below is the
 * authoritative point of failure, and it names the file it could not write.
 */
export async function ensureFolder(folder: string, vault: Vault): Promise<void> {
  const parts = normalizePath(folder).split("/").filter((part) => part.length > 0);

  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (vault.getAbstractFileByPath(current)) continue;

    try {
      await vault.createFolder(current);
    } catch {
      // Already there — carry on and let file creation report any real problem.
    }
  }
}

/**
 * Write each idea into the vault.
 *
 * Reports which ideas were written rather than just how many, because the caller
 * records those ids as synced. Letting one bad note abort the batch used to lose that
 * information for the notes already on disk: their ids were never recorded, so the next
 * run treated them as new and buildFilePath gave them ` (1)` names — a failed sync
 * silently duplicated everything it had managed to write. A note that cannot be written
 * is therefore collected and skipped, not thrown, and the ones that succeeded are always
 * reported back.
 *
 * Writes are sequential on purpose. buildFilePath resolves collisions by asking the vault
 * what already exists, which only works if the previous file is on disk before the next
 * path is chosen; running these concurrently would let two notes pick the same name.
 */
export async function syncIdeasToVault(
  ideas: APIIdea[],
  folder: string,
  vault: Vault,
): Promise<SyncResult> {
  await ensureFolder(folder, vault);

  const syncedIds: string[] = [];
  const failures: SyncFailure[] = [];

  for (const idea of ideas) {
    try {
      const filePath = buildFilePath(folder, idea.attributes.title, idea.attributes.created_at, vault);
      const content = buildMarkdown(idea);
      await vault.create(filePath, content);
      syncedIds.push(idea.id);
    } catch (error: unknown) {
      failures.push({
        id: idea.id,
        title: idea.attributes.title,
        message: (error as { message?: string })?.message ?? "Unknown error",
      });
    }
  }

  return { syncedIds, failures };
}
