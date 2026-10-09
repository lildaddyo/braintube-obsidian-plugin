import { App, requestUrl, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import type { BrainTubeSettings } from './settings';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface NotePayload {
  path: string;
  title: string;
  content: string;
  tags: string[];
  modified_at: string;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration: number; // ms
}

// ─── Tag extraction ─────────────────────────────────────────────────────────

function parseTags(cache: CachedMetadata | null): string[] {
  const tags = new Set<string>();

  // Frontmatter tags: can be array or comma-separated string
  const fmTags = cache?.frontmatter?.tags ?? cache?.frontmatter?.tag;
  if (Array.isArray(fmTags)) {
    fmTags.forEach((t: unknown) => {
      const s = String(t).replace(/^#/, '').trim();
      if (s) tags.add(s);
    });
  } else if (typeof fmTags === 'string') {
    fmTags
      .split(/[,\s]+/)
      .map(t => t.replace(/^#/, '').trim())
      .filter(Boolean)
      .forEach(t => tags.add(t));
  }

  // Inline #tags from body
  cache?.tags?.forEach(tc => {
    const s = tc.tag.replace(/^#/, '').trim();
    if (s) tags.add(s);
  });

  return Array.from(tags);
}

// ─── File filter ────────────────────────────────────────────────────────────

// Normalise a folder entry or vault path: forward slashes, no leading or
// trailing slashes, lower-case. So "Private/", "/Private" and "private" all
// match a folder named "Private".
function normaliseFolderPath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function isExcluded(filePath: string, excludeFolders: string): boolean {
  if (!excludeFolders.trim()) return false;
  const path = normaliseFolderPath(filePath);
  // Folder segments of the file (everything except the file name).
  const segments = path.split('/').slice(0, -1);
  return excludeFolders
    .split(',')
    .map(normaliseFolderPath)
    .filter(Boolean)
    .some(folder => {
      // A folder path ("Journal/Private") matches as a prefix from the vault root.
      if (path === folder || path.startsWith(folder + '/')) return true;
      // A bare folder name ("Private") matches that folder at any depth.
      return !folder.includes('/') && segments.includes(folder);
    });
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function postBatch(
  apiUrl: string,
  apiKey: string,
  notes: NotePayload[]
): Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }> {
  const response = await requestUrl({
    url: `${apiUrl}/api/obsidian-sync`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
    throw: false,
  });

  if (response.status === 401) {
    throw new Error('Invalid API key — check plugin settings');
  }
  if (response.status === 429) {
    throw new Error('Rate limited — try reducing batch size or waiting a moment');
  }
  if (response.status >= 500) {
    throw new Error(`Server error (${response.status}) — try again later`);
  }
  if (response.status >= 400) {
    throw new Error(`Request failed (${response.status}): ${response.text}`);
  }

  return response.json as { inserted: number; updated: number; skipped: number; errors: string[] };
}

// ─── Main sync function ─────────────────────────────────────────────────────

export async function syncVault(
  app: App,
  settings: BrainTubeSettings,
  onProgress: (msg: string) => void
): Promise<SyncResult> {
  const start = Date.now();

  if (!settings.apiKey) {
    throw new Error('No API key set — add your bt_... key in plugin settings');
  }

  // ── Collect all markdown files ──────────────────────────────────────────────
  const allFiles: TFile[] = app.vault.getMarkdownFiles();
  const files = allFiles.filter(f => !isExcluded(f.path, settings.excludeFolders));

  onProgress(`Reading ${files.length} notes...`);

  // ── Build payloads ──────────────────────────────────────────────────────────
  const payloads: NotePayload[] = [];
  for (const file of files) {
    const content = await app.vault.read(file);
    const cache = app.metadataCache.getFileCache(file);
    const tags = parseTags(cache);

    payloads.push({
      path: file.path,
      title: file.basename,
      content,
      tags,
      modified_at: new Date(file.stat.mtime).toISOString(),
    });
  }

  // ── Split into batches ──────────────────────────────────────────────────────
  const batchSize = Math.max(1, settings.batchSize);
  const batches: NotePayload[][] = [];
  for (let i = 0; i < payloads.length; i += batchSize) {
    batches.push(payloads.slice(i, i + batchSize));
  }

  const totals = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };

  // ── Send each batch ─────────────────────────────────────────────────────────
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onProgress(`Batch ${i + 1}/${batches.length}...`);

    const result = await postBatch(settings.apiUrl, settings.apiKey, batch);
    totals.inserted += result.inserted;
    totals.updated  += result.updated;
    totals.skipped  += result.skipped;
    totals.errors.push(...result.errors);

    onProgress(
      `Batch ${i + 1}/${batches.length} complete: ${result.inserted} inserted, ${result.updated} updated`
    );
  }

  return {
    ...totals,
    duration: Date.now() - start,
  };
}

// ─── Dry-run helper ─────────────────────────────────────────────────────────

export function countVaultNotes(
  app: App,
  excludeFolders: string
): { total: number; excluded: number } {
  const allFiles = app.vault.getMarkdownFiles();
  const excluded = allFiles.filter(f => isExcluded(f.path, excludeFolders));
  return {
    total: allFiles.length - excluded.length,
    excluded: excluded.length,
  };
}
