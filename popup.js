const qs = (id) => document.getElementById(id);
let tickHandle = null;

const stateKeys = ['otmConfig', 'otmActiveSession', 'otmSessions'];

init();

async function init() {
  await chrome.runtime.sendMessage({ type: 'ENSURE_DEFAULTS' });
  qs('useNow').addEventListener('click', setNow);
  qs('openPage').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_TARGET' }));
  qs('startSession').addEventListener('click', startSession);
  qs('finishStep').addEventListener('click', () => completeCurrentStep('finished'));
  qs('skipStep').addEventListener('click', () => completeCurrentStep('skipped'));
  qs('pauseStep').addEventListener('click', togglePause);
  qs('endSession').addEventListener('click', endSession);
  qs('copyChatGPT').addEventListener('click', copyChatGPTReport);
  qs('downloadJson').addEventListener('click', downloadJson);
  qs('resetSession').addEventListener('click', resetSession);
  setNow();
  await render();
  tickHandle = setInterval(render, 1000);
}

function setNow() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  qs('manualDateTime').value = local;
}

async function getStore() {
  return await chrome.storage.local.get(stateKeys);
}

async function startSession() {
  const { otmConfig } = await getStore();
  const mode = qs('mode').value;
  const manualDateTime = qs('manualDateTime').value;
  const steps = otmConfig.steps.filter(s => mode === 'detailed' || s.condensed);
  const session = {
    id: crypto.randomUUID(),
    mode,
    manualDateTime,
    detectedDateTime: new Date().toISOString(),
    startedAt: Date.now(),
    currentIndex: 0,
    steps: steps.map(s => ({ ...s, status: 'pending', startedAt: null, endedAt: null, elapsedSeconds: null, pausedMs: 0, pauseStartedAt: null, pauseCount: 0 })),
    endedAt: null,
    totalPausedMs: 0
  };
  if (session.steps[0]) session.steps[0].startedAt = Date.now();
  await chrome.storage.local.set({ otmActiveSession: session });
  await render();
}

async function completeCurrentStep(status) {
  const { otmActiveSession } = await getStore();
  if (!otmActiveSession || otmActiveSession.endedAt) return;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (!step) return;
  finalizePauseForStep(step);
  step.status = status;
  step.endedAt = Date.now();
  step.elapsedSeconds = elapsedStepSeconds(step, step.endedAt);
  otmActiveSession.currentIndex += 1;
  const next = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (next) {
    next.startedAt = Date.now();
    next.pausedMs = next.pausedMs || 0;
    next.pauseStartedAt = null;
    next.pauseCount = next.pauseCount || 0;
  }
  else otmActiveSession.endedAt = Date.now();
  await chrome.storage.local.set({ otmActiveSession });
  if (otmActiveSession.endedAt) await archiveSession();
  await render();
}

async function endSession() {
  const { otmActiveSession } = await getStore();
  if (!otmActiveSession) return;
  otmActiveSession.endedAt = Date.now();
  await chrome.storage.local.set({ otmActiveSession });
  await archiveSession();
  await render();
}

async function archiveSession() {
  const { otmActiveSession, otmSessions = [] } = await getStore();
  if (!otmActiveSession) return;
  const already = otmSessions.some(s => s.id === otmActiveSession.id);
  if (!already) otmSessions.unshift(otmActiveSession);
  await chrome.storage.local.set({ otmSessions: otmSessions.slice(0, 30) });
}

async function resetSession() {
  await chrome.storage.local.remove('otmActiveSession');
  await render();
}

async function togglePause() {
  const { otmActiveSession } = await getStore();
  if (!otmActiveSession || otmActiveSession.endedAt) return;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (!step) return;
  if (step.pauseStartedAt) {
    step.pausedMs = (step.pausedMs || 0) + (Date.now() - step.pauseStartedAt);
    step.pauseStartedAt = null;
  } else {
    step.pauseStartedAt = Date.now();
    step.pauseCount = (step.pauseCount || 0) + 1;
  }
  await chrome.storage.local.set({ otmActiveSession });
  await render();
}

function finalizePauseForStep(step) {
  if (step?.pauseStartedAt) {
    step.pausedMs = (step.pausedMs || 0) + (Date.now() - step.pauseStartedAt);
    step.pauseStartedAt = null;
  }
}

function elapsedStepSeconds(step, now = Date.now()) {
  if (!step?.startedAt) return 0;
  const paused = (step.pausedMs || 0) + (step.pauseStartedAt ? now - step.pauseStartedAt : 0);
  return Math.max(0, Math.round((now - step.startedAt - paused) / 1000));
}

