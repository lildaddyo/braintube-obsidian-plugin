# BrainTube Sync — Obsidian Plugin

Sync your Obsidian vault to [BrainTube](https://brain-tube.com) for semantic search across all your knowledge.

---

## What It Does

BrainTube Sync pushes your Obsidian notes to BrainTube, a personal knowledge engine that uses semantic (AI-powered) search to surface relevant information across everything you've ever written — notes, videos, transcripts, and more.

Once synced, you can ask BrainTube natural-language questions and it will search across your entire vault by meaning, not just keywords.

**Key capabilities:**
- Sync all Markdown notes from your vault in one click
- Incremental updates — only changed notes are re-indexed
- Auto-sync on save (debounced 30 s) so your knowledge base stays current
- Exclude folders you don't want indexed (e.g. templates, private notes)
- Configurable batch size for slow connections or large vaults

---

## Requirements

- An [Obsidian](https://obsidian.md) vault (desktop or mobile)
- A [BrainTube](https://brain-tube.com) account
- A BrainTube API key (starts with `bt_`) — see below

---

## Installation

> The plugin is not yet listed in the Obsidian Community Plugins directory. Install manually using the steps below.

### Manual installation

1. Download the latest release from the [Releases page](https://github.com/lildaddyo/braintube-obsidian-plugin/releases):
   - `main.js`
   - `manifest.json`

2. In your vault, create the folder:
   ```
   .obsidian/plugins/braintube-sync/
   ```

3. Move the downloaded files into that folder.

4. Open Obsidian → **Settings → Community plugins**.

5. If "Restricted mode" is on, click **Turn on community plugins**.

6. Find **BrainTube Sync** in the installed plugins list and enable it.

7. Open the plugin settings and enter your BrainTube API key.

---

## How to Get Your API Key

Your API key is generated through the BrainTube MCP server.

1. Open Claude Desktop (or any MCP-compatible client) with the BrainTube MCP server connected.
2. Run the tool:
   ```
   generate_api_key
   ```
3. Copy the returned key (format: `bt_...`).
4. Paste it into **Settings → BrainTube Sync → API Key** in Obsidian.

Your key is stored locally in your vault's `data.json` and is never shared.

---

## Usage

### Sync Now

- Click the **↻** icon in the left ribbon, or
- Open **Settings → BrainTube Sync** and click **Sync Vault**, or
- Use the command palette: `BrainTube: Sync vault`

A notification will appear when the sync completes, showing how many notes were inserted, updated, or skipped.

### Auto-Sync on Save

Enable **Auto-Sync on Save** in settings to automatically push changes 30 seconds after any file is modified. The delay is debounced — rapid edits won't trigger multiple syncs.

### Dry Run

Use the command palette: `BrainTube: Sync vault (dry run)` to see how many notes would be synced without actually sending anything.

### Exclude Folders

Enter a comma-separated list of folder names to skip (e.g. `Templates,Archive,Private`). Notes inside those folders will not be sent to BrainTube.

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| **API Key** | *(required)* | Your `bt_...` key from BrainTube MCP |
| **Exclude Folders** | *(empty)* | Comma-separated folders to skip |
| **Batch Size** | `20` | Notes per request (1–100). Lower for slow connections |
| **Auto-Sync on Save** | Off | Sync automatically after file edits (30 s debounce) |
| **API URL** *(advanced)* | BrainTube production URL | Only change if self-hosting |

---

## Links

- [BrainTube](https://brain-tube.com) — the semantic search engine for your knowledge
- [Plugin releases](https://github.com/lildaddyo/braintube-obsidian-plugin/releases)

---

## License

MIT
