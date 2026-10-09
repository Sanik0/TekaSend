/**
 * Background Service Worker Entry Point
 *
 * Coordinates context menu actions, background routing to the on-device AI subsystem,
 * and maintains backward compatibility with cloud mocks.
 */

import type { ExtensionRequestMessage, ExtensionResponseMessage } from './shared/types/messages.js';
import type { FindingCategory } from './ai/types.js';

type AiFinding = { text: string; type: string; severity: 'high' | 'medium'; category?: FindingCategory };
type AiAnalysis = { findings: AiFinding[]; provider: 'local' | 'cloud' };

function setupContextMenus(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tekasend-root',
      title: 'TekaSend Privacy',
      contexts: ['selection', 'editable']
    });
    chrome.contextMenus.create({
      id: 'tekasend-placeholder',
      parentId: 'tekasend-root',
      title: 'Insert Placeholder [CATEGORY]',
      contexts: ['selection', 'editable']
    });
    chrome.contextMenus.create({
      id: 'tekasend-dummy',
      parentId: 'tekasend-root',
      title: 'Scramble / Replace with Dummy',
      contexts: ['selection', 'editable']
    });
    chrome.contextMenus.create({
      id: 'tekasend-blur',
      parentId: 'tekasend-root',
      title: 'Blur Selection',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'tekasend-spoiler',
      parentId: 'tekasend-root',
      title: 'Particle Spoiler Mask',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'tekasend-restore',
      parentId: 'tekasend-root',
      title: 'Restore Original Text',
      contexts: ['selection', 'editable']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (!tab?.id || typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith('tekasend-')) return;
  const action = info.menuItemId.replace('tekasend-', '');
  if (action === 'root') return;
  void chrome.tabs.sendMessage(tab.id, {
    kind: 'CONTEXT_MENU_ACTION',
    action,
    selectionText: info.selectionText ?? ''
  }).catch(() => {});
});

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url]
  });
  if (contexts.length) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run the packaged ONNX privacy model in a local extension document.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function requestLocal(request: ExtensionRequestMessage): Promise<ExtensionResponseMessage> {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({ kind: 'OFFSCREEN_AI_REQUEST', request });
  if (!response || typeof response !== 'object' || !('kind' in response)) {
    const error = response?.errorMessage;
    throw new Error(typeof error === 'string' ? error : 'The local AI document did not respond.');
  }
  return response as ExtensionResponseMessage;
}

function localErrorResponse(kind: string, error: unknown): { kind: string; ok: false; errorMessage: string } {
  const responseKinds: Record<string, string> = {
    HYBRID_SCAN_REQUEST: 'HYBRID_SCAN_RESPONSE',
    SMART_REPAIR_REQUEST: 'SMART_REPAIR_RESPONSE',
    VERIFY_REPAIR_REQUEST: 'VERIFY_REPAIR_RESPONSE',
    MODEL_STATUS_REQUEST: 'MODEL_STATUS_RESPONSE'
  };
  return {
    kind: responseKinds[kind] ?? 'LOCAL_AI_ERROR',
    ok: false,
    errorMessage: error instanceof Error ? error.message : 'Local AI is unavailable.'
  };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  const msg = message as { kind?: string };

  // Route to the on-device AI subsystem
  if (
    msg.kind === 'HYBRID_SCAN_REQUEST' ||
    msg.kind === 'SMART_REPAIR_REQUEST' ||
    msg.kind === 'VERIFY_REPAIR_REQUEST' ||
    msg.kind === 'MODEL_STATUS_REQUEST'
  ) {
    void requestLocal(message as ExtensionRequestMessage)
      .then(sendResponse)
      .catch(error => sendResponse(localErrorResponse(msg.kind!, error)));
    return true; // Keep message channel open for async response
  }

  // Backward compatibility route for in-page scan requests
  if (msg.kind === 'AI_ANALYZE') {
    const text = 'text' in message && typeof message.text === 'string' ? message.text.slice(0, 5000) : '';
    if (!text) {
      sendResponse({ ok: true, findings: [] });
      return;
    }
    void analyze(text)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'AI request failed' }));
    return true;
  }
});

/**
 * Executes on-device AI scan via the offscreen document.
 */
async function analyze(text: string): Promise<AiAnalysis> {
  const response = await requestLocal({ kind: 'HYBRID_SCAN_REQUEST', text });
  if (response.kind !== 'HYBRID_SCAN_RESPONSE' || !response.ok || !response.result) {
    throw new Error(
      response.kind === 'HYBRID_SCAN_RESPONSE'
        ? response.errorMessage ?? 'On-device scan failed.'
        : 'Unexpected on-device scan response.'
    );
  }
  return {
    provider: 'local',
    findings: response.result.findings.map(f => ({
      text: f.rawText,
      type: f.label,
      category: f.category,
      severity: (f.severity === 'critical' || f.severity === 'high') ? 'high' : 'medium'
    }))
  };
}

