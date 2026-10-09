/**
 * TekaSend Popup Controller
 *
 * Manages:
 * - Detection category toggles (PRD F1 / F5)
 * - Three-way theme selection: Auto / Light / Dark
 * - On-device AI model status display
 * - Scan trigger with live results breakdown card
 */

import { ModelStatusResponse } from './shared/types/messages.js';
import { DEFAULT_EFFECT, isEffect, type Effect } from './shared/effects.js';

// ── Local Types ────────────────────────────────────────────────

type ThemeMode = 'auto' | 'light' | 'dark';

interface PopupSettings {
  readonly enableApiKey:     boolean;
  readonly enablePassword:   boolean;
  readonly enablePersonal:   boolean;
  readonly enableFinancial:  boolean;
  readonly defaultEffect:    Effect;
  readonly hideByDefault:   boolean;
  readonly showHoverTooltip: boolean;
  readonly themeMode:        ThemeMode;
}

interface FindingBreakdown {
  readonly apiKey:    number;
  readonly password:  number;
  readonly personal:  number;
  readonly financial: number;
  readonly total:     number;
}

// ── Category metadata for results card rendering ───────────────
const CATEGORIES = [
  { key: 'apiKey',   icon: '🔑', label: 'API Keys & Tokens'     },
  { key: 'password', icon: '🔒', label: 'Passwords & Secrets'   },
  { key: 'personal', icon: '👤', label: 'Personal Information'  },
  { key: 'financial',icon: '💳', label: 'Payment & IDs'         },
] as const;

// ── Popup Controller ───────────────────────────────────────────

class PopupController {
  // Detection toggles
  private readonly catApiKey   = document.querySelector<HTMLInputElement>('#cat_api_key')!;
  private readonly catPassword = document.querySelector<HTMLInputElement>('#cat_password')!;
  private readonly catPersonal = document.querySelector<HTMLInputElement>('#cat_personal')!;
  private readonly catFinancial= document.querySelector<HTMLInputElement>('#cat_financial')!;
  private readonly effectRadios = document.querySelectorAll<HTMLInputElement>('input[name="defaultEffect"]');
  private readonly hideByDefault = document.querySelector<HTMLInputElement>('#hideByDefault')!;
  private readonly showHoverTooltip = document.querySelector<HTMLInputElement>('#showHoverTooltip')!;

  // Scan action
  private readonly scanPageBtn   = document.querySelector<HTMLButtonElement>('#scanPageBtn')!;
  private readonly statusFeedback= document.querySelector<HTMLElement>('#statusFeedback')!;

  // AI status pill
  private readonly aiStatusPill = document.querySelector<HTMLElement>('#aiStatusPill')!;
  private readonly aiStatusText = document.querySelector<HTMLElement>('#aiStatusText')!;

  // Optional cloud fallback
  private readonly cloudEnabled = document.querySelector<HTMLInputElement>('#cloudEnabled')!;
  private readonly cloudApiKey = document.querySelector<HTMLInputElement>('#cloudApiKey')!;
  private readonly cloudState = document.querySelector<HTMLElement>('#cloudState')!;
  private readonly cloudFeedback = document.querySelector<HTMLElement>('#cloudFeedback')!;

  // Theme buttons
  private readonly themeBtns = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

  // Results card elements
  private readonly resultsEmpty   = document.querySelector<HTMLElement>('#resultsEmpty')!;
  private readonly resultsSummary = document.querySelector<HTMLElement>('#resultsSummary')!;
  private readonly resultsCount   = document.querySelector<HTMLElement>('#resultsCount')!;
  private readonly resultsCountLabel = document.querySelector<HTMLElement>('#resultsCountLabel')!;
  private readonly resultsBadge   = document.querySelector<HTMLElement>('#resultsBadge')!;
  private readonly resultsBreakdown = document.querySelector<HTMLElement>('#resultsBreakdown')!;

  // Internal state
  private currentTheme: ThemeMode = 'light';
  private currentEffect: Effect = DEFAULT_EFFECT;
  private modelStatusRequestId = 0;

