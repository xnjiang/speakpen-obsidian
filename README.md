# SpeakPen Sync

Sync your [SpeakPen](https://speakpen.app) voice summaries into your vault as Markdown notes.

## Features

- **Incremental Sync** — Asks SpeakPen only what changed since last time, so a routine sync
  costs one request no matter how many notes you have
- **Edits Flow Through** — Rename or re-transcribe a note in SpeakPen and the note in your
  vault is brought up to date, instead of drifting out of sync forever
- **Your Edits Win** — A note you have written in is never overwritten. The plugin notices
  and leaves it alone
- **Auto Sync** — Runs on a configurable interval; manual sync from the ribbon or command palette
- **Markdown Notes** — Each idea becomes a Markdown file with YAML frontmatter
- **Follows Your Folder** — Change the sync folder and existing notes move with it
- **Status Bar** — Shows last sync time at a glance

## Setup

1. In Obsidian, go to **Settings → Community plugins → Browse**, search for "SpeakPen Sync", and install it
2. Enable it, then go to **Settings → SpeakPen Sync**
3. Paste your API token. Generate one in the SpeakPen web app at
   [speakpen.app/app](https://speakpen.app/app), under **Settings → API Tokens**
4. Configure sync folder and interval as needed

Audio is intentionally not linked from the note: the API hands out presigned URLs that
expire within hours, so the link would be dead by the next day. Use `speakpen_id` to find
the recording back in SpeakPen.

## How syncing decides what to do

The plugin remembers where it put each note and what it wrote there.

- **New in SpeakPen** — written to your sync folder.
- **Changed in SpeakPen** — the note in your vault is updated in place.
- **Changed in SpeakPen, but you have edited it here** — left exactly as you have it. Your
  writing is not recoverable from anywhere else; the SpeakPen copy is. A notice tells you
  which notes were skipped so you can reconcile them yourself if you want to.
- **Deleted from your vault** — written again on its next change.

Notes synced by versions before 0.3.0 are remembered so they are never duplicated, but they
cannot be updated or moved: those versions recorded only an id, so the plugin does not know
where those notes went or whether you have since rewritten them.

## About your API token

The token is read-only — it can list and read your SpeakPen notes, and nothing else. It cannot
edit or delete them, share them, or change your account.

Like every Obsidian plugin setting, it is stored as plain text in
`<your vault>/.obsidian/plugins/speakpen-sync/data.json`. That file is part of your vault, so it
travels with it when you sync to cloud storage or commit the vault to a git repository. If you
keep your vault in git and would rather leave plugin credentials out of it, add this to your
`.gitignore`:

    .obsidian/plugins/*/data.json

You can revoke a token whenever you like — in the SpeakPen app under **Settings → API Tokens**,
or on the web at [speakpen.app/app](https://speakpen.app/app). Revoking takes effect immediately;
generate a new one and paste it back in to resume syncing.

### Manual installation

Only needed if you are installing a build that is not in the store yet.

1. Download `main.js`, `manifest.json` (and `styles.css` if present) from the [latest release](https://github.com/xnjiang/speakpen-obsidian/releases).
2. Create a folder `<your vault>/.obsidian/plugins/speakpen-sync/` and copy those files into it.
3. Reload Obsidian and enable **SpeakPen Sync** under **Settings → Community plugins**.

## Note Format

Each synced idea is saved as a Markdown file in your configured folder (default: `SpeakPen/`):

    ---
    speakpen_id: "123"
    title: "Meeting Notes"
    category: "Meeting"
    created_at: 2026-03-28T10:00:00Z
    synced_at: 2026-03-28T10:05:00Z
    ---

    ## Summary

    (AI-generated summary)

    ## Transcript

    (Full transcript)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| API Token | — | Your SpeakPen API token |
| Sync Folder | `SpeakPen` | Vault folder for synced notes |
| Auto Sync | On | Enable automatic sync |
| Sync Interval | 5 min | How often to check for new ideas |

## Commands

- **SpeakPen: Sync now** — Manually trigger a sync

## Development

```bash
git clone https://github.com/xnjiang/speakpen-obsidian.git
cd speakpen-obsidian
npm install
npm run dev    # development build
npm run build  # production build
npm test       # run tests
```

## License

MIT
