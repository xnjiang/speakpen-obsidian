import { Vault, normalizePath } from "obsidian";
import { APIIdea, SyncFailure, SyncReport, SyncState, SyncedNote } from "./types";

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

/**
 * Cheap non-cryptographic hash (FNV-1a), used only to notice that a file changed.
 *
 * The question being asked is "is this still the text we wrote?", so collision
 * resistance does not matter; being synchronous and dependency-free does.
 */
export function hashContent(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
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
  state: SyncState,
): Promise<SyncReport> {
  const report: SyncReport = {
    created: [],
    updated: [],
    unchanged: [],
    localEdits: [],
    failures: [],
    notes: {},
    cursor: state.cursor,
  };

  const completed = ideas.filter((idea) => idea.attributes.status === "completed");
  if (completed.length > 0) {
    await ensureFolder(folder, vault);
  }

  const legacy = new Set(state.legacyIds);

  for (const idea of completed) {
    try {
      const tracked = state.notes[idea.id];

      if (!tracked) {
        if (legacy.has(idea.id)) {
          // Synced before 0.3.0, when only the id was recorded. We do not know where it
          // went or what it said, so it cannot be updated or moved safely — but it must
          // be remembered, or we would write the user a second copy of a note they have.
          report.unchanged.push(idea.id);
          continue;
        }

        const path = buildFilePath(folder, idea.attributes.title, idea.attributes.created_at, vault);
        const content = buildMarkdown(idea);
        await vault.create(path, content);
        report.created.push(idea.id);
        report.notes[idea.id] = {
          path,
          hash: hashContent(content),
          updatedAt: idea.attributes.updated_at,
        };
        continue;
      }

      if (tracked.updatedAt === idea.attributes.updated_at) {
        // The server sends back the row sitting exactly on the cursor, so this is the
        // common case on a quiet sync. Answer it without touching the disk.
        report.unchanged.push(idea.id);
        continue;
      }

      const existing = vault.getFileByPath(tracked.path);
      if (!existing) {
        // Deleted or moved out from under us. Write it again where it belongs now.
        const path = buildFilePath(folder, idea.attributes.title, idea.attributes.created_at, vault);
        const content = buildMarkdown(idea);
        await vault.create(path, content);
        report.created.push(idea.id);
        report.notes[idea.id] = {
          path,
          hash: hashContent(content),
          updatedAt: idea.attributes.updated_at,
        };
        continue;
      }

      const onDisk = await vault.read(existing);
      if (hashContent(onDisk) !== tracked.hash) {
        // The user has written in this note. Their words are not reproducible from
        // anywhere; the SpeakPen copy is. Never trade one for the other.
        report.localEdits.push({ id: idea.id, title: idea.attributes.title, path: tracked.path });
        continue;
      }

      const content = buildMarkdown(idea);
      await vault.modify(existing, content);
      report.updated.push(idea.id);
      report.notes[idea.id] = {
        path: tracked.path,
        hash: hashContent(content),
        updatedAt: idea.attributes.updated_at,
      };
    } catch (error: unknown) {
      report.failures.push({
        id: idea.id,
        title: idea.attributes.title,
        message: (error as { message?: string })?.message ?? "Unknown error",
      });
    }
  }

  report.cursor = nextCursor(ideas, report.failures, state.cursor);
  return report;
}

/**
 * Where to resume next time.
 *
 * Normally the newest change in the batch, taken across every idea rather than only the
 * completed ones: finishing transcription bumps updated_at, so a note skipped while
 * pending comes back on its own and does not need the cursor held open for it.
 *
 * A failed write is different. Its id was never recorded, so moving the cursor past it
 * would lose it permanently — the note would be neither on disk nor ever requested
 * again. The cursor therefore stops at the earliest failure, and since the boundary is
 * inclusive, the next sync starts by retrying exactly that note.
 */
export function nextCursor(
  ideas: APIIdea[],
  failures: SyncFailure[],
  fallback: string | null,
): string | null {
  if (failures.length > 0) {
    const failed = new Set(failures.map((failure) => failure.id));
    const earliest = ideas
      .filter((idea) => failed.has(idea.id))
      .map((idea) => idea.attributes.updated_at)
      .sort();
    return earliest[0] ?? fallback;
  }

  const timestamps = ideas.map((idea) => idea.attributes.updated_at).sort();
  return timestamps[timestamps.length - 1] ?? fallback;
}

/**
 * Move already-synced notes when the sync folder setting changes.
 *
 * Without this, changing the folder left every existing note behind: the old files stayed
 * put, and because their ids were already recorded nothing recreated them in the new
 * folder, so a user's notes ended up split across two places with no way to tell which
 * was current. Runs once per change, driven by the folder recorded in sync state.
 *
 * A note the user has since moved themselves is left alone — their filing beats ours.
 */
export async function migrateSyncFolder(
  notes: Record<string, SyncedNote>,
  oldFolder: string | null,
  newFolder: string,
  vault: Vault,
): Promise<{ moved: Record<string, SyncedNote>; failures: SyncFailure[] }> {
  const moved: Record<string, SyncedNote> = {};
  const failures: SyncFailure[] = [];

  if (!oldFolder || normalizePath(oldFolder) === normalizePath(newFolder)) {
    return { moved, failures };
  }

  const prefix = `${normalizePath(oldFolder)}/`;
  const relocatable = Object.entries(notes).filter(([, note]) => note.path.startsWith(prefix));
  if (relocatable.length === 0) return { moved, failures };

  await ensureFolder(newFolder, vault);

  for (const [id, note] of relocatable) {
    try {
      const file = vault.getFileByPath(note.path);
      if (!file) continue; // Already gone; nothing to move and nothing to fix.

      const basename = note.path.slice(prefix.length);
      let target = normalizePath(`${newFolder}/${basename}`);
      if (vault.getAbstractFileByPath(target)) {
        // Something already occupies the name. Keep both rather than clobbering.
        const stem = basename.replace(/\.md$/, "");
        let counter = 1;
        while (vault.getAbstractFileByPath(normalizePath(`${newFolder}/${stem} (${counter}).md`))) {
          counter++;
        }
        target = normalizePath(`${newFolder}/${stem} (${counter}).md`);
      }

      await vault.rename(file, target);
      moved[id] = { ...note, path: target };
    } catch (error: unknown) {
      failures.push({
        id,
        title: note.path,
        message: (error as { message?: string })?.message ?? "Unknown error",
      });
    }
  }

  return { moved, failures };
}
