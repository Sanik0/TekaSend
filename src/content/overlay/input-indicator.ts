/**
 * TekaSend Content Subsystem — In-Field Privacy Indicator & Data Awareness Notice
 *
 * Renders an inline indicator icon at the trailing end inside AI chatbot text inputs and forms.
 * When confidential data or a security threat is detected, displays a compact, sleek iOS-style
 * notice card with one-click smart privacy repairs (Placeholder & Scramble).
 *
 * Multi-Item Scalability:
 * - Compact Summary Header with breakdown chips.
 * - Global One-Click Bulk Actions ("Replace All with Placeholders", "Scramble All", "Restore All").
 * - Max-Height Scrollable Feed (capped at 240px with ultra-slim iOS scrollbar) preventing screen overlap.
 * - Interactive Protection Manager for switching strategies and two-way undo/restore.
 *
 * Conforms to PRD F1 (Data Awareness Notice), PRD F2 (Smart Privacy Repair),
 * PRD F3 (Local Pre-Flight Verification), and gemini.md architecture standards.
 */

import {
  SensitiveFinding,
  RepairStrategyType,
  FindingCategory
} from '../../ai/types.js';
import { RiskAnalyzer } from '../../ai/reasoning/risk-analyzer.js';

export interface ProtectedItem {
  readonly id: string;
  readonly category: FindingCategory;
  readonly label: string;
  readonly originalRawText: string;
  readonly currentToken: string;
  readonly currentStrategy: RepairStrategyType;
  readonly entityIndex?: number;
}

export interface IndicatorActions {
  readonly onApplyRepair: (element: HTMLElement, finding: SensitiveFinding, strategy: RepairStrategyType) => void;
  readonly onApplyRepairAll: (element: HTMLElement, strategy: RepairStrategyType) => void;
  readonly onSwitchStrategy: (element: HTMLElement, item: ProtectedItem, newStrategy: RepairStrategyType) => void;
  readonly onSwitchAllStrategies?: (element: HTMLElement, newStrategy: RepairStrategyType) => void;
  readonly onRestoreOriginal: (element: HTMLElement, item: ProtectedItem) => void;
  readonly onRestoreAll?: (element: HTMLElement) => void;
}

export class InputIndicatorOverlay {
  private readonly shadow: ShadowRoot;
  private readonly riskAnalyzer = new RiskAnalyzer();

  // DOM Elements
  private readonly wrapper: HTMLElement;
  private readonly iconButton: HTMLButtonElement;
  private readonly noticeCard: HTMLElement;
  private readonly noticeReasonList: HTMLElement;

  private activeElement: HTMLElement | null = null;
  private targetElement: HTMLElement | null = null;
  private isCardVisible = false;
  private actions?: IndicatorActions;
  private resizeObserver: ResizeObserver | null = null;

  public constructor(shadowRoot: ShadowRoot, actions?: IndicatorActions) {
    this.shadow = shadowRoot;
    this.actions = actions;

    const elements = this.buildDomElements();
    this.wrapper = elements.wrapper;
    this.iconButton = elements.iconButton;
    this.noticeCard = elements.noticeCard;
    this.noticeReasonList = elements.noticeReasonList;

    this.shadow.append(this.wrapper);
    this.injectStyles();
    this.attachEventListeners();
    this.initResizeObserver();
  }

  /**
   * Updates indicator with current finding state, protected items, and repositions it inside the field.
   */
  public update(
    element: HTMLElement,
    findings: readonly SensitiveFinding[],
    bounds: DOMRect,
    protectedItems: readonly ProtectedItem[] = []
  ): void {
    if (this.activeElement !== element && this.resizeObserver) {
      if (this.activeElement) {
        this.resizeObserver.unobserve(this.activeElement);
      }
      this.resizeObserver.observe(element);
    }

    this.activeElement = element;
    this.targetElement = element;
    this.renderState(findings, protectedItems);
    this.positionInsideField(bounds);
    this.show();
  }

  /**
   * Hides the in-field indicator and popover notice.
   */
  public hide(): void {
    this.wrapper.classList.remove('ts-visible');
    this.hideNoticeCard();
    window.setTimeout(() => {
      if (!this.activeElement) {
        this.wrapper.style.display = 'none';
      }
    }, 220);
    if (this.activeElement && this.resizeObserver) {
      this.resizeObserver.unobserve(this.activeElement);
    }
    this.activeElement = null;
    this.targetElement = null;
  }

  public show(): void {
    this.wrapper.style.display = 'flex';
    requestAnimationFrame(() => {
      this.wrapper.classList.add('ts-visible');
    });
  }

  public getIsCardVisible(): boolean {
    return this.isCardVisible;
  }

