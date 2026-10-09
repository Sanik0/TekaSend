/** Shared visual language for the input controls and the settings popup. */
export function installInputTheme(shadow: ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --ts-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      --ts-card: #ffffff;
      --ts-card-solid: #ffffff;
      --ts-subtle: #f2f2f7;
      --ts-control: rgba(120, 120, 128, 0.12);
      --ts-control-hover: rgba(120, 120, 128, 0.18);
      --ts-text: #1c1c1e;
      --ts-secondary: #6c6c70;
      --ts-tertiary: #aeaeb2;
      --ts-border: rgba(60, 60, 67, 0.10);
      --ts-border-mid: rgba(60, 60, 67, 0.16);
      --ts-blue: #007aff;
      --ts-blue-hover: #0a84ff;
      --ts-blue-subtle: rgba(0, 122, 255, 0.08);
      --ts-blue-border: rgba(0, 122, 255, 0.20);
      --ts-green: #34c759;
      --ts-green-bg: rgba(52, 199, 89, 0.12);
      --ts-green-bd: rgba(52, 199, 89, 0.24);
      --ts-green-text: #1a7a2b;
      --ts-orange: #ff9500;
      --ts-orange-bg: rgba(255, 149, 0, 0.12);
      --ts-orange-bd: rgba(255, 149, 0, 0.24);
      --ts-orange-text: #c93400;
      --ts-red: #ff3b30;
      --ts-red-bg: rgba(255, 59, 48, 0.12);
      --ts-red-bd: rgba(255, 59, 48, 0.24);
      --ts-red-text: #d70015;
      --ts-yellow: #ffcc00;
      --ts-yellow-bg: rgba(255, 204, 0, 0.16);
      --ts-yellow-bd: rgba(255, 204, 0, 0.28);
      --ts-yellow-text: #8a6d00;
      --ts-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04);
      --ts-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
      --ts-ease: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    @media (prefers-color-scheme: dark) {
      :host(:not([data-theme="light"])) {
        --ts-card: #2c2c2e;
        --ts-card-solid: #2c2c2e;
        --ts-subtle: #3a3a3c;
        --ts-control: rgba(118, 118, 128, 0.24);
        --ts-control-hover: rgba(118, 118, 128, 0.32);
        --ts-text: #f2f2f7;
        --ts-secondary: #98989d;
        --ts-tertiary: #636366;
        --ts-border: rgba(255, 255, 255, 0.10);
        --ts-border-mid: rgba(255, 255, 255, 0.16);
        --ts-blue: #0a84ff;
        --ts-blue-hover: #409cff;
        --ts-blue-subtle: rgba(10, 132, 255, 0.14);
        --ts-blue-border: rgba(10, 132, 255, 0.28);
        --ts-green: #30d158;
        --ts-green-bg: rgba(48, 209, 88, 0.14);
        --ts-green-bd: rgba(48, 209, 88, 0.28);
        --ts-green-text: #30d158;
        --ts-orange: #ff9f0a;
        --ts-orange-bg: rgba(255, 159, 10, 0.15);
        --ts-orange-bd: rgba(255, 159, 10, 0.30);
        --ts-orange-text: #ff9f0a;
        --ts-red: #ff453a;
        --ts-red-bg: rgba(255, 69, 58, 0.18);
        --ts-red-bd: rgba(255, 69, 58, 0.32);
        --ts-red-text: #ff453a;
        --ts-yellow: #ffd60a;
        --ts-yellow-bg: rgba(255, 214, 10, 0.18);
        --ts-yellow-bd: rgba(255, 214, 10, 0.32);
        --ts-yellow-text: #ffd60a;
        --ts-shadow: 0 12px 32px rgba(0, 0, 0, 0.40), 0 2px 8px rgba(0, 0, 0, 0.20);
        --ts-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.30);
      }
    }

    :host([data-theme="dark"]) {
      --ts-card: #2c2c2e;
      --ts-card-solid: #2c2c2e;
      --ts-subtle: #3a3a3c;
      --ts-control: rgba(118, 118, 128, 0.24);
      --ts-control-hover: rgba(118, 118, 128, 0.32);
      --ts-text: #f2f2f7;
      --ts-secondary: #98989d;
      --ts-tertiary: #636366;
      --ts-border: rgba(255, 255, 255, 0.10);
      --ts-border-mid: rgba(255, 255, 255, 0.16);
      --ts-blue: #0a84ff;
      --ts-blue-hover: #409cff;
      --ts-blue-subtle: rgba(10, 132, 255, 0.14);
      --ts-blue-border: rgba(10, 132, 255, 0.28);
      --ts-green: #30d158;
      --ts-green-bg: rgba(48, 209, 88, 0.14);
      --ts-green-bd: rgba(48, 209, 88, 0.28);
      --ts-green-text: #30d158;
      --ts-orange: #ff9f0a;
      --ts-orange-bg: rgba(255, 159, 10, 0.15);
      --ts-orange-bd: rgba(255, 159, 10, 0.30);
      --ts-orange-text: #ff9f0a;
      --ts-red: #ff453a;
      --ts-red-bg: rgba(255, 69, 58, 0.18);
      --ts-red-bd: rgba(255, 69, 58, 0.32);
      --ts-red-text: #ff453a;
      --ts-yellow: #ffd60a;
      --ts-yellow-bg: rgba(255, 214, 10, 0.18);
      --ts-yellow-bd: rgba(255, 214, 10, 0.32);
      --ts-yellow-text: #ffd60a;
      --ts-shadow: 0 12px 32px rgba(0, 0, 0, 0.40), 0 2px 8px rgba(0, 0, 0, 0.20);
      --ts-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.30);
    }

    .ts-infield-highlight {
      border: 0 !important;
      border-radius: 4px !important;
      box-shadow: none !important;
      mix-blend-mode: multiply !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      transition: background-color 0.15s ease, opacity 0.15s ease !important;
      }
    .ts-infield-highlight.ts-hl-critical {
      background: rgba(255, 59, 48, 0.18) !important;
      box-shadow: none !important;
    }
    .ts-infield-highlight.ts-hl-medium {
      background: rgba(255, 204, 0, 0.22) !important;
      box-shadow: none !important;
    }
    .ts-infield-highlight:hover { filter: brightness(0.92) !important; }

    @media (prefers-color-scheme: dark) {
      :host(:not([data-theme="light"])) .ts-infield-highlight {
        mix-blend-mode: screen !important;
      }
      :host(:not([data-theme="light"])) .ts-infield-highlight.ts-hl-critical {
        background: rgba(255, 69, 58, 0.32) !important;
        box-shadow: none !important;
      }
      :host(:not([data-theme="light"])) .ts-infield-highlight.ts-hl-medium {
        background: rgba(255, 214, 10, 0.28) !important;
        box-shadow: none !important;
      }
    }

    :host([data-theme="dark"]) .ts-infield-highlight {
      mix-blend-mode: screen !important;
    }
    :host([data-theme="dark"]) .ts-infield-highlight.ts-hl-critical {
      background: rgba(255, 69, 58, 0.32) !important;
      box-shadow: none !important;
    }
    :host([data-theme="dark"]) .ts-infield-highlight.ts-hl-medium {
      background: rgba(255, 214, 10, 0.28) !important;
      box-shadow: none !important;
    }

    .ts-infield-guardian-wrapper,
    .ts-data-awareness-card,
    .ts-word-micro-tooltip {
      font-family: var(--ts-font) !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .ts-infield-icon-btn.state-safe {
      background: var(--ts-green-bg) !important;
      color: var(--ts-green) !important;
      border: 1px solid var(--ts-green-bd) !important;
    }
    .ts-infield-icon-btn.state-warning {
      background: var(--ts-orange) !important;
      color: #ffffff !important;
    }
    .ts-infield-icon-btn.state-critical {
      background: var(--ts-red) !important;
      color: #ffffff !important;
    }

    .ts-data-awareness-card,
    .ts-word-micro-tooltip {
      background: var(--ts-card) !important;
      color: var(--ts-text) !important;
      border: 1px solid var(--ts-border) !important;
      box-shadow: var(--ts-shadow) !important;
    }

    .ts-card-header {
      border-bottom: 1px solid var(--ts-border) !important;
    }

    .ts-brand-logo,
    .ts-summary-title,
    .ts-status-title,
    .ts-clean-text strong {
      color: var(--ts-text) !important;
    }

    .ts-local-ai-tag {
      background: var(--ts-green-bg) !important;
      color: var(--ts-green-text) !important;
    }

    .ts-dismiss-btn,
    .ts-item-reason,
    .ts-clean-text span,
    .ts-guidance-desc,
    .ts-strat-row {
      color: var(--ts-secondary) !important;
    }

    .ts-dismiss-btn:hover {
      color: var(--ts-text) !important;
    }

    .ts-guidance-box {
      background: var(--ts-blue-subtle) !important;
      border: 1px solid var(--ts-blue-border) !important;
    }

    .ts-guidance-title {
      color: var(--ts-blue) !important;
    }

    .ts-strat-row b {
      color: var(--ts-text) !important;
    }

    .ts-strat-row code,
    .ts-code-preview,
    .ts-mode-tag {
      background: var(--ts-control) !important;
      color: var(--ts-text) !important;
      border: 1px solid var(--ts-border) !important;
    }

    .ts-notice-item,
    .ts-protected-item-card,
    .ts-clean-status-box {
      background: var(--ts-subtle) !important;
      border: 1px solid var(--ts-border) !important;
    }

    .ts-item-recommendation {
      background: var(--ts-green-bg) !important;
      border: 1px solid var(--ts-green-bd) !important;
      color: var(--ts-green-text) !important;
    }

    .ts-category-tag {
      color: var(--ts-text) !important;
    }

    .ts-category-tag.safe,
    .ts-protected-token {
      color: var(--ts-green-text) !important;
    }

    .ts-status-dot,
    .ts-clean-icon {
      background: var(--ts-green) !important;
    }

    .ts-chip.critical,
    .ts-severity-badge.critical,
    .ts-micro-badge.critical {
      background: var(--ts-red-bg) !important;
      color: var(--ts-red-text) !important;
    }

    .ts-chip.high,
    .ts-severity-badge.high,
    .ts-micro-badge.high {
      background: var(--ts-orange-bg) !important;
      color: var(--ts-orange-text) !important;
    }

    .ts-chip.medium,
    .ts-severity-badge.medium,
    .ts-micro-badge.medium {
      background: var(--ts-yellow-bg) !important;
      color: var(--ts-yellow-text) !important;
    }

    .ts-bulk-btn.primary,
    .ts-repair-btn.primary,
    .ts-switch-btn,
    .ts-micro-btn.primary {
      background: var(--ts-blue) !important;
      border-color: var(--ts-blue) !important;
      color: #ffffff !important;
    }

    .ts-bulk-btn.primary:hover,
    .ts-repair-btn.primary:hover,
    .ts-switch-btn:hover,
    .ts-micro-btn.primary:hover {
      background: var(--ts-blue-hover) !important;
      border-color: var(--ts-blue-hover) !important;
    }

    .ts-bulk-btn.secondary,
    .ts-repair-btn:not(.primary),
    .ts-micro-btn.secondary {
      background: var(--ts-card) !important;
      color: var(--ts-text) !important;
      border: 1px solid var(--ts-border-mid) !important;
    }

    .ts-bulk-btn.secondary:hover,
    .ts-repair-btn:not(.primary):hover,
    .ts-micro-btn.secondary:hover {
      background: var(--ts-control) !important;
      color: var(--ts-text) !important;
    }

    .ts-bulk-btn:active,
    .ts-repair-btn:active,
    .ts-switch-btn:active,
    .ts-micro-btn:active {
      transform: scale(0.97) !important;
    }

    @media (prefers-reduced-motion: reduce) {
      .ts-infield-icon-btn,
      .ts-bulk-btn,
      .ts-repair-btn,
      .ts-switch-btn,
      .ts-micro-btn {
        transition: none !important;
      }
    }
  `;
  shadow.append(style);
}
