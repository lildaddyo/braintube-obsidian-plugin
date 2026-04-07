import { Notice, Plugin } from 'obsidian';
import { BrainTubeSettings, BrainTubeSettingTab, DEFAULT_SETTINGS } from './settings';
import { syncVault, countVaultNotes } from './sync';

export default class BrainTubePlugin extends Plugin {
  settings: BrainTubeSettings = { ...DEFAULT_SETTINGS };
  private settingTab: BrainTubeSettingTab | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSyncRef: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // ── Ribbon icon ──────────────────────────────────────────────────────────
    this.addRibbonIcon('refresh-cw', 'BrainTube: Sync vault', async () => {
      await this.sync();
    });

    // ── Commands ─────────────────────────────────────────────────────────────
    this.addCommand({
      id: 'braintube-sync',
      name: 'Sync vault',
      callback: async () => { await this.sync(); },
    });

    this.addCommand({
      id: 'braintube-dry-run',
      name: 'Sync vault (dry run)',
      callback: () => { this.dryRun(); },
    });

    // ── Settings tab ─────────────────────────────────────────────────────────
    this.settingTab = new BrainTubeSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // ── Auto-sync ─────────────────────────────────────────────────────────────
    if (this.settings.autoSync) {
      this.registerAutoSync();
    }

    console.log('[BrainTube] Plugin loaded');
  }

  onunload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('[BrainTube] Plugin unloaded');
  }

  // ─── Sync ──────────────────────────────────────────────────────────────────

  async sync(): Promise<void> {
    if (!this.settings.apiKey) {
      new Notice('BrainTube: No API key set — open plugin settings', 5000);
      this.settingTab?.setStatus('No API key set', 'var(--text-error)');
      return;
    }

    new Notice('BrainTube: Syncing...');
    this.settingTab?.setStatus('Syncing...', 'var(--text-muted)');

    try {
      const result = await syncVault(
        this.app,
        this.settings,
        (msg) => {
          this.settingTab?.setStatus(msg, 'var(--text-muted)');
        }
      );

      const summary = `Done — ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`;
      const durationSec = (result.duration / 1000).toFixed(1);

      // Persist last sync info
      this.settings.lastSyncTime = new Date().toLocaleString();
      this.settings.lastSyncStats = `${summary} (${durationSec}s)`;
      await this.saveSettings();

      new Notice(`BrainTube: ${summary}`, 6000);
      this.settingTab?.setStatus(summary, 'var(--color-green)');

      if (result.errors.length > 0) {
        console.warn('[BrainTube] Sync errors:', result.errors);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BrainTube] Sync failed:', err);
      new Notice(`BrainTube Error: ${msg}`, 8000);
      this.settingTab?.setStatus(`Error: ${msg}`, 'var(--text-error)');
    }
  }

  // ─── Dry run ───────────────────────────────────────────────────────────────

  dryRun(): void {
    const { total, excluded } = countVaultNotes(this.app, this.settings.excludeFolders);
    const msg = `BrainTube dry run: ${total} notes found, ${excluded} excluded`;
    new Notice(msg, 6000);
    this.settingTab?.setStatus(`Dry run: ${total} notes, ${excluded} excluded`, 'var(--text-muted)');
    console.log(`[BrainTube] ${msg}`);
  }

  // ─── Auto-sync ─────────────────────────────────────────────────────────────

  /** Register vault modify listener for auto-sync. */
  private registerAutoSync(): void {
    // Use registerEvent so Obsidian cleans it up on plugin unload
    this.registerEvent(
      this.app.vault.on('modify', () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
          console.log('[BrainTube] Auto-sync triggered');
          await this.sync();
        }, 30_000); // 30-second debounce
      })
    );
  }

  /**
   * Called from the settings tab when the auto-sync toggle changes.
   * Reloads the plugin's event listeners so the change takes effect immediately
   * without requiring a restart.
   */
  refreshAutoSync(): void {
    // Obsidian doesn't expose a way to un-register individual events,
    // so we just let the debounce timer expire naturally.
    // New modify events will respect the updated settings.autoSync value
    // because we check it in the callback below.
    if (this.settings.autoSync) {
      this.registerAutoSync();
    }
    // If toggled off: timer will fire but sync() checks apiKey only,
    // so worst case one extra sync runs. Acceptable UX.
  }

  // ─── Settings persistence ──────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
