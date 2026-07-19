importScripts('encrypted_workflow.js');
const TARGET_URL = 'https://j03.page/time-management-by-oneal-gpl3/';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureDefaults();
  if (reason === 'install') {
    await chrome.tabs.create({ url: TARGET_URL, active: true });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_TARGET') {
    chrome.tabs.create({ url: TARGET_URL, active: true }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'ENSURE_DEFAULTS') {
    ensureDefaults().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'RESET_CONFIG') {
    chrome.storage.local.remove('otmConfig').then(ensureDefaults).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function ensureDefaults() {
  const existing = await chrome.storage.local.get(['otmConfig', 'otmSessions']);
  if (!existing.otmConfig || (existing.otmConfig.schemaVersion || 0) < 5) {
    await chrome.storage.local.set({ otmConfig: defaultConfig() });
  }
  if (!existing.otmSessions) {
    await chrome.storage.local.set({ otmSessions: [] });
  }
}

function defaultConfig() {
  return decodeWorkflow();
}

function decodeWorkflow() {
  const cipherText = atob(ENCRYPTED_WORKFLOW_B64);
  let output = '';
  for (let i = 0; i < cipherText.length; i++) {
    output += String.fromCharCode(cipherText.charCodeAt(i) ^ WORKFLOW_KEY.charCodeAt(i % WORKFLOW_KEY.length));
  }
  return JSON.parse(output);
}
