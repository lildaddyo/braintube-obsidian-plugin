import { App, PluginSettingTab, Setting } from 'obsidian';
import type BrainTubePlugin from './main';

// ─── Settings interface ───────────────────────────────────────────────────────

export interface BrainTubeSettings {
  apiKey: string;
  apiUrl: string;
  batchSize: number;
  excludeFolders: string;
  autoSync: boolean;
  lastSyncTime: string;
  lastSyncStats: string;
}

export const DEFAULT_SETTINGS: BrainTubeSettings = {
  apiKey: '',
  apiUrl: 'https://braintube-mcp-production.up.railway.app',
  batchSize: 20,
  excludeFolders: '',
  autoSync: false,
  lastSyncTime: '',
  lastSyncStats: '',
};

// ─── Settings tab ─────────────────────────────────────────────────────────────

export class BrainTubeSettingTab extends PluginSettingTab {
  plugin: BrainTubePlugin;
  private statusEl: HTMLElement | null = null;
  private advancedVisible = false;
  private advancedContainer: HTMLElement | null = null;

  constructor(app: App, plugin: BrainTubePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'BrainTube Sync' });
    containerEl.createEl('p', {
      text: 'Sync your Obsidian vault to BrainTube for semantic search across all your knowledge.',
      cls: 'setting-item-description',
    });

    // ── API Key ────────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your BrainTube API key (starts with bt_). Generate one via the MCP server using the generate_api_key tool.')
      .addText(text => {
        text
          .setPlaceholder('bt_...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        // Obfuscate the input
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
      });

    // ── Exclude Folders ────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Exclude Folders')
      .setDesc('Comma-separated folder names to skip (e.g. "Templates,Archive,Private").')
      .addText(text =>
        text
          .setPlaceholder('Templates,Archive')
          .setValue(this.plugin.settings.excludeFolders)
          .onChange(async (value) => {
            this.plugin.settings.excludeFolders = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Batch Size ─────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Batch Size')
      .setDesc('Number of notes to send per request (1–100). Lower values are safer on slow connections.')
      .addSlider(slider =>
        slider
          .setLimits(1, 100, 1)
          .setValue(this.plugin.settings.batchSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.batchSize = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Auto-Sync ──────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Auto-Sync on Save')
      .setDesc('Automatically sync ~30 seconds after any file is modified. Debounced to avoid excessive requests.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoSync)
          .onChange(async (value) => {
            this.plugin.settings.autoSync = value;
            await this.plugin.saveSettings();
            // Re-register events so auto-sync activates/deactivates immediately
            this.plugin.refreshAutoSync();
          })
      );

    // ── Advanced (collapsed) ───────────────────────────────────────────────────
    const advancedHeader = containerEl.createEl('div', { cls: 'setting-item' });
    const advancedToggle = advancedHeader.createEl('button', {
      text: `▶ Advanced`,
      cls: 'braintube-advanced-toggle',
    });
    advancedToggle.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.9em;padding:4px 0;';

    const advancedContainer = containerEl.createDiv();
    advancedContainer.style.display = 'none';
    this.advancedContainer = advancedContainer;

    new Setting(advancedContainer)
      .setName('API URL')
      .setDesc('BrainTube server URL. Only change this if you are self-hosting.')
      .addText(text =>
        text
          .setPlaceholder('https://braintube-mcp-production.up.railway.app')
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value.trim().replace(/\/$/, '');
            await this.plugin.saveSettings();
          })
      );

    advancedToggle.addEventListener('click', () => {
      this.advancedVisible = !this.advancedVisible;
      advancedToggle.textContent = `${this.advancedVisible ? '▼' : '▶'} Advanced`;
      advancedContainer.style.display = this.advancedVisible ? '' : 'none';
    });

    // ── Divider ────────────────────────────────────────────────────────────────
    containerEl.createEl('hr');

    // ── Last Sync Info ─────────────────────────────────────────────────────────
    if (this.plugin.settings.lastSyncTime) {
      const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
      infoEl.style.marginBottom = '12px';
      infoEl.createEl('strong', { text: 'Last sync: ' });
      infoEl.createSpan({ text: this.plugin.settings.lastSyncTime });
      if (this.plugin.settings.lastSyncStats) {
        infoEl.createEl('br');
        infoEl.createSpan({ text: this.plugin.settings.lastSyncStats });
      }
    }

    // ── Manual Sync Button ────────────────────────────────────────────────────
    const syncSetting = new Setting(containerEl)
      .setName('Sync Now')
      .setDesc('Push all vault notes to BrainTube immediately.');

    const statusEl = containerEl.createEl('p', {
      text: 'Status: idle',
      cls: 'setting-item-description',
    });
    statusEl.style.marginTop = '4px';
    this.statusEl = statusEl;

    syncSetting.addButton(btn =>
      btn
        .setButtonText('Sync Vault')
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Syncing...');
          this.setStatus('Syncing...', 'var(--text-muted)');
          try {
            await this.plugin.sync();
            btn.setButtonText('Sync Vault');
          } catch {
            btn.setButtonText('Sync Vault');
          } finally {
            btn.setDisabled(false);
          }
        })
    );
  }

  /** Called by BrainTubePlugin to update status text in the settings panel. */
  setStatus(msg: string, color = 'var(--text-normal)'): void {
    if (this.statusEl) {
      this.statusEl.textContent = `Status: ${msg}`;
      this.statusEl.style.color = color;
    }
  }
}
