/**
 * TekaSend Popup Controller
 *
 * Manages:
 * - Masking effect selection (Blur, Replace values, Placeholder, Spoiler)
 * - Auto-masking (Hide by default)
 * - Detection category toggles (API Keys, Passwords, Personal Info, Payment & IDs)
 * - Three-way theme selection (Auto / Light / Dark)
 * - Hover tooltip preferences
 */

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

  // Theme buttons
  private readonly themeBtns = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

  // Internal state
  private currentTheme: ThemeMode = 'light';
  private currentEffect: Effect = DEFAULT_EFFECT;

  public constructor() {
    void this.init();
  }

  /** Bootstraps the controller: wires events and loads settings. */
  private async init(): Promise<void> {
    this.attachEventListeners();
    await this.loadSettings();
  }

  // ── Event Wiring ─────────────────────────────────────────────

  private attachEventListeners(): void {
    document.querySelector<HTMLButtonElement>('#closePopup')!.addEventListener('click', () => window.close());

    // Category toggle switches
    for (const toggle of [this.catApiKey, this.catPassword, this.catPersonal, this.catFinancial]) {
      toggle.addEventListener('change', () => void this.saveSettings());
    }

    // Masking effect selection
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
  }

  // ── Settings Persistence ──────────────────────────────────────

  /** Loads user preferences from chrome.storage.local and applies them. */
  private async loadSettings(): Promise<void> {
    const data = await chrome.storage.local.get([
      'enableApiKey', 'enablePassword', 'enablePersonal', 'enableFinancial',
      'defaultEffect', 'hideByDefault', 'showHoverTooltip', 'themeMode'
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
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