  public constructor() {
    void this.init();
  }

  /** Bootstraps the controller: wires events, loads settings, checks AI status. */
  private async init(): Promise<void> {
    this.attachEventListeners();
    await this.loadSettings();
    await this.checkModelStatus();
    this.loadLastScanResults();
  }

  // ── Event Wiring ─────────────────────────────────────────────

  private attachEventListeners(): void {
    document.querySelector<HTMLButtonElement>('#closePopup')!.addEventListener('click', () => window.close());

    // Category toggle switches
    for (const toggle of [this.catApiKey, this.catPassword, this.catPersonal, this.catFinancial]) {
      toggle.addEventListener('change', () => void this.saveSettings());
    }
    this.effectRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked && isEffect(radio.value)) {
          this.currentEffect = radio.value;
          void this.saveSettings();
        }
      });
    });
    this.hideByDefault.addEventListener('change', () => void this.saveSettings());
    this.showHoverTooltip.addEventListener('change', () => void this.saveSettings());

    // Three-way theme buttons
    this.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-theme-value') as ThemeMode;
        if (value) {
          this.applyTheme(value);
          void this.saveSettings();
        }
      });
    });

    // Scan action
    this.scanPageBtn.addEventListener('click', () => void this.handleScanPage());

    this.cloudEnabled.addEventListener('change', () => {
      this.showCloudFeedback('Save to apply this setting.', 'normal');
    });
    this.cloudApiKey.addEventListener('input', () => {
      this.showCloudFeedback('Save to apply this key.', 'normal');
    });
    document.querySelector<HTMLButtonElement>('#saveCloud')!.addEventListener('click', () => void this.saveCloudSettings());
    document.querySelector<HTMLButtonElement>('#clearCloud')!.addEventListener('click', () => void this.clearCloudSettings());
  }

  // ── Settings Persistence ──────────────────────────────────────

  /** Loads user preferences from chrome.storage.local and applies them. */
  private async loadSettings(): Promise<void> {
    const data = await chrome.storage.local.get([
      'enableApiKey', 'enablePassword', 'enablePersonal', 'enableFinancial',
      'defaultEffect', 'hideByDefault', 'showHoverTooltip', 'themeMode', 'cloudEnabled', 'apiKey'
    ]);

    this.catApiKey.checked    = data.enableApiKey    !== false;
    this.catPassword.checked  = data.enablePassword  !== false;
    this.catPersonal.checked  = data.enablePersonal  !== false;
    this.catFinancial.checked = data.enableFinancial !== false;

    this.currentEffect = isEffect(data.defaultEffect) ? data.defaultEffect : DEFAULT_EFFECT;
    this.effectRadios.forEach(radio => { radio.checked = radio.value === this.currentEffect; });
    this.hideByDefault.checked = data.hideByDefault === true;
    this.showHoverTooltip.checked = data.showHoverTooltip !== false;

    const savedTheme = data.themeMode as ThemeMode | undefined;
    this.applyTheme(savedTheme === 'auto' || savedTheme === 'dark' ? savedTheme : 'light');

    // Legacy aiEnabled is deliberately ignored. Cloud use requires explicit opt-in.
    this.cloudEnabled.checked = data.cloudEnabled === true;
    this.cloudApiKey.value = typeof data.apiKey === 'string' ? data.apiKey : '';
    this.updateCloudState(this.cloudEnabled.checked);
  }

  /** Persists current settings to chrome.storage.local. */
  private async saveSettings(): Promise<void> {
    const settings: PopupSettings = {
      enableApiKey:    this.catApiKey.checked,
      enablePassword:  this.catPassword.checked,
      enablePersonal:  this.catPersonal.checked,
      enableFinancial: this.catFinancial.checked,
      defaultEffect:   this.currentEffect,
      hideByDefault:  this.hideByDefault.checked,
      showHoverTooltip: this.showHoverTooltip.checked,
      themeMode:       this.currentTheme,
    };
    await chrome.storage.local.set(settings);
  }

  private async saveCloudSettings(): Promise<void> {
    const apiKey = this.cloudApiKey.value.trim();
    if (this.cloudEnabled.checked && !apiKey) {
      this.showCloudFeedback('Enter an API key to enable OpenAI fallback.', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({ cloudEnabled: this.cloudEnabled.checked, apiKey });
      this.updateCloudState(this.cloudEnabled.checked);
      this.showCloudFeedback(this.cloudEnabled.checked ? 'OpenAI fallback enabled.' : 'OpenAI fallback is off.', 'success');
    } catch {
      this.showCloudFeedback('Could not save fallback settings.', 'error');
    }
  }

  private async clearCloudSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({ cloudEnabled: false });
      await chrome.storage.local.remove(['apiKey', 'aiEnabled']);
      this.cloudEnabled.checked = false;
      this.cloudApiKey.value = '';
      this.updateCloudState(false);
      this.showCloudFeedback('API key removed. OpenAI fallback is off.', 'success');
    } catch {
      this.showCloudFeedback('Could not remove the API key.', 'error');
    }
  }

  private updateCloudState(enabled: boolean): void {
    this.cloudState.textContent = enabled ? 'On' : 'Off';
    this.cloudState.classList.toggle('enabled', enabled);
  }

  private showCloudFeedback(message: string, type: 'success' | 'error' | 'normal'): void {
    this.cloudFeedback.textContent = message;
    this.cloudFeedback.className = `cloud-feedback ${type}`;
  }

  // ── Theme ─────────────────────────────────────────────────────

  /** Applies the chosen theme to <html> and updates the segmented control UI. */
  private applyTheme(theme: ThemeMode): void {
    this.currentTheme = theme;

    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }

    this.themeBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-theme-value') === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  // ── AI Model Status ───────────────────────────────────────────

  /** Queries the background worker for on-device model status and updates the pill UI. */
  private async checkModelStatus(): Promise<void> {
    const requestId = ++this.modelStatusRequestId;
    try {
      const response = (await chrome.runtime.sendMessage({
        kind: 'MODEL_STATUS_REQUEST'
      })) as ModelStatusResponse;

      if (requestId !== this.modelStatusRequestId) return;

      if (!response?.ok || !response.status) {
        this.setStatusPill('error', 'Model status unavailable');
        return;
      }

      const { state, progress, errorMessage } = response.status;
      switch (state) {
        case 'unloaded':
          this.setStatusPill('idle', 'Local model not loaded', 'Loads on the first scan.');
          break;
        case 'downloading': {
          const percent = typeof progress === 'number' && Number.isFinite(progress)
            ? ` ${Math.max(0, Math.min(100, Math.round(progress)))}%`
            : '';
          this.setStatusPill('loading', `Loading local model…${percent}`);
          break;
        }
        case 'ready':
          this.setStatusPill('ready', 'Local model ready');
          break;
        case 'error':
          this.setStatusPill('error', 'Local model unavailable', errorMessage);
          break;
        default:
          this.setStatusPill('error', 'Unknown model status');
      }
    } catch {
      if (requestId !== this.modelStatusRequestId) return;
      this.setStatusPill('error', 'Model status unavailable', 'Could not reach the extension background worker.');
    }
  }

  /**
   * Updates the status pill appearance.
   */
  private setStatusPill(state: 'idle' | 'ready' | 'loading' | 'error', label: string, detail?: string): void {
    this.aiStatusText.textContent = label;
    this.aiStatusPill.title = detail || label;
    this.aiStatusPill.classList.remove('idle', 'warning', 'error');
    if (state === 'idle') this.aiStatusPill.classList.add('idle');
    if (state === 'loading') this.aiStatusPill.classList.add('warning');
    if (state === 'error')   this.aiStatusPill.classList.add('error');
  }

  // ── Scan Action ───────────────────────────────────────────────

  /** Triggers a scan on the active tab and updates the results card. */
  private async handleScanPage(): Promise<void> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      this.showFeedback('No active webpage found.', 'error');
      return;
    }

    this.showFeedback('Scanning the page…', 'normal');
    this.scanPageBtn.disabled = true;
    const modelStatusTimer = window.setInterval(() => void this.checkModelStatus(), 1000);

    try {
      const result = await chrome.tabs.sendMessage(activeTab.id, { kind: 'SCAN_AI' });

      if (result?.ok) {
        // Populate results card with findings breakdown
        const breakdown = result.breakdown as FindingBreakdown | undefined;
        this.renderResultsCard(breakdown ?? { apiKey: 0, password: 0, personal: 0, financial: 0, total: 0 });
        this.persistLastScanResults(breakdown ?? { apiKey: 0, password: 0, personal: 0, financial: 0, total: 0 });
        const providerMessage = result.provider === 'cloud'
          ? 'Scan complete using OpenAI fallback.'
          : result.provider === 'local'
            ? 'Scan complete on device.'
            : 'Scan complete.';
        this.showFeedback(`${providerMessage} Check page highlights.`, 'success');
      } else {
        this.showFeedback(result?.error ?? 'Scan complete.', 'normal');
      }
    } catch {
      this.showFeedback('Cannot access this page. Check TekaSend site access and reload the page.', 'error');
    } finally {
      window.clearInterval(modelStatusTimer);
      this.scanPageBtn.disabled = false;
      await this.checkModelStatus();
    }
  }

  // ── Results Card ──────────────────────────────────────────────

  /** Renders the findings breakdown in the results card. */
  private renderResultsCard(breakdown: FindingBreakdown): void {
    const total = breakdown.total;

    this.resultsCount.textContent = String(total);
    this.resultsCountLabel.textContent = total === 1 ? 'finding' : 'findings';

    if (total === 0) {
      this.resultsBadge.textContent = 'Clean ✓';
      this.resultsBadge.classList.remove('has-findings');
    } else {
      this.resultsBadge.textContent = `${total} Risk${total > 1 ? 's' : ''}`;
      this.resultsBadge.classList.add('has-findings');
    }

    // Build per-category breakdown bars
    this.resultsBreakdown.innerHTML = '';

    const counts: Record<string, number> = {
      apiKey:    breakdown.apiKey,
      password:  breakdown.password,
      personal:  breakdown.personal,
      financial: breakdown.financial,
    };

    for (const cat of CATEGORIES) {
      const count = counts[cat.key] ?? 0;
      const pct   = total > 0 ? Math.round((count / total) * 100) : 0;

      const item = document.createElement('div');
      item.className = 'breakdown-item';
      item.innerHTML = `
        <div class="breakdown-label">
          <span class="breakdown-icon">${cat.icon}</span>
          <span>${cat.label}</span>
        </div>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar" style="width: ${pct}%"></div>
        </div>
        <span class="breakdown-count">${count}</span>
      `;
      this.resultsBreakdown.appendChild(item);
    }

    // Toggle visibility
    this.resultsEmpty.classList.add('hidden');
    this.resultsSummary.classList.remove('hidden');
  }

  /** Saves the last scan results to storage so they persist between popup opens. */
  private persistLastScanResults(breakdown: FindingBreakdown): void {
    void chrome.storage.local.set({ lastScanBreakdown: breakdown });
  }

  /** Loads and restores previous scan results from storage on popup open. */
  private loadLastScanResults(): void {
    void chrome.storage.local.get('lastScanBreakdown').then(data => {
      const bd = data.lastScanBreakdown as FindingBreakdown | undefined;
      if (bd) this.renderResultsCard(bd);
    });
  }

  // ── Feedback ──────────────────────────────────────────────────

  /** Shows a transient status message below the scan button. */
  private showFeedback(message: string, type: 'success' | 'error' | 'normal'): void {
    this.statusFeedback.textContent = message;
    this.statusFeedback.className = `feedback ${type}`;
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
