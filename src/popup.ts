/**
 * TekaSend Popup Controller
 *
 * Manages:
 * - Detection category toggles (PRD F1 / F5)
 * - Default repair strategy segmented control (PRD F2)
 * - Three-way theme selection: Auto / Light / Dark
 * - On-device AI model status display
 * - Scan trigger with live results breakdown card
 */

import { RepairStrategyType } from './ai/types.js';
import { ModelStatusResponse } from './shared/types/messages.js';

// ── Local Types ────────────────────────────────────────────────

type ThemeMode = 'auto' | 'light' | 'dark';

interface PopupSettings {
  readonly enableApiKey:     boolean;
  readonly enablePassword:   boolean;
  readonly enablePersonal:   boolean;
  readonly enableFinancial:  boolean;
  readonly defaultStrategy:  RepairStrategyType;
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

  // Scan action
  private readonly scanPageBtn   = document.querySelector<HTMLButtonElement>('#scanPageBtn')!;
  private readonly statusFeedback= document.querySelector<HTMLElement>('#statusFeedback')!;

  // AI status pill
  private readonly aiStatusPill = document.querySelector<HTMLElement>('#aiStatusPill')!;
  private readonly aiStatusText = document.querySelector<HTMLElement>('#aiStatusText')!;

  // Theme buttons
  private readonly themeBtns = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

  // Repair strategy segments
  private readonly segmentBtns = document.querySelectorAll<HTMLButtonElement>('.seg');

  // Results card elements
  private readonly resultsEmpty   = document.querySelector<HTMLElement>('#resultsEmpty')!;
  private readonly resultsSummary = document.querySelector<HTMLElement>('#resultsSummary')!;
  private readonly resultsCount   = document.querySelector<HTMLElement>('#resultsCount')!;
  private readonly resultsCountLabel = document.querySelector<HTMLElement>('#resultsCountLabel')!;
  private readonly resultsBadge   = document.querySelector<HTMLElement>('#resultsBadge')!;
  private readonly resultsBreakdown = document.querySelector<HTMLElement>('#resultsBreakdown')!;

  // Internal state
  private currentStrategy: RepairStrategyType = 'semantic_placeholder';
  private currentTheme: ThemeMode = 'auto';

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
    // Category toggle switches
    for (const toggle of [this.catApiKey, this.catPassword, this.catPersonal, this.catFinancial]) {
      toggle.addEventListener('change', () => void this.saveSettings());
    }

    // Repair strategy segmented buttons
    this.segmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const strategy = btn.getAttribute('data-strategy') as RepairStrategyType;
        if (strategy) {
          this.setStrategy(strategy);
          void this.saveSettings();
        }
      });
    });

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
  }

  // ── Settings Persistence ──────────────────────────────────────

  /** Loads user preferences from chrome.storage.local and applies them. */
  private async loadSettings(): Promise<void> {
    const data = await chrome.storage.local.get([
      'enableApiKey', 'enablePassword', 'enablePersonal', 'enableFinancial',
      'defaultStrategy', 'themeMode'
    ]);

    this.catApiKey.checked    = data.enableApiKey    !== false;
    this.catPassword.checked  = data.enablePassword  !== false;
    this.catPersonal.checked  = data.enablePersonal  !== false;
    this.catFinancial.checked = data.enableFinancial !== false;

    if (data.defaultStrategy) {
      this.setStrategy(data.defaultStrategy as RepairStrategyType);
    }

    const savedTheme = data.themeMode as ThemeMode | undefined;
    this.applyTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto');
  }

  /** Persists current settings to chrome.storage.local. */
  private async saveSettings(): Promise<void> {
    const settings: PopupSettings = {
      enableApiKey:    this.catApiKey.checked,
      enablePassword:  this.catPassword.checked,
      enablePersonal:  this.catPersonal.checked,
      enableFinancial: this.catFinancial.checked,
      defaultStrategy: this.currentStrategy,
      themeMode:       this.currentTheme,
    };
    await chrome.storage.local.set(settings);
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

  // ── Repair Strategy ───────────────────────────────────────────

  /** Updates the segmented control to reflect the active strategy. */
  private setStrategy(strategy: RepairStrategyType): void {
    this.currentStrategy = strategy;
    this.segmentBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-strategy') === strategy;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  // ── AI Model Status ───────────────────────────────────────────

  /** Queries the background worker for on-device model status and updates the pill UI. */
  private async checkModelStatus(): Promise<void> {
    try {
      const response = (await chrome.runtime.sendMessage({
        kind: 'MODEL_STATUS_REQUEST'
      })) as ModelStatusResponse;

      if (!response?.ok || !response.status) return;

      const { state, progress } = response.status;

      if (state === 'ready') {
        this.setStatusPill('ready', 'Shield-82M · On-Device');
      } else if (state === 'downloading') {
        this.setStatusPill('loading', `Loading model… ${progress ?? 0}%`);
      } else {
        this.setStatusPill('ready', 'Shield-82M Local');
      }
    } catch {
      // Background not yet loaded — show a neutral ready state
      this.setStatusPill('ready', 'Shield-82M · On-Device');
    }
  }

  /**
   * Updates the status pill appearance.
   * @param state - Visual state: ready | loading | error
   * @param label - Text to display in the pill
   */
  private setStatusPill(state: 'ready' | 'loading' | 'error', label: string): void {
    this.aiStatusText.textContent = label;
    this.aiStatusPill.classList.remove('warning', 'error');
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

    this.showFeedback('Scanning with on-device AI…', 'normal');
    this.scanPageBtn.disabled = true;

    try {
      const result = await chrome.tabs.sendMessage(activeTab.id, { kind: 'SCAN_AI' });

      if (result?.ok) {
        // Populate results card with findings breakdown
        const breakdown = result.breakdown as FindingBreakdown | undefined;
        this.renderResultsCard(breakdown ?? { apiKey: 0, password: 0, personal: 0, financial: 0, total: 0 });
        this.persistLastScanResults(breakdown ?? { apiKey: 0, password: 0, personal: 0, financial: 0, total: 0 });
        this.showFeedback('Scan complete — see highlights on page.', 'success');
      } else {
        this.showFeedback(result?.error ?? 'Scan complete.', 'normal');
      }
    } catch {
      this.showFeedback('Reload the page and try again.', 'error');
    } finally {
      this.scanPageBtn.disabled = false;
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
