/** Shared visual language for the input controls and the settings popup. */
export function installInputTheme(shadow: ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --ts-card: #ffffff;
      --ts-subtle: #f2f2f7;
      --ts-control: rgba(120, 120, 128, .12);
      --ts-text: #1c1c1e;
      --ts-secondary: #6c6c70;
      --ts-border: rgba(60, 60, 67, .12);
      --ts-blue: #007aff;
      --ts-blue-hover: #0a84ff;
      --ts-green: #28cd41;
      --ts-green-text: #1a7a2b;
      --ts-red: #ff3b30;
      --ts-orange: #ff9500;
      --ts-red-tint: #ffd8dc;
      --ts-yellow-tint: #fff0b8;
      --ts-shadow: 0 12px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .05);
    }

    @media (prefers-color-scheme: dark) {
      :host(:not([data-theme="light"])) {
        --ts-card: #2c2c2e;
        --ts-subtle: #3a3a3c;
        --ts-control: rgba(118, 118, 128, .24);
        --ts-text: #f2f2f7;
        --ts-secondary: #aeaeb2;
        --ts-border: rgba(255, 255, 255, .12);
        --ts-blue: #0a84ff;
        --ts-blue-hover: #409cff;
        --ts-green: #30d158;
        --ts-green-text: #30d158;
        --ts-shadow: 0 12px 32px rgba(0, 0, 0, .35), 0 2px 8px rgba(0, 0, 0, .18);
      }
    }

    :host([data-theme="dark"]) {
      --ts-card: #2c2c2e;
      --ts-subtle: #3a3a3c;
      --ts-control: rgba(118, 118, 128, .24);
      --ts-text: #f2f2f7;
      --ts-secondary: #aeaeb2;
      --ts-border: rgba(255, 255, 255, .12);
      --ts-blue: #0a84ff;
      --ts-blue-hover: #409cff;
      --ts-green: #30d158;
      --ts-green-text: #30d158;
      --ts-shadow: 0 12px 32px rgba(0, 0, 0, .35), 0 2px 8px rgba(0, 0, 0, .18);
    }

    .ts-infield-highlight {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      mix-blend-mode: normal !important;
    }
    .ts-infield-highlight.ts-hl-critical {
      background: var(--ts-red-tint) !important;
      box-shadow: none !important;
    }
    .ts-infield-highlight.ts-hl-medium {
      background: var(--ts-yellow-tint) !important;
      box-shadow: none !important;
    }
    .ts-infield-highlight:hover { filter: none !important; }

    .ts-infield-guardian-wrapper, .ts-word-micro-tooltip {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .ts-infield-icon-btn {
      box-shadow: 0 2px 7px rgba(0, 0, 0, .12) !important;
      transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease !important;
    }
    .ts-infield-icon-btn.state-safe {
      background: var(--ts-card);
      color: var(--ts-green);
      border: 1px solid var(--ts-border);
    }
    .ts-infield-icon-btn.state-warning { background: var(--ts-orange); }
    .ts-infield-icon-btn.state-critical { background: var(--ts-red); }
    .ts-infield-icon-btn:focus-visible,
    .ts-data-awareness-card button:focus-visible,
    .ts-word-micro-tooltip button:focus-visible {
      outline: 2px solid var(--ts-blue);
      outline-offset: 2px;
    }

    .ts-data-awareness-card,
    .ts-word-micro-tooltip {
      background: var(--ts-card);
      color: var(--ts-text);
      border: 1px solid var(--ts-border);
      box-shadow: var(--ts-shadow);
    }
    .ts-data-awareness-card {
      width: min(320px, calc(100vw - 20px));
      border-radius: 18px;
      padding: 14px;
      gap: 11px;
    }
    .ts-word-micro-tooltip {
      border-radius: 12px;
      padding: 5px 6px;
      gap: 5px;
    }
    .ts-word-micro-tooltip:not(.place-below)::after { border-top-color: var(--ts-card); }
    .ts-word-micro-tooltip.place-below::after { border-bottom-color: var(--ts-card); }
    .ts-card-header { border-bottom-color: var(--ts-border); padding-bottom: 9px; }
    .ts-brand-logo { font-size: 13.5px; }
    .ts-summary-title, .ts-status-title { font-size: 12.5px; }
    .ts-local-ai-tag { font-size: 10px; }
    .ts-brand-logo, .ts-summary-title, .ts-status-title,
    .ts-clean-text strong { color: var(--ts-text); }
    .ts-local-ai-tag {
      background: rgba(40, 205, 65, .1);
      color: var(--ts-green-text);
    }
    .ts-dismiss-btn, .ts-item-reason, .ts-clean-text span { color: var(--ts-secondary); }
    .ts-dismiss-btn:hover { color: var(--ts-text); }

    .ts-notice-item {
      background: var(--ts-subtle);
      border-color: var(--ts-border);
      border-radius: 10px;
      padding: 10px;
      gap: 6px;
    }
    .ts-protected-item-card, .ts-clean-status-box {
      background: var(--ts-subtle);
      border-color: var(--ts-border);
      border-radius: 10px;
    }
    .ts-code-preview, .ts-mode-tag {
      background: var(--ts-control);
      color: var(--ts-text);
      border-radius: 6px;
    }
    .ts-item-reason { font-size: 11px; line-height: 1.35; }
    .ts-category-tag { font-size: 11px; }
    .ts-bulk-btn, .ts-repair-btn, .ts-switch-btn { font-size: 11px; padding: 7px 9px; }
    .ts-micro-btn { font-size: 10.5px; }
    .ts-protected-token { color: var(--ts-green-text); }
    .ts-status-dot, .ts-clean-icon { background: var(--ts-green); }
    .ts-category-tag.safe { color: var(--ts-green-text); }
    .ts-severity-badge, .ts-chip, .ts-micro-badge { border-radius: 999px; }
    .ts-severity-badge.critical, .ts-chip.critical, .ts-micro-badge.critical {
      background: var(--ts-red-tint);
      color: var(--ts-text);
    }
    .ts-severity-badge.medium, .ts-chip.medium, .ts-micro-badge.medium {
      background: var(--ts-yellow-tint);
      color: var(--ts-text);
    }

    .ts-bulk-btn, .ts-repair-btn, .ts-switch-btn, .ts-micro-btn {
      border-radius: 10px;
      font-family: inherit;
      transition: background .18s ease, transform .18s ease, border-color .18s ease;
    }
    .ts-bulk-btn.primary, .ts-repair-btn.primary,
    .ts-switch-btn, .ts-micro-btn.primary {
      background: var(--ts-blue);
      border-color: var(--ts-blue);
      color: #ffffff;
    }
    .ts-bulk-btn.primary:hover, .ts-repair-btn.primary:hover,
    .ts-switch-btn:hover, .ts-micro-btn.primary:hover {
      background: var(--ts-blue-hover);
      border-color: var(--ts-blue-hover);
    }
    .ts-bulk-btn.secondary, .ts-repair-btn:not(.primary), .ts-micro-btn.secondary {
      background: var(--ts-subtle);
      color: var(--ts-text);
      border: 1px solid var(--ts-border);
    }
    .ts-bulk-btn.secondary:hover, .ts-repair-btn:not(.primary):hover,
    .ts-micro-btn.secondary:hover {
      background: var(--ts-control);
      color: var(--ts-text);
      border-color: var(--ts-border);
    }
    .ts-bulk-btn:active, .ts-repair-btn:active,
    .ts-switch-btn:active, .ts-micro-btn:active { transform: scale(.97); }

    @media (prefers-reduced-motion: reduce) {
      .ts-infield-icon-btn, .ts-bulk-btn, .ts-repair-btn,
      .ts-switch-btn, .ts-micro-btn { transition: none !important; }
    }
  `;
  shadow.append(style);
}