  /**
   * Sets the action delegate for repair and strategy-switching requests.
   */
  public setActions(actions: IndicatorActions): void {
    this.actions = actions;
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.activeElement && this.activeElement.isConnected) {
            this.positionInsideField(this.activeElement.getBoundingClientRect());
          }
        }
      });
    }
  }

  /**
   * Positions the indicator icon at the inside-right edge of the text field.
   * For multiline / AI prompt boxes, dynamically places at the ending bottom and avoids collision with send/action buttons and widgets.
   */
  private positionInsideField(bounds: DOMRect): void {
    if (bounds.width === 0 || bounds.height === 0 || bounds.bottom < 0 || bounds.top > window.innerHeight) {
      this.hide();
      return;
    }

    const iconSize = 24;
    const isMultiline = bounds.height > 52;

    let verticalTop: number;
    let trailingRight = window.innerWidth - bounds.right + 10;

    if (!isMultiline) {
      // Single-line inputs: vertically centered
      verticalTop = bounds.top + Math.max(0, Math.round((bounds.height - iconSize) / 2));
    } else {
      // Multiline prompt boxes / textareas: place at the ending bottom
      verticalTop = bounds.bottom - iconSize - 10;

      // Smart collision detection: check for bottom-right action buttons (e.g. Send button, Voice button)
      if (this.activeElement) {
        const container = this.activeElement.closest('form, [class*="prompt"], [class*="input"], [class*="chat"], main, body') || this.activeElement.parentElement;
        if (container) {
          const buttons = Array.from(container.querySelectorAll<HTMLElement>('button, [role="button"], [class*="send"], [class*="button"], [data-testid*="send"], [aria-label*="Send"], [aria-label*="mic"], [aria-label*="Voice"], [aria-label*="Audio"]'));
          for (const btn of buttons) {
            if (btn.offsetParent === null) continue;
            const btnRect = btn.getBoundingClientRect();
            // Check if button is in the bottom-right corner of the input area
            if (
              btnRect.width > 0 &&
              btnRect.height > 0 &&
              btnRect.right <= bounds.right + 20 &&
              btnRect.left >= bounds.left + bounds.width * 0.4 &&
              btnRect.bottom <= bounds.bottom + 20 &&
              btnRect.top >= bounds.bottom - 60
            ) {
              const offsetFromRight = window.innerWidth - btnRect.left + 8;
              if (offsetFromRight > trailingRight) {
                trailingRight = offsetFromRight;
                verticalTop = Math.round(btnRect.top + (btnRect.height - iconSize) / 2);
              }
            }
          }
        }
      }
    }

    // Collision avoidance with third-party extension widgets (e.g. Grammarly)
    const iconScreenLeft = window.innerWidth - trailingRight - iconSize;
    const iconScreenRight = iconScreenLeft + iconSize;
    const iconScreenTop = verticalTop;
    const iconScreenBottom = verticalTop + iconSize;

    const externalWidgets = Array.from(document.querySelectorAll<HTMLElement>('grammarly-extension, [data-grammarly-part], [class*="grammarly"], [class*="languagetool"]'));
    for (const widget of externalWidgets) {
      const wRect = widget.getBoundingClientRect();
      if (wRect.width > 0 && wRect.height > 0) {
        const overlaps = !(
          iconScreenRight < wRect.left ||
          iconScreenLeft > wRect.right ||
          iconScreenBottom < wRect.top ||
          iconScreenTop > wRect.bottom
        );
        if (overlaps) {
          trailingRight = Math.max(trailingRight, window.innerWidth - wRect.left + 8);
        }
      }
    }

    // Clamp within viewport
    trailingRight = Math.max(6, Math.min(trailingRight, window.innerWidth - iconSize - 6));
    verticalTop = Math.max(6, Math.min(verticalTop, window.innerHeight - iconSize - 6));

    this.wrapper.style.right = `${trailingRight}px`;
    this.wrapper.style.top = `${verticalTop}px`;

    // Responsive Card Sizing & Placement
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth <= 480;
    const cardWidth = isMobile
      ? Math.min(340, viewportWidth - 16)
      : Math.min(320, viewportWidth - 20);

    this.noticeCard.style.width = `${cardWidth}px`;

    const wrapperRightEdge = viewportWidth - trailingRight;
    const desiredCardLeft = Math.max(8, Math.min(wrapperRightEdge - cardWidth + 12, viewportWidth - cardWidth - 8));
    const cardOffsetRight = wrapperRightEdge - (desiredCardLeft + cardWidth);
    this.noticeCard.style.right = `${cardOffsetRight}px`;

    this.updateCardPlacement(bounds, verticalTop);
  }

  /**
   * Automatically positions the card above or below the field without cut-offs,
   * dynamically calculating max-height based on available viewport space.
   */
  private updateCardPlacement(bounds: DOMRect, customVerticalTop?: number): void {
    const iconSize = 24;
    const isMultiline = bounds.height > 52;
    const verticalTop = customVerticalTop ?? (isMultiline
      ? bounds.bottom - iconSize - 10
      : bounds.top + Math.max(0, Math.round((bounds.height - iconSize) / 2)));

    const viewportHeight = window.innerHeight;
    const spaceAbove = Math.max(0, verticalTop - 16);
    const spaceBelow = Math.max(0, viewportHeight - (bounds.bottom + 8));

    // Choose placement: prefer above if enough space, otherwise place below
    const placeAbove = spaceAbove >= 280 || (spaceAbove >= spaceBelow && spaceAbove >= 160);

    if (placeAbove) {
      this.noticeCard.classList.remove('place-below');
      this.noticeCard.classList.add('place-above');
      const maxH = Math.max(140, Math.min(420, spaceAbove));
      this.noticeCard.style.maxHeight = `${maxH}px`;
    } else {
      this.noticeCard.classList.remove('place-above');
      this.noticeCard.classList.add('place-below');
      const maxH = Math.max(140, Math.min(420, spaceBelow));
      this.noticeCard.style.maxHeight = `${maxH}px`;
    }
  }

  /**
   * Renders the indicator icon based on finding count, severity, and active protections.
   */
  private renderState(
    findings: readonly SensitiveFinding[],
    protectedItems: readonly ProtectedItem[]
  ): void {
    this.iconButton.classList.remove('state-safe', 'state-warning', 'state-critical');

    if (findings.length === 0) {
      this.iconButton.classList.add('state-safe');
      this.iconButton.innerHTML = this.getSafeShieldSvg();

      const tooltipText = protectedItems.length > 0
        ? `TekaSend: Protected (${protectedItems.length} item${protectedItems.length > 1 ? 's' : ''}). Press Alt+P to manage.`
        : 'TekaSend: No privacy risks detected. (Alt+P to scan)';

      this.iconButton.setAttribute('title', tooltipText);
      this.iconButton.setAttribute('aria-label', 'Privacy Protected - Click for options');
    } else {
      const hasCritical = findings.some(f => f.severity === 'critical');
      this.iconButton.classList.add(hasCritical ? 'state-critical' : 'state-warning');
      this.iconButton.innerHTML = this.getWarningShieldSvg(findings.length);
      this.iconButton.setAttribute(
        'title',
        `TekaSend: ${findings.length} security threat${findings.length > 1 ? 's' : ''} detected. Click or press Alt+P to sanitize.`
      );
      this.iconButton.setAttribute('aria-label', `${findings.length} security threats detected`);
    }

    this.renderDataAwarenessNotice(findings, protectedItems);
  }

  /**
   * Renders the interactive Data Awareness Notice card.
   * Handles both threat resolution AND post-repair protection management with compact scrollable view.
   */
  private renderDataAwarenessNotice(
    findings: readonly SensitiveFinding[],
    protectedItems: readonly ProtectedItem[]
  ): void {
    this.noticeReasonList.innerHTML = '';

    // ─────────────────────────────────────────────────────────────
    // CASE 1: Unresolved Threats Detected
    // ─────────────────────────────────────────────────────────────
    if (findings.length > 0) {
      const criticalCount = findings.filter(f => f.severity === 'critical').length;
      const highCount = findings.filter(f => f.severity === 'high').length;
      const mediumCount = findings.filter(f => f.severity === 'medium').length;

      // Summary Header & Educational Info Section (PRD F1 Data Awareness Notice)
      const headerRow = document.createElement('div');
      headerRow.className = 'ts-threats-summary-header';
      headerRow.innerHTML = `
        <div class="ts-summary-title-row">
          <span class="ts-summary-title">${findings.length} Threat${findings.length > 1 ? 's' : ''} Detected</span>
          <div class="ts-summary-chips">
            ${criticalCount > 0 ? `<span class="ts-chip critical">${criticalCount} Critical</span>` : ''}
            ${highCount > 0 ? `<span class="ts-chip high">${highCount} High</span>` : ''}
            ${mediumCount > 0 ? `<span class="ts-chip medium">${mediumCount} Medium</span>` : ''}
          </div>
        </div>
        <div class="ts-guidance-box">
          <div class="ts-guidance-title">Why mask sensitive data?</div>
          <div class="ts-guidance-desc">Protects personal info and secrets from AI model training and external leakage.</div>
          <div class="ts-guidance-strategies">
            <div class="ts-strat-row"><b>Placeholder:</b> Replaces with safe token (e.g. <code>[API_KEY]</code>, <code>[EMAIL_ADDRESS]</code>)</div>
            <div class="ts-strat-row"><b>Scramble:</b> Replaces with realistic synthetic dummy text</div>
          </div>
        </div>
      `;
      this.noticeReasonList.append(headerRow);

      // Global One-Click Bulk Actions Bar (for 2+ items)
      if (findings.length > 1) {
        const bulkActionRow = document.createElement('div');
        bulkActionRow.className = 'ts-bulk-actions-bar';
        bulkActionRow.innerHTML = `
          <button type="button" class="ts-bulk-btn primary" id="tsBulkPlaceholders" title="Replace all detected secrets with safe [CATEGORY] placeholder tokens">
            Replace All (Alt+P)
          </button>
          <button type="button" class="ts-bulk-btn secondary" id="tsBulkScramble" title="Replace all detected secrets with realistic synthetic dummy text">
            Scramble All (Alt+S)
          </button>
        `;

        const bulkPlaceholders = bulkActionRow.querySelector('#tsBulkPlaceholders');
        bulkPlaceholders?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onApplyRepairAll(target, 'semantic_placeholder');
          }
        });

        const bulkScramble = bulkActionRow.querySelector('#tsBulkScramble');
        bulkScramble?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onApplyRepairAll(target, 'synthetic_dummy');
          }
        });

        this.noticeReasonList.append(bulkActionRow);
      }

      // Max-Height Scrollable Item List
      const scrollList = document.createElement('div');
      scrollList.className = 'ts-scrollable-items-feed';

      // Group findings by unique rawText to prevent redundant cards
      const uniqueFindingsMap = new Map<string, { finding: SensitiveFinding; count: number }>();
      for (const finding of findings) {
        if (!uniqueFindingsMap.has(finding.rawText)) {
          uniqueFindingsMap.set(finding.rawText, { finding, count: 1 });
        } else {
          uniqueFindingsMap.get(finding.rawText)!.count += 1;
        }
      }

      for (const { finding, count } of uniqueFindingsMap.values()) {
        const risk = this.riskAnalyzer.analyzeRisk(finding.category, finding.rawText, finding.severity);
        const item = document.createElement('div');
        item.className = 'ts-notice-item';

        const maskedPreview = this.maskSecret(finding.rawText);
        const countBadge = count > 1 ? `<span class="ts-count-pill">${count}x</span>` : '';

        item.innerHTML = `
          <div class="ts-item-header">
            <div class="ts-item-tag-group">
              <span class="ts-category-tag ${finding.severity}">${this.getCategoryLabel(finding.category)}</span>
              <span class="ts-code-preview">${maskedPreview}</span>
              ${countBadge}
            </div>
            <span class="ts-severity-badge ${finding.severity}">${finding.severity.toUpperCase()}</span>
          </div>
          <div class="ts-item-reason">${risk.explanation}</div>
          <div class="ts-item-recommendation"><b>Action:</b> ${risk.recommendedAction}</div>
          <div class="ts-item-actions">
            <button type="button" class="ts-repair-btn primary" data-strategy="semantic_placeholder" title="Replace with safe [${finding.category.toUpperCase()}] token">Placeholder</button>
            <button type="button" class="ts-repair-btn secondary" data-strategy="synthetic_dummy" title="Replace with realistic synthetic dummy text">Scramble</button>
          </div>
        `;

        item.querySelectorAll<HTMLButtonElement>('.ts-repair-btn').forEach(btn => {
          btn.addEventListener('pointerdown', (e: PointerEvent) => e.stopPropagation());
          btn.addEventListener('mousedown', (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
          });
          btn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const strategy = btn.getAttribute('data-strategy') as RepairStrategyType;
            const target = this.targetElement || this.activeElement;
            if (strategy && target && this.actions) {
              this.actions.onApplyRepair(target, finding, strategy);
            }
          });
        });

        scrollList.append(item);
      }

      this.noticeReasonList.append(scrollList);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 2: Protected Items Available for Strategy Switching
    // ─────────────────────────────────────────────────────────────
    if (protectedItems.length > 0) {
      const headerRow = document.createElement('div');
      headerRow.className = 'ts-protected-status-header';
      headerRow.innerHTML = `
        <div class="ts-status-indicator">
          <span class="ts-status-dot"></span>
          <span class="ts-status-title">Protection Active (${protectedItems.length})</span>
        </div>
      `;
      this.noticeReasonList.append(headerRow);

      // Global Actions for Protected State (when 2+ items)
      if (protectedItems.length > 1) {
        const bulkActionRow = document.createElement('div');
        bulkActionRow.className = 'ts-bulk-actions-bar';
        bulkActionRow.innerHTML = `
          <button type="button" class="ts-bulk-btn primary" id="tsSwitchAllBtn" style="flex: 1;">
            Switch All to Scramble (Alt+S)
          </button>
        `;

        const switchAllBtn = bulkActionRow.querySelector('#tsSwitchAllBtn');
        const allPlaceholders = protectedItems.every(p => p.currentStrategy === 'semantic_placeholder');
        if (!allPlaceholders) {
          switchAllBtn!.textContent = 'Switch All to Placeholders (Alt+P)';
        }

        switchAllBtn?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          const nextStrategy = allPlaceholders ? 'synthetic_dummy' : 'semantic_placeholder';
          if (target && this.actions?.onSwitchAllStrategies) {
            this.actions.onSwitchAllStrategies(target, nextStrategy);
          }
        });

        this.noticeReasonList.append(bulkActionRow);
      }

      // Max-Height Scrollable Feed
      const scrollList = document.createElement('div');
      scrollList.className = 'ts-scrollable-items-feed';

      for (const item of protectedItems) {
        const row = document.createElement('div');
        row.className = 'ts-protected-item-card';

        const isPlaceholder = item.currentStrategy === 'semantic_placeholder';
        const targetStrategy = isPlaceholder ? 'synthetic_dummy' : 'semantic_placeholder';
        const switchLabel = isPlaceholder ? 'Scramble' : 'Placeholder';

        row.innerHTML = `
          <div class="ts-protected-item-top">
            <div class="ts-protected-left">
              <span class="ts-category-tag safe">${this.getCategoryLabel(item.category)}</span>
              <span class="ts-protected-token">${this.escapeHtml(item.currentToken)}</span>
            </div>
            <span class="ts-mode-tag">${isPlaceholder ? 'Placeholder' : 'Scrambled'}</span>
          </div>
          <div class="ts-protected-actions">
            <button type="button" class="ts-switch-btn" data-action="switch">${switchLabel}</button>
          </div>
        `;

        const switchBtn = row.querySelector<HTMLButtonElement>('.ts-switch-btn');
        switchBtn?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onSwitchStrategy(target, item, targetStrategy);
          }
        });

        scrollList.append(row);
      }

      this.noticeReasonList.append(scrollList);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 3: Clean State (No Threats, No Modifications)
    // ─────────────────────────────────────────────────────────────
    const cleanBox = document.createElement('div');
    cleanBox.className = 'ts-clean-status-box';
    cleanBox.innerHTML = `
      <div class="ts-clean-icon">✓</div>
      <div class="ts-clean-text">
        <strong>Privacy Shield Active</strong>
        <span>No confidential data detected in this input.</span>
      </div>
    `;
    this.noticeReasonList.append(cleanBox);
  }

  private toggleNoticeCard(): void {
    if (this.isCardVisible) {
      this.hideNoticeCard();
    } else {
      this.showNoticeCard();
    }
  }

  private showNoticeCard(): void {
    this.isCardVisible = true;
    const target = this.targetElement || this.activeElement;
    if (target) {
      this.updateCardPlacement(target.getBoundingClientRect());
    }
    this.noticeCard.classList.add('visible');
  }

  private hideNoticeCard(): void {
    this.isCardVisible = false;
    this.noticeCard.classList.remove('visible');
  }

  private attachEventListeners(): void {
    this.iconButton.addEventListener('pointerdown', (event: PointerEvent) => {
      event.stopPropagation();
    });

    this.iconButton.addEventListener('mousedown', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    });

    this.iconButton.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      this.toggleNoticeCard();
    });

    this.noticeCard.addEventListener('pointerdown', (event: PointerEvent) => {
      event.stopPropagation();
    });

    this.noticeCard.addEventListener('mousedown', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    });

    this.noticeCard.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event: MouseEvent) => {
      if (this.isCardVisible && !this.wrapper.contains(event.target as Node)) {
        this.hideNoticeCard();
      }
    });

    const repositionHandler = () => {
      if (this.activeElement && this.activeElement.isConnected) {
        this.positionInsideField(this.activeElement.getBoundingClientRect());
      }
    };

    window.addEventListener('scroll', repositionHandler, { passive: true });
    window.addEventListener('resize', repositionHandler, { passive: true });
    document.addEventListener('scroll', repositionHandler, { capture: true, passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', repositionHandler, { passive: true });
      window.visualViewport.addEventListener('scroll', repositionHandler, { passive: true });
    }
  }

  private buildDomElements() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ts-infield-guardian-wrapper';

    const iconButton = document.createElement('button');
    iconButton.type = 'button';
    iconButton.className = 'ts-infield-icon-btn state-safe';

    const noticeCard = document.createElement('div');
    noticeCard.className = 'ts-data-awareness-card place-above';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'ts-card-header';
    cardHeader.innerHTML = `
      <div class="ts-card-brand">
        <span class="ts-brand-logo">TekaSend</span>
        <span class="ts-local-ai-tag">On-Device</span>
      </div>
      <button type="button" class="ts-dismiss-btn" id="tsDismissNotice">✕</button>
    `;

    cardHeader.querySelector('#tsDismissNotice')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      this.hideNoticeCard();
    });

    const noticeReasonList = document.createElement('div');
    noticeReasonList.className = 'ts-card-reasons-list';

    noticeCard.append(cardHeader, noticeReasonList);
    wrapper.append(iconButton, noticeCard);

    return {
      wrapper,
      iconButton,
      noticeCard,
      noticeReasonList
    };
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .ts-infield-guardian-wrapper {
        position: fixed;
        z-index: 2147483647;
        display: none;
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        max-width: 24px !important;
        max-height: 24px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        align-items: center;
        justify-content: center;
        font-family: var(--ts-font, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif);
        font-size: 12px;
        line-height: 1.4;
        pointer-events: auto !important;
        overflow: visible;
        opacity: 0;
        transform: scale(0.85);
        transition: top 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    right 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .ts-infield-guardian-wrapper.ts-visible {
        opacity: 1;
        transform: scale(1);
      }

      /* ── Minimalist Dynamic iOS In-Field Icon ── */
      .ts-infield-icon-btn {
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        max-width: 24px !important;
        max-height: 24px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        border-radius: 50%;
        border: none;
        background: transparent;
        cursor: pointer !important;
        pointer-events: auto !important;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        outline: none;
        box-shadow: var(--ts-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.10)) !important;
        animation: none !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
                    background-color 0.2s ease,
                    box-shadow 0.2s ease,
                    opacity 0.15s ease !important;
      }

      .ts-infield-icon-btn svg {
        width: 14px !important;
        height: 14px !important;
        flex-shrink: 0 !important;
      }

      .ts-infield-icon-btn:hover {
        opacity: 1;
        transform: scale(1.12);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16) !important;
      }

      .ts-infield-icon-btn:active {
        transform: scale(0.92);
        opacity: 0.85;
      }

      /* Safe State — Clean Minimalist iOS Green */
      .ts-infield-icon-btn.state-safe {
        background: var(--ts-green-bg, rgba(52, 199, 89, 0.12));
        color: var(--ts-green, #34c759);
        border: 1px solid var(--ts-green-bd, rgba(52, 199, 89, 0.24));
      }

      /* Warning State — Flat Solid iOS Amber */
      .ts-infield-icon-btn.state-warning {
        background: var(--ts-orange, #ff9500);
        color: #ffffff;
      }

      /* Critical State — Flat Solid iOS Red */
      .ts-infield-icon-btn.state-critical {
        background: var(--ts-red, #ff3b30);
        color: #ffffff;
      }

      /* ── Compact iOS Popover Card ─────────────────────── */
      .ts-data-awareness-card {
        position: absolute;
        width: 320px;
        max-width: calc(100vw - 16px);
        max-height: 380px;
        background: var(--ts-card, #ffffff);
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        border-radius: 16px;
        box-shadow: var(--ts-shadow, 0 10px 30px rgba(0, 0, 0, 0.12));
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        padding: 12px 14px;
        display: none;
        flex-direction: column;
        gap: 9px;
        color: var(--ts-text, #1c1c1e);
        font-family: var(--ts-font, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif);
        z-index: 2147483647;
        pointer-events: auto !important;
        box-sizing: border-box;
        overflow: hidden;
      }

      .ts-data-awareness-card.place-above {
        bottom: calc(100% + 8px);
        top: auto;
      }

      .ts-data-awareness-card.place-below {
        top: calc(100% + 8px);
        bottom: auto;
      }

      .ts-data-awareness-card.visible {
        display: flex;
      }

      .ts-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 7px;
        border-bottom: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        flex-shrink: 0;
      }

      .ts-card-brand {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ts-brand-logo {
        font-weight: 700;
        font-size: 13px;
        color: var(--ts-text, #1c1c1e);
        letter-spacing: -0.2px;
      }

      .ts-local-ai-tag {
        font-size: 10px;
        font-weight: 600;
        padding: 1.5px 7px;
        border-radius: 9999px;
        background: var(--ts-green-bg, rgba(52, 199, 89, 0.12));
        color: var(--ts-green-text, #1a7a2b);
      }

      .ts-dismiss-btn {
        background: transparent;
        border: none;
        font-size: 12px;
        color: var(--ts-secondary, #6c6c70);
        cursor: pointer;
        padding: 2px 4px;
        line-height: 1;
        border-radius: 4px;
        transition: color 0.15s ease;
      }

      .ts-dismiss-btn:hover {
        color: var(--ts-text, #1c1c1e);
      }

      .ts-card-reasons-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }

      /* ── Threats Summary Header & Chips ── */
      .ts-threats-summary-header {
        padding: 0;
        flex-shrink: 0;
      }

      .ts-summary-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ts-summary-title {
        font-weight: 700;
        font-size: 12px;
        color: var(--ts-text, #1c1c1e);
      }

      .ts-summary-chips {
        display: flex;
        gap: 5px;
      }

      .ts-chip {
        font-size: 9px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 9999px;
        letter-spacing: 0.1px;
      }

      .ts-chip.critical {
        background: var(--ts-red-bg, rgba(255, 59, 48, 0.12));
        color: var(--ts-red-text, #d70015);
      }

      .ts-chip.high {
        background: var(--ts-orange-bg, rgba(255, 149, 0, 0.12));
        color: var(--ts-orange-text, #c93400);
      }

      .ts-chip.medium {
        background: var(--ts-yellow-bg, rgba(255, 204, 0, 0.16));
        color: var(--ts-yellow-text, #8a6d00);
      }

      /* ── Guidance / Educational Box (PRD F1 Data Awareness) ── */
      .ts-guidance-box {
        background: var(--ts-blue-subtle, rgba(0, 122, 255, 0.08));
        border: 1px solid var(--ts-blue-border, rgba(0, 122, 255, 0.20));
        border-radius: 11px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 5px;
      }

      .ts-guidance-title {
        font-weight: 650;
        font-size: 11px;
        color: var(--ts-blue, #007aff);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .ts-guidance-desc {
        font-size: 10px;
        color: var(--ts-secondary, #6c6c70);
        line-height: 1.35;
      }

      .ts-guidance-strategies {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-top: 2px;
      }

      .ts-strat-row {
        display: block;
        font-size: 9.5px;
        line-height: 1.4;
        color: var(--ts-secondary, #6c6c70);
      }

      .ts-strat-row b {
        font-weight: 600;
        color: var(--ts-text, #1c1c1e);
      }

      .ts-strat-row code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 9px;
        background: var(--ts-control, rgba(120, 120, 128, 0.12));
        color: var(--ts-text, #1c1c1e);
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        padding: 1px 4px;
        border-radius: 4px;
      }

      /* ── Global One-Click Bulk Actions Bar ── */
      .ts-bulk-actions-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 2px;
        flex-shrink: 0;
      }

      .ts-bulk-btn {
        padding: 6px 8px;
        font-size: 10.5px;
        font-weight: 600;
        border-radius: 8px;
        font-family: inherit;
        cursor: pointer;
        text-align: center;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      .ts-bulk-btn.primary {
        background: var(--ts-blue, #007aff);
        color: #ffffff;
        border: none;
      }

      .ts-bulk-btn.primary:hover {
        background: var(--ts-blue-hover, #0a84ff);
      }

      .ts-bulk-btn.secondary {
        background: var(--ts-card, #ffffff);
        color: var(--ts-text, #1c1c1e);
        border: 1px solid var(--ts-border-mid, rgba(60, 60, 67, 0.16));
      }

      .ts-bulk-btn.secondary:hover {
        background: var(--ts-control, rgba(120, 120, 128, 0.12));
      }

      /* ── Max-Height Scrollable Feed ── */
      .ts-scrollable-items-feed {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 2px;
        scrollbar-width: thin;
        scrollbar-color: var(--ts-border-mid, rgba(60, 60, 67, 0.20)) transparent;
        overscroll-behavior: contain;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar {
        width: 4px;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-track {
        background: transparent;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-thumb {
        background: var(--ts-border-mid, rgba(60, 60, 67, 0.20));
        border-radius: 9999px;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-thumb:hover {
        background: var(--ts-secondary, rgba(60, 60, 67, 0.40));
      }

      /* ── Compact Individual Threat Item ── */
      .ts-notice-item {
        background: var(--ts-subtle, #f2f2f7);
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        border-radius: 11px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .ts-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ts-item-tag-group {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
      }

      .ts-category-tag {
        font-weight: 650;
        font-size: 11px;
        color: var(--ts-text, #1c1c1e);
        white-space: nowrap;
      }

      .ts-category-tag.safe {
        color: var(--ts-green-text, #1a7a2b);
      }

      .ts-severity-badge {
        font-size: 8.5px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 9999px;
        letter-spacing: 0.2px;
        flex-shrink: 0;
      }

      .ts-severity-badge.critical {
        background: var(--ts-red-bg, rgba(255, 59, 48, 0.12));
        color: var(--ts-red-text, #d70015);
      }

      .ts-severity-badge.high {
        background: var(--ts-orange-bg, rgba(255, 149, 0, 0.12));
        color: var(--ts-orange-text, #c93400);
      }

      .ts-severity-badge.medium {
        background: var(--ts-yellow-bg, rgba(255, 204, 0, 0.16));
        color: var(--ts-yellow-text, #8a6d00);
      }

      .ts-code-preview {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        background: var(--ts-control, rgba(120, 120, 128, 0.12));
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        padding: 1px 5px;
        border-radius: 4px;
        color: var(--ts-text, #1c1c1e);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 130px;
      }

      .ts-count-pill {
        font-size: 8.5px;
        font-weight: 700;
        background: var(--ts-blue-subtle, rgba(0, 122, 255, 0.12));
        color: var(--ts-blue, #007aff);
        padding: 1px 5px;
        border-radius: 4px;
      }

      .ts-item-reason {
        font-size: 10.5px;
        color: var(--ts-secondary, #6c6c70);
        line-height: 1.35;
      }

      .ts-item-recommendation {
        font-size: 10px;
        color: var(--ts-green-text, #1a7a2b);
        background: var(--ts-green-bg, rgba(52, 199, 89, 0.12));
        border: 1px solid var(--ts-green-bd, rgba(52, 199, 89, 0.24));
        border-radius: 7px;
        padding: 5px 8px;
        line-height: 1.35;
      }

      .ts-item-recommendation b {
        font-weight: 600;
      }

      .ts-item-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 2px;
      }

      .ts-repair-btn {
        background: var(--ts-card, #ffffff);
        border: 1px solid var(--ts-border-mid, rgba(60, 60, 67, 0.16));
        border-radius: 7px;
        padding: 6px 8px;
        font-size: 10.5px;
        font-weight: 550;
        color: var(--ts-text, #1c1c1e);
        font-family: inherit;
        cursor: pointer;
        text-align: center;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      .ts-repair-btn.primary {
        background: var(--ts-blue, #007aff);
        color: #ffffff;
        border: none;
        font-weight: 600;
      }

      .ts-repair-btn.primary:hover {
        background: var(--ts-blue-hover, #0a84ff);
      }

      .ts-repair-btn:hover:not(.primary) {
        background: var(--ts-control, rgba(120, 120, 128, 0.12));
      }

      /* ── Protected Items Manager View ── */
      .ts-protected-status-header {
        padding: 0;
        flex-shrink: 0;
      }

      .ts-status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ts-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ts-green, #34c759);
      }

      .ts-status-title {
        font-weight: 700;
        font-size: 12px;
        color: var(--ts-text, #1c1c1e);
      }

      .ts-protected-item-card {
        background: var(--ts-subtle, #f2f2f7);
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .ts-protected-left {
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow: hidden;
      }

      .ts-mode-tag {
        font-size: 9px;
        font-weight: 600;
        background: var(--ts-control, rgba(120, 120, 128, 0.12));
        border: 1px solid var(--ts-border, rgba(60, 60, 67, 0.10));
        padding: 2px 5px;
        border-radius: 4px;
        color: var(--ts-secondary, #6c6c70);
        align-self: flex-start;
      }

      .ts-protected-token {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10.5px;
        color: var(--ts-green-text, #1a7a2b);
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      }

      .ts-protected-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }

      .ts-switch-btn {
        background: var(--ts-blue, #007aff);
        color: #ffffff;
        border: none;
        border-radius: 7px;
        padding: 5px 9px;
        font-size: 10.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      .ts-switch-btn:hover {
        background: var(--ts-blue-hover, #0a84ff);
      }

      /* Clean State Box */
      .ts-clean-status-box {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--ts-green-bg, rgba(52, 199, 89, 0.12));
        border: 1px solid var(--ts-green-bd, rgba(52, 199, 89, 0.24));
        border-radius: 11px;
        padding: 11px 12px;
      }

      .ts-clean-icon {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--ts-green, #34c759);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
        flex-shrink: 0;
      }

      .ts-clean-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ts-clean-text strong {
        font-size: 12px;
        color: var(--ts-text, #1c1c1e);
      }

      .ts-clean-text span {
        font-size: 10.5px;
        color: var(--ts-secondary, #6c6c70);
      }

      @media (max-width: 480px) {
        .ts-data-awareness-card {
          width: calc(100vw - 16px) !important;
          max-width: 340px !important;
          padding: 10px 12px;
          border-radius: 14px;
          gap: 6px;
        }
        .ts-bulk-actions-bar {
          gap: 5px;
        }
        .ts-bulk-btn {
          padding: 7px 6px;
          font-size: 10.5px;
        }
        .ts-notice-item {
          padding: 7px 8px;
        }
        .ts-code-preview {
          max-width: 95px;
        }
      }
    `;
    this.shadow.append(style);
  }

  // ── Clean iOS SVG Icons ───────────────────────────────────────

  private getSafeShieldSvg(): string {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L2 4.2V8C2 11.3 4.6 14.4 8 15.2C11.4 14.4 14 11.3 14 8V4.2L8 1.5Z" stroke="#34c759" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke="#34c759" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  private getWarningShieldSvg(count: number): string {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L2 4.2V8C2 11.3 4.6 14.4 8 15.2C11.4 14.4 14 11.3 14 8V4.2L8 1.5Z" fill="currentColor"/>
        <text x="8" y="10.8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">${count}</text>
      </svg>
    `;
  }

  private getCategoryLabel(cat: FindingCategory): string {
    switch (cat) {
      case 'api_key': return 'API Key / Secret';
      case 'private_key': return 'Private Key';
      case 'password': return 'Password';
      case 'bearer_token': return 'Auth Token';
      case 'credit_card': return 'Payment Card';
      case 'ssn': return 'SSN / ID';
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'person_name': return 'Personal Identifier';
      case 'address': return 'Location';
      case 'ip_address': return 'IP Address';
      default: return 'Confidential Data';
    }
  }

  private maskSecret(raw: string): string {
    if (raw.length <= 6) return '••••••';
    return `${raw.slice(0, 4)}••••${raw.slice(-3)}`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