async function render() {
  const { otmConfig, otmActiveSession } = await getStore();
  renderSuggestions(otmConfig);
  if (!otmActiveSession) {
    qs('currentStep').textContent = 'No session running.';
    qs('timer').textContent = '00:00:00';
    qs('pauseStep').textContent = 'Pause timer';
    qs('pauseStep').classList.remove('paused');
    qs('pauseStatus').textContent = 'Timer is running when a session is active.';
    qs('pauseStatus').classList.remove('paused');
    return;
  }
  qs('mode').value = otmActiveSession.mode;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (!step) {
    qs('currentStep').textContent = 'Session complete.';
    qs('timer').textContent = formatSeconds(totalSessionSeconds(otmActiveSession));
    qs('pauseStep').textContent = 'Pause timer';
    qs('pauseStep').classList.remove('paused');
    qs('pauseStatus').textContent = 'Session complete. Paused time is excluded from step totals.';
    qs('pauseStatus').classList.remove('paused');
    return;
  }
  qs('currentStep').textContent = `${step.id}. ${step.activeTitle || step.title}`;
  const elapsed = elapsedStepSeconds(step);
  qs('timer').textContent = formatSeconds(elapsed);
  if (step.pauseStartedAt) {
    qs('pauseStep').textContent = 'Resume timer';
    qs('pauseStep').classList.add('paused');
    qs('pauseStatus').textContent = 'Paused. This idle time will not count toward the step total.';
    qs('pauseStatus').classList.add('paused');
  } else {
    qs('pauseStep').textContent = 'Pause timer';
    qs('pauseStep').classList.remove('paused');
    qs('pauseStatus').textContent = `Running. Pauses used for this step: ${step.pauseCount || 0}.`;
    qs('pauseStatus').classList.remove('paused');
  }
}

function renderSuggestions(config) {
  const wrap = qs('suggestions');
  wrap.innerHTML = '';
  Object.entries(config.improvementNotes || {}).forEach(([id, text]) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.innerHTML = `<strong>Step ${escapeHtml(id)}</strong><p>${escapeHtml(text)}</p>`;
    const btn = document.createElement('button');
    btn.textContent = 'Mark as alternative to try next time';
    btn.addEventListener('click', async () => {
      const { otmConfig } = await getStore();
      const step = otmConfig.steps.find(s => s.id === id);
      if (step) {
        step.suggestedAlternative = text;
        step.activeTitle = `${step.title} | Alternative to try: ${text}`;
        await chrome.storage.local.set({ otmConfig });
        await render();
      }
    });
    div.appendChild(btn);
    wrap.appendChild(div);
  });
}

async function copyChatGPTReport() {
  const report = await buildReport();
  qs('exportBox').value = report;
  await navigator.clipboard.writeText(report);
}

async function downloadJson() {
  const data = await getStore();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oneal-time-management-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function buildReport() {
  const { otmConfig, otmActiveSession, otmSessions = [] } = await getStore();
  const session = otmActiveSession || otmSessions[0];
  const lines = [];
  lines.push('ChatGPT, please analyze this time-management workflow and help me reduce the total time without weakening security or skipping required job-application steps.');
  lines.push('');
  lines.push(`Extension: ${otmConfig.extensionName}`);
  lines.push(`Mode: ${session?.mode || 'none'}`);
  lines.push(`Manual current date/time: ${session?.manualDateTime || 'not provided'}`);
  lines.push(`Detected current date/time ISO: ${session?.detectedDateTime || new Date().toISOString()}`);
  lines.push(`Target page: ${otmConfig.targetUrl}`);
  lines.push('');
  lines.push('Important safety limits:');
  (otmConfig.limits || []).forEach(x => lines.push(`- ${x}`));
  lines.push('');
  lines.push('Timed steps:');
  if (session?.steps?.length) {
    session.steps.forEach(s => {
      lines.push(`- ${s.id}. ${s.title} | status=${s.status} | seconds=${s.elapsedSeconds ?? 'not finished'} | paused_seconds=${Math.round((s.pausedMs || 0) / 1000)} | pauses=${s.pauseCount || 0} | category=${s.category} | note=${s.note || ''} | alternative=${s.suggestedAlternative || ''}`);
    });
    lines.push('');
    lines.push(`Total finished time: ${formatSeconds(totalSessionSeconds(session))}`);
  } else {
    lines.push('- No session has been timed yet. Please review the configured workflow and suggest what to time first.');
  }
  lines.push('');
  lines.push('Improvement notes from hidden >> << notes:');
  Object.entries(otmConfig.improvementNotes || {}).forEach(([id, text]) => lines.push(`- Step ${id}: ${text}`));
  lines.push('');
  lines.push('Please return: 1) biggest time-wasters, 2) safer faster alternatives, 3) what should be condensed vs detailed, 4) a revised workflow, 5) what I should copy into my extension config next time.');
  return lines.join('\n');
}

function totalSessionSeconds(session) {
  return (session.steps || []).reduce((sum, s) => sum + (s.elapsedSeconds || 0), 0);
}

function formatSeconds(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
