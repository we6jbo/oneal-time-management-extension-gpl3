const qs = (id) => document.getElementById(id);
const stateKeys = ['otmConfig', 'otmActiveSession', 'otmSessions'];
init();
async function init() {
  await chrome.runtime.sendMessage({ type: 'ENSURE_DEFAULTS' });
  await populateHourCodes();
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
  qs('resetConfig').addEventListener('click', resetConfig);
  ['manualDate', 'hourCode', 'minute'].forEach(id => qs(id).addEventListener('change', updateDecodedHint));
  setNow();
  await render();
  setInterval(render, 1000);
}
async function populateHourCodes() {
  const { otmConfig } = await getStore();
  qs('hourCode').innerHTML = '';
  otmConfig.hourCodes.forEach((code, index) => {
    const opt = document.createElement('option');
    opt.value = String(index + 1);
    opt.textContent = `${code} = hour ${index + 1}`;
    qs('hourCode').appendChild(opt);
  });
}
function setNow() {
  const now = new Date();
  qs('manualDate').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  qs('hourCode').value = String(now.getHours() === 0 ? 24 : now.getHours());
  qs('minute').value = String(now.getMinutes()).padStart(2,'0');
  updateDecodedHint();
}
function selectedManualDateTime() {
  const date = qs('manualDate').value || new Date().toISOString().slice(0,10);
  const hourOneTo24 = Number(qs('hourCode').value || '1');
  const minute = Math.max(0, Math.min(59, Number(qs('minute').value || '0')));
  return { date, hourCode: currentHourCode(), hourNumber: hourOneTo24, minute, isoLike: `${date} ${String(hourOneTo24).padStart(2,'0')}:${String(minute).padStart(2,'0')}` };
}
function currentHourCode() {
  const sel = qs('hourCode');
  const idx = sel.selectedIndex;
  return idx >= 0 ? sel.options[idx].textContent.split(' = ')[0] : '';
}
function updateDecodedHint() {
  const t = selectedManualDateTime();
  qs('decodedTimeHint').textContent = `Manual session time: ${t.date}, hour code ${t.hourCode}, decoded hour ${t.hourNumber}, minute ${String(t.minute).padStart(2,'0')}.`;
}
async function getStore() { return await chrome.storage.local.get(stateKeys); }
async function startSession() {
  const { otmConfig } = await getStore();
  const mode = qs('mode').value;
  const session = { id: crypto.randomUUID(), mode, manualDateTime: selectedManualDateTime(), detectedDateTime: new Date().toISOString(), startedAt: Date.now(), currentIndex: 0, steps: otmConfig.steps.filter(s => mode === 'detailed' || s.condensed).map(s => ({ ...s, status: 'pending', startedAt: null, endedAt: null, elapsedSeconds: null, pausedMs: 0, pauseStartedAt: null, pauseCount: 0 })), endedAt: null };
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
  if (next) next.startedAt = Date.now(); else otmActiveSession.endedAt = Date.now();
  await chrome.storage.local.set({ otmActiveSession });
  if (otmActiveSession.endedAt) await archiveSession();
  await render();
}
async function endSession() {
  const { otmActiveSession } = await getStore();
  if (!otmActiveSession) return;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (step && !step.endedAt) finalizePauseForStep(step);
  otmActiveSession.endedAt = Date.now();
  await chrome.storage.local.set({ otmActiveSession });
  await archiveSession();
  await render();
}
async function archiveSession() {
  const { otmActiveSession, otmSessions = [] } = await getStore();
  if (!otmActiveSession) return;
  if (!otmSessions.some(s => s.id === otmActiveSession.id)) otmSessions.unshift(otmActiveSession);
  await chrome.storage.local.set({ otmSessions: otmSessions.slice(0, 30) });
}
async function resetSession() { await chrome.storage.local.remove('otmActiveSession'); await render(); }
async function resetConfig() { await chrome.runtime.sendMessage({ type: 'RESET_CONFIG' }); await populateHourCodes(); await render(); }
async function togglePause() {
  const { otmActiveSession } = await getStore();
  if (!otmActiveSession || otmActiveSession.endedAt) return;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (!step) return;
  if (step.pauseStartedAt) { step.pausedMs = (step.pausedMs || 0) + (Date.now() - step.pauseStartedAt); step.pauseStartedAt = null; }
  else { step.pauseStartedAt = Date.now(); step.pauseCount = (step.pauseCount || 0) + 1; }
  await chrome.storage.local.set({ otmActiveSession });
  await render();
}
function finalizePauseForStep(step) { if (step?.pauseStartedAt) { step.pausedMs = (step.pausedMs || 0) + (Date.now() - step.pauseStartedAt); step.pauseStartedAt = null; } }
function elapsedStepSeconds(step, now = Date.now()) { if (!step?.startedAt) return 0; const paused = (step.pausedMs || 0) + (step.pauseStartedAt ? now - step.pauseStartedAt : 0); return Math.max(0, Math.round((now - step.startedAt - paused) / 1000)); }
async function render() {
  const { otmConfig, otmActiveSession } = await getStore();
  renderSuggestions(otmConfig); renderProgress(otmActiveSession); updateDecodedHint();
  if (!otmActiveSession) { qs('currentStep').textContent = 'No session running.'; qs('timer').textContent = '00:00:00'; qs('pauseStep').textContent = 'Pause timer'; qs('pauseStep').classList.remove('paused'); qs('pauseStatus').textContent = 'Timer is running when a session is active.'; qs('pauseStatus').classList.remove('paused'); return; }
  qs('mode').value = otmActiveSession.mode;
  const step = otmActiveSession.steps[otmActiveSession.currentIndex];
  if (!step) { qs('currentStep').textContent = 'Session complete.'; qs('timer').textContent = formatSeconds(totalSessionSeconds(otmActiveSession)); qs('pauseStatus').textContent = 'Session complete. Paused time is excluded from step totals.'; return; }
  qs('currentStep').textContent = `${step.id}. ${step.activeTitle || step.title}`;
  qs('timer').textContent = formatSeconds(elapsedStepSeconds(step));
  if (step.pauseStartedAt) { qs('pauseStep').textContent = 'Resume timer'; qs('pauseStep').classList.add('paused'); qs('pauseStatus').textContent = 'Paused. This idle time will not count toward the step total.'; qs('pauseStatus').classList.add('paused'); }
  else { qs('pauseStep').textContent = 'Pause timer'; qs('pauseStep').classList.remove('paused'); qs('pauseStatus').textContent = `Running. Pauses used for this step: ${step.pauseCount || 0}.`; qs('pauseStatus').classList.remove('paused'); }
}
function renderProgress(session) {
  const wrap = qs('progressList'); wrap.innerHTML = '';
  if (!session) { wrap.textContent = 'No active progress yet.'; return; }
  session.steps.forEach((s, i) => { const div = document.createElement('div'); div.className = 'progressItem'; const seconds = s.elapsedSeconds ?? (i === session.currentIndex ? elapsedStepSeconds(s) : 0); div.innerHTML = `<strong>${escapeHtml(s.id)}</strong><span>${escapeHtml(s.title)}</span><span>${s.status === 'pending' && i !== session.currentIndex ? 'pending' : formatSeconds(seconds)}</span>`; wrap.appendChild(div); });
}
function renderSuggestions(config) {
  const wrap = qs('suggestions'); wrap.innerHTML = '';
  Object.entries(config.improvementNotes || {}).forEach(([id, text]) => { const div = document.createElement('div'); div.className = 'suggestion'; div.innerHTML = `<strong>Step ${escapeHtml(id)}</strong><p>${escapeHtml(text)}</p>`; const btn = document.createElement('button'); btn.textContent = 'Use as alternative note next time'; btn.addEventListener('click', async () => { const { otmConfig } = await getStore(); const step = otmConfig.steps.find(s => s.id === id); if (step) { step.suggestedAlternative = text; step.activeTitle = `${step.title} | Alternative to try: ${text}`; await chrome.storage.local.set({ otmConfig }); await render(); } }); div.appendChild(btn); wrap.appendChild(div); });
}
async function copyChatGPTReport() { const report = await buildReport(); qs('exportBox').value = report; await navigator.clipboard.writeText(report); }
async function downloadJson() { const data = await getStore(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `oneal-time-management-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); }
async function buildReport() {
  const { otmConfig, otmActiveSession, otmSessions = [] } = await getStore();
  const session = otmActiveSession || otmSessions[0];
  const lines = [];
  lines.push('ChatGPT, please analyze this Fall 2026 time-management workflow and help me reduce the total time without weakening security or skipping required job-application steps.');
  lines.push(''); lines.push(`Extension: ${otmConfig.extensionName}`); lines.push(`Mode: ${session?.mode === 'detailed' ? 'Detailed: every step timed' : 'Core timed steps only'}`);
  if (session?.manualDateTime) lines.push(`Manual date/time: ${session.manualDateTime.date}, hour code ${session.manualDateTime.hourCode}, decoded hour ${session.manualDateTime.hourNumber}, minute ${String(session.manualDateTime.minute).padStart(2,'0')}`);
  lines.push(`Detected current date/time ISO: ${session?.detectedDateTime || new Date().toISOString()}`); lines.push(`Target page opened on install: ${otmConfig.targetUrl}`); lines.push(''); lines.push('Timed steps:');
  if (!session) lines.push('No session data yet.');
  else session.steps.forEach((s, idx) => { const seconds = s.elapsedSeconds ?? (idx === session.currentIndex ? elapsedStepSeconds(s) : 0); lines.push(`${s.id}) ${s.title} | status=${s.status}${idx === session.currentIndex ? ' current' : ''} | time=${formatSeconds(seconds)} | paused=${Math.round((s.pausedMs || 0)/1000)}s | pause_count=${s.pauseCount || 0}${s.suggestedAlternative ? ' | alternative=' + s.suggestedAlternative : ''}`); });
  lines.push(''); lines.push('Hidden speed-up notes converted into safe suggestions:'); Object.entries(otmConfig.improvementNotes || {}).forEach(([id, text]) => lines.push(`${id}: ${text}`)); lines.push(''); lines.push('Please identify bottlenecks, tasks that can be prepared beforehand, tasks that can be merged, and safer alternatives for authentication or note capture.');
  return lines.join('\n');
}
function totalSessionSeconds(session) { return session.steps.reduce((sum, s) => sum + (s.elapsedSeconds || 0), 0); }
function formatSeconds(total) { total = Math.max(0, Math.round(total || 0)); const h=String(Math.floor(total/3600)).padStart(2,'0'); const m=String(Math.floor((total%3600)/60)).padStart(2,'0'); const s=String(total%60).padStart(2,'0'); return `${h}:${m}:${s}`; }
function escapeHtml(str) { return String(str ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }