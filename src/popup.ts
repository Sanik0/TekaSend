const key = document.querySelector<HTMLInputElement>('#apiKey')!;
const enabled = document.querySelector<HTMLInputElement>('#aiEnabled')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

void chrome.storage.local.get(['apiKey', 'aiEnabled']).then(settings => {
  key.value = typeof settings.apiKey === 'string' ? settings.apiKey : '';
  enabled.checked = !!settings.aiEnabled;
});

document.querySelector('#toggleKey')!.addEventListener('click', event => {
  key.type = key.type === 'password' ? 'text' : 'password';
  (event.currentTarget as HTMLButtonElement).textContent = key.type === 'password' ? 'Show' : 'Hide';
});

document.querySelector('#save')!.addEventListener('click', async () => {
  if (enabled.checked && !key.value.trim()) { statusEl.textContent = 'Enter an API key before enabling AI.'; return; }
  await chrome.storage.local.set({ apiKey: key.value.trim(), aiEnabled: enabled.checked });
  statusEl.textContent = 'Saved. Local rules remain active.';
});

document.querySelector('#clear')!.addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey');
  await chrome.storage.local.set({ aiEnabled: false });
  key.value = ''; enabled.checked = false; statusEl.textContent = 'API key removed.';
});

document.querySelector('#scan')!.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) { statusEl.textContent = 'No active page found.'; return; }
  statusEl.textContent = 'Scanning the page…';
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { kind: 'SCAN_AI' });
    statusEl.textContent = result.ok ? 'AI scan finished. Check the page for highlights.' : result.error || 'AI scan failed.';
  } catch { statusEl.textContent = 'Open a regular website and reload it, then try again.'; }
});
