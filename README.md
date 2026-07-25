# SpeakPen Sync

Sync your [SpeakPen](https://speakpen.app) voice summaries into your vault as Markdown notes.

## Features

- **Auto Sync** — Automatically pulls new ideas from SpeakPen on a configurable interval
- **Manual Sync** — Trigger sync from the ribbon icon or command palette
- **Markdown Notes** — Each idea becomes a Markdown file with YAML frontmatter
- **Smart Dedup** — Only syncs new ideas; never overwrites existing notes
- **Status Bar** — Shows last sync time at a glance

## Setup

1. In Obsidian, go to **Settings → Community plugins → Browse**, search for "SpeakPen Sync", and install it
2. Enable it, then go to **Settings → SpeakPen Sync**
3. Paste your API token. Generate one in the SpeakPen web app at
   [speakpen.app/app](https://speakpen.app/app), under **Settings → API Tokens**
4. Configure sync folder and interval as needed

Audio is intentionally not linked from the note: the API hands out presigned URLs that
expire within hours, and a note is written once and never rewritten, so the link would be
dead by the next day. Use `speakpen_id` to find the recording back in SpeakPen.

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
