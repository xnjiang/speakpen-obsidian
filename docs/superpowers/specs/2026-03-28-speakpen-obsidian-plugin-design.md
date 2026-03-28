# SpeakPen Obsidian Plugin - Design Spec

## Goal

Build an Obsidian plugin that syncs SpeakPen ideas (voice summaries) into the vault as Markdown files, so users can access their recordings directly in Obsidian.

## Architecture

- Obsidian community plugin (TypeScript, esbuild)
- Pulls data from SpeakPen REST API (`https://speakpen.app/api/v1`)
- Authenticated via user-provided API Token (Bearer)
- Local-first: tracks synced idea IDs in plugin data to avoid duplicates

## Core Behavior

### Sync Logic
- On sync: fetch all ideas via paginated `GET /ideas`, compare against locally tracked `apiId` set
- New ideas (not yet synced) get written as individual Markdown files in configurable folder (default: `SpeakPen/`)
- Already-synced ideas are skipped (no overwrite)
- Sync runs automatically on interval (default: 5 min) and manually via command/ribbon

### Markdown Output Format
```markdown
---
speakpen_id: "123"
title: "Meeting Notes"
category: "Meeting"
created_at: 2026-03-28T10:00:00Z
audio_url: "https://..."
synced_at: 2026-03-28T10:05:00Z
---

## Summary

(message content)

## Transcript

(transcript_text content)
```

- Filename: `{title} - {YYYY-MM-DD}.md` (sanitized, deduped with suffix if collision)
- Only ideas with status `completed` are synced

### Settings
- **API Token**: string, required
- **Sync Folder**: string, default `SpeakPen/`
- **Auto Sync Interval**: number in minutes, default 5, min 1
- **Auto Sync Enabled**: boolean, default true

### UI
- Ribbon icon: triggers manual sync
- Command palette: "SpeakPen: Sync now"
- Status bar: shows last sync time and count
- Settings tab: configure token, folder, interval
- Notice on sync completion: "SpeakPen: Synced N new ideas"

## API Details

### GET /api/v1/ideas
- Headers: `Authorization: Bearer {token}`, `Accept: application/json`
- Query: `page=N&per_page=50`
- Response: JSON API format with `data[]` array and `meta` pagination
- Each idea: `data[].attributes.{title, message, transcript_text, created_at, category, audio_url, status}`
- Idea ID: `data[].id` (string)
- Paginate until `meta.next_page` is null

### Error Handling
- 401: Show notice "Invalid API Token", stop sync
- 429: Retry after delay
- Network error: Show notice, retry on next interval

## Non-Goals
- No writing back to SpeakPen API
- No audio file download/playback
- No editing or deleting ideas from Obsidian
- No OAuth flow
