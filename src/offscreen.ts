import { BackgroundAiRouter } from './background/router.js';

const router = new BackgroundAiRouter();

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== 'object') return;
  const envelope = message as { kind?: string; request?: unknown };
  if (envelope.kind !== 'OFFSCREEN_AI_REQUEST') return;

  void router.handleMessage(envelope.request)
    .then(response => respond(response))
    .catch(error => respond({
      ok: false,
      errorMessage: error instanceof Error ? error.message : 'Local AI request failed.'
    }));
  return true;
});
