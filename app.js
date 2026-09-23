/**
 * YouTube Automation Control Center - Client Application
 * Connects directly to GitHub REST API to monitor and dispatch cloud pipelines.
 */

// Default Configuration
const CONFIG = {
  DEFAULT_REPO: 'Pratheesh2005/YT-Automation',
  REPO_CH3: 'Pratheesh2005/YT-Automation-3',
  DEFAULT_TOKEN: '',
  WORKFLOW_CH1: 'daily_shorts.yml',
  WORKFLOW_CH2: 'daily_shorts_wonderpeak.yml',
  WORKFLOW_CH3: 'daily_shorts.yml',
  WORKFLOW_HEARTBEAT: 'gemini_keepalive.yml',
  DEFAULT_POLL_INTERVAL: 15
};

// Check URL parameters for one-click setup (e.g. ?token=gho_... on mobile/Pages)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('token')) {
  localStorage.setItem('yt_token', urlParams.get('token'));
  // Clean URL to keep token private in browser address bar
  window.history.replaceState({}, document.title, window.location.pathname);
}

// State Store
const state = {
  repo: localStorage.getItem('yt_repo') || CONFIG.DEFAULT_REPO,
  token: localStorage.getItem('yt_token') || CONFIG.DEFAULT_TOKEN,
  pollInterval: parseInt(localStorage.getItem('yt_poll_interval') || CONFIG.DEFAULT_POLL_INTERVAL),
  isCh1Running: false,
  isCh2Running: false,
  isCh3Running: false,
  timerId: null
};

// DOM Elements
const el = {
  globalStatus: document.getElementById('globalCloudStatus'),
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  lastUpdatedText: document.getElementById('lastUpdatedText'),
  
  // Channel 1 Elements
  ch1StatusPill: document.getElementById('ch1StatusPill'),
  ch1VideoTitle: document.getElementById('ch1VideoTitle'),
  ch1CreationStatus: document.getElementById('ch1CreationStatus'),
  ch1PublishDate: document.getElementById('ch1PublishDate'),
  ch1YtLink: document.getElementById('ch1YtLink'),
  triggerCh1Btn: document.getElementById('triggerCh1Btn'),
  ch1BtnText: document.getElementById('ch1BtnText'),
  ch1Steps: document.getElementById('ch1Steps'),

  // Channel 2 Elements
  ch2StatusPill: document.getElementById('ch2StatusPill'),
  ch2VideoTitle: document.getElementById('ch2VideoTitle'),
  ch2CreationStatus: document.getElementById('ch2CreationStatus'),
  ch2PublishDate: document.getElementById('ch2PublishDate'),
  ch2YtLink: document.getElementById('ch2YtLink'),
  triggerCh2Btn: document.getElementById('triggerCh2Btn'),
  ch2BtnText: document.getElementById('ch2BtnText'),
  ch2Steps: document.getElementById('ch2Steps'),

  // Channel 3 Elements
  ch3StatusPill: document.getElementById('ch3StatusPill'),
  ch3VideoTitle: document.getElementById('ch3VideoTitle'),
  ch3CreationStatus: document.getElementById('ch3CreationStatus'),
  ch3PublishDate: document.getElementById('ch3PublishDate'),
  ch3YtLink: document.getElementById('ch3YtLink'),
  triggerCh3Btn: document.getElementById('triggerCh3Btn'),
  ch3BtnText: document.getElementById('ch3BtnText'),
  ch3Steps: document.getElementById('ch3Steps'),

  // Bottom Panel
  runsTableBody: document.getElementById('runsTableBody'),
  runsCount: document.getElementById('runsCount'),
  hbStatusText: document.getElementById('hbStatusText'),
  triggerHbBtn: document.getElementById('triggerHbBtn'),

  // Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  repoInput: document.getElementById('repoInput'),
  tokenInput: document.getElementById('tokenInput'),
  pollIntervalInput: document.getElementById('pollIntervalInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn')
};

// ==========================================================================
// GitHub API Helpers
// ==========================================================================
async function githubApi(endpoint, options = {}, customRepo = null) {
  const repo = customRepo || state.repo;
  const url = `https://api.github.com/repos/${repo}/${endpoint}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API Error (${response.status}): ${errorText}`);
  }

  // Some endpoints (like workflow dispatch) return 204 No Content
  if (response.status === 204) return null;
  return await response.json();
}

// Fetch a file content from repository (decodes base64)
async function fetchRepoFile(path, customRepo = null) {
  try {
    const data = await githubApi(`contents/${path}?ref=main&t=${Date.now()}`, {}, customRepo);
    if (data && data.content) {
      const decoded = atob(data.content.replace(/\s/g, ''));
      return JSON.parse(decoded);
    }
  } catch (err) {
    console.warn(`Could not load repo file ${path}:`, err.message);
  }
  return null;
}

// ==========================================================================
// Pipeline Triggers
// ==========================================================================
async function triggerWorkflow(workflowFile, channelNum, btnElement, textElement) {
  try {
    btnElement.disabled = true;
    textElement.innerHTML = `<span class="spinner"></span> Dispatching to GitHub Cloud...`;

    const targetRepo = (channelNum === 3) ? CONFIG.REPO_CH3 : state.repo;
    const payload = { ref: 'main' };
    if (channelNum === 1) {
      payload.inputs = { channel: '1' };
    } else if (channelNum === 2) {
      payload.inputs = { channel: '2' };
    }

    await githubApi(`actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }, targetRepo);

    textElement.innerHTML = `✅ Dispatched! Cloud runner starting...`;
    
    // Poll quickly for the next 30 seconds to catch the new run
    setTimeout(refreshDashboard, 3000);
    setTimeout(refreshDashboard, 8000);
    setTimeout(refreshDashboard, 15000);
  } catch (err) {
    console.error('Dispatch failed:', err);
    alert(`Failed to trigger workflow: ${err.message}`);
    btnElement.disabled = false;
    textElement.textContent = channelNum === 1 ? 'Generate Channel 1 (Black Pearl)' : (channelNum === 2 ? 'Generate Channel 2 (WonderPeak)' : 'Generate Channel 3 (NeuroByte)');
  }
}

// ==========================================================================
// Update Channel Cards & Status
// ==========================================================================
async function updateChannelCards() {
  // 1. Fetch Channel 1 data (Queue & History)
  const qCh1 = await fetchRepoFile('scheduled_queue.json');
  const histCh1 = await fetchRepoFile('topic_history.json');

  if (qCh1 && qCh1.length > 0) {
    const item = qCh1[qCh1.length - 1];
    el.ch1VideoTitle.textContent = item.title || 'Untitled Video';
    el.ch1CreationStatus.textContent = 'Status: Video Created & Scheduled';
    el.ch1PublishDate.textContent = `Scheduled: ${item.scheduled_display || item.date || 'Today'}`;
    if (item.youtube_url) {
      el.ch1YtLink.href = item.youtube_url;
      el.ch1YtLink.style.display = 'inline-flex';
    } else {
      el.ch1YtLink.style.display = 'none';
    }
  } else if (histCh1 && histCh1.length > 0) {
    const item = histCh1[histCh1.length - 1];
    el.ch1VideoTitle.textContent = item.title || item.core_concept || 'Mystery Short';
    el.ch1CreationStatus.textContent = 'Status: Video Created';
    el.ch1PublishDate.textContent = `Date: ${item.date || 'Recent'}`;
    el.ch1YtLink.style.display = 'none';
  }

  // 2. Fetch Channel 2 data (Queue & History)
  const qCh2 = await fetchRepoFile('scheduled_queue_ch2.json');
  const histCh2 = await fetchRepoFile('topic_history_ch2.json');

  if (qCh2 && qCh2.length > 0) {
    const item = qCh2[qCh2.length - 1];
    el.ch2VideoTitle.textContent = item.title || 'Untitled Video';
    el.ch2CreationStatus.textContent = 'Status: Video Created & Scheduled';
    el.ch2PublishDate.textContent = `Scheduled: ${item.scheduled_display || item.date || 'Today'}`;
    if (item.youtube_url) {
      el.ch2YtLink.href = item.youtube_url;
      el.ch2YtLink.style.display = 'inline-flex';
    } else {
      el.ch2YtLink.style.display = 'none';
    }
  } else if (histCh2 && histCh2.length > 0) {
    const item = histCh2[histCh2.length - 1];
    el.ch2VideoTitle.textContent = item.title || item.core_concept || 'WonderPeak Short';
    el.ch2CreationStatus.textContent = 'Status: Video Created';
    el.ch2PublishDate.textContent = `Date: ${item.date || 'Recent'}`;
    el.ch2YtLink.style.display = 'none';
  }

  // 3. Fetch Channel 3 data (Queue & History from REPO_CH3)
  const qCh3 = await fetchRepoFile('scheduled_queue.json', CONFIG.REPO_CH3);
  const histCh3 = await fetchRepoFile('topic_history.json', CONFIG.REPO_CH3);

  if (qCh3 && qCh3.length > 0) {
    const item = qCh3[qCh3.length - 1];
    el.ch3VideoTitle.textContent = item.title || 'Untitled Video';
    el.ch3CreationStatus.textContent = 'Status: Video Created & Scheduled';
    el.ch3PublishDate.textContent = `Release: ${item.scheduled_ist || '07:30 PM IST'}`;
    if (item.video_id) {
      el.ch3YtLink.href = `https://youtu.be/${item.video_id}`;
      el.ch3YtLink.style.display = 'inline-flex';
    } else {
      el.ch3YtLink.style.display = 'none';
    }
  } else if (histCh3 && histCh3.length > 0) {
    const item = histCh3[histCh3.length - 1];
    el.ch3VideoTitle.textContent = typeof item === 'string' ? item : (item.title || 'Tech & AI Short');
    el.ch3CreationStatus.textContent = 'Status: Video Ready';
    el.ch3PublishDate.textContent = 'Release: 07:30 PM IST';
    el.ch3YtLink.style.display = 'none';
  }
}

// ==========================================================================
// Update Workflow Runs & Live Pipeline Steps
// ==========================================================================
async function updateWorkflowRuns() {
  try {
    const data = await githubApi('actions/runs?per_page=12');
    const runs = data.workflow_runs || [];

    // Filter latest runs
    const ch1Run = runs.find(r => r.path && r.path.includes(CONFIG.WORKFLOW_CH1));
    const ch2Run = runs.find(r => r.path && r.path.includes(CONFIG.WORKFLOW_CH2));
    const hbRun = runs.find(r => r.path && r.path.includes(CONFIG.WORKFLOW_HEARTBEAT));

    // Update Channel 1 State
    handleChannelRunState(ch1Run, 1, el.ch1StatusPill, el.triggerCh1Btn, el.ch1BtnText, el.ch1Steps);

    // Update Channel 2 State
    handleChannelRunState(ch2Run, 2, el.ch2StatusPill, el.triggerCh2Btn, el.ch2BtnText, el.ch2Steps);

    // Fetch and Update Channel 3 State (from REPO_CH3)
    let ch3Run = null;
    try {
      const dataCh3 = await githubApi('actions/runs?per_page=5', {}, CONFIG.REPO_CH3);
      const runsCh3 = dataCh3.workflow_runs || [];
      ch3Run = runsCh3.find(r => r.path && r.path.includes(CONFIG.WORKFLOW_CH3));
    } catch (e) {
      console.warn('Could not fetch Ch3 runs:', e.message);
    }
    handleChannelRunState(ch3Run, 3, el.ch3StatusPill, el.triggerCh3Btn, el.ch3BtnText, el.ch3Steps);

    // Update Heartbeat State
    if (hbRun) {
      if (hbRun.status === 'in_progress' || hbRun.status === 'queued') {
        el.hbStatusText.textContent = 'Renewing...';
        el.hbStatusText.style.color = '#f59e0b';
      } else if (hbRun.conclusion === 'success') {
        el.hbStatusText.textContent = 'Healthy';
        el.hbStatusText.style.color = '#10b981';
      } else {
        el.hbStatusText.textContent = 'Attention Needed';
        el.hbStatusText.style.color = '#ef4444';
      }
    }

    // Render Recent Runs Table
    renderRunsTable(runs.slice(0, 7));

    // Global Cloud Status
    const anyRunning = runs.some(r => r.status === 'in_progress');
    if (anyRunning) {
      el.globalStatus.textContent = 'Pipeline Running in Cloud';
      el.globalStatus.parentElement.style.color = '#fbbf24';
      el.globalStatus.parentElement.style.background = 'rgba(245, 158, 11, 0.12)';
      el.globalStatus.parentElement.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    } else {
      el.globalStatus.textContent = 'Cloud Engine Ready';
      el.globalStatus.parentElement.style.color = '#34d399';
      el.globalStatus.parentElement.style.background = 'rgba(16, 185, 129, 0.1)';
      el.globalStatus.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.25)';
    }

  } catch (err) {
    console.error('Error fetching runs:', err);
    el.globalStatus.textContent = 'Token Expired — Click ⚙️ to Connect';
    el.globalStatus.parentElement.style.cursor = 'pointer';
    el.globalStatus.parentElement.onclick = () => { el.settingsModal.classList.add('open'); };
    el.globalStatus.parentElement.style.color = '#f87171';
    el.globalStatus.parentElement.style.background = 'rgba(239, 68, 68, 0.12)';
    el.globalStatus.parentElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  }
}

// Handle Run State for a Specific Channel
function handleChannelRunState(run, channelNum, pillElement, btnElement, btnTextElement, stepsContainer) {
  const stepElements = stepsContainer.querySelectorAll('.step-item');

  if (!run) {
    pillElement.textContent = 'Ready';
    pillElement.className = 'status-pill idle';
    btnElement.disabled = false;
    btnTextElement.textContent = channelNum === 1 ? 'Generate Channel 1 (Black Pearl)' : (channelNum === 2 ? 'Generate Channel 2 (WonderPeak)' : 'Generate Channel 3 (NeuroByte)');
    resetSteps(stepElements);
    return;
  }

  const isRunning = run.status === 'in_progress' || run.status === 'queued';

  if (isRunning) {
    pillElement.textContent = run.status === 'queued' ? 'Queued' : 'Rendering in Cloud';
    pillElement.className = 'status-pill running';
    btnElement.disabled = true;
    btnTextElement.innerHTML = `<span class="spinner"></span> Running on Cloud (${formatTimeAgo(run.run_started_at)})`;

    // Fetch jobs to detect active step
    fetchRunStepDetails(run.id, stepElements);
  } else {
    btnElement.disabled = false;
    btnTextElement.textContent = channelNum === 1 ? 'Generate Channel 1 (Black Pearl)' : (channelNum === 2 ? 'Generate Channel 2 (WonderPeak)' : 'Generate Channel 3 (NeuroByte)');

    if (run.conclusion === 'success') {
      pillElement.textContent = 'Completed & Published';
      pillElement.className = 'status-pill published';
      markAllStepsCompleted(stepElements);
    } else if (run.conclusion === 'failure') {
      pillElement.textContent = 'Failed (Check Logs)';
      pillElement.className = 'status-pill idle';
      pillElement.style.color = '#f87171';
      pillElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      resetSteps(stepElements);
    } else {
      pillElement.textContent = run.conclusion || 'Idle';
      pillElement.className = 'status-pill idle';
      resetSteps(stepElements);
    }
  }
}

// Check job step progress for active workflow
async function fetchRunStepDetails(runId, stepElements) {
  try {
    const data = await githubApi(`actions/runs/${runId}/jobs`);
    if (data && data.jobs && data.jobs[0] && data.jobs[0].steps) {
      const steps = data.jobs[0].steps;
      
      // Map steps to 1..5
      resetSteps(stepElements);
      
      // If the main generation step is running, estimate or highlight
      const genStep = steps.find(s => s.name && s.name.includes('Run Video Generator'));
      if (genStep) {
        if (genStep.status === 'in_progress') {
          // Highlight steps 1, 2, 3 as active
          highlightStep(stepElements, 3);
        } else if (genStep.status === 'completed') {
          markAllStepsCompleted(stepElements);
        }
      }
    }
  } catch (err) {
    // Non-critical
  }
}

function resetSteps(stepElements) {
  stepElements.forEach(s => {
    s.classList.remove('active', 'completed');
  });
}

function highlightStep(stepElements, stepNum) {
  stepElements.forEach((s, idx) => {
    const current = idx + 1;
    if (current < stepNum) {
      s.classList.add('completed');
      s.classList.remove('active');
    } else if (current === stepNum) {
      s.classList.add('active');
      s.classList.remove('completed');
    } else {
      s.classList.remove('active', 'completed');
    }
  });
}

function markAllStepsCompleted(stepElements) {
  stepElements.forEach(s => {
    s.classList.add('completed');
    s.classList.remove('active');
  });
}

// Render Runs Table
function renderRunsTable(runs) {
  if (!runs || runs.length === 0) {
    el.runsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No recent runs found.</td></tr>';
    return;
  }

  el.runsCount.textContent = `${runs.length} Recent Runs`;
  el.runsTableBody.innerHTML = runs.map(run => {
    const isSuccess = run.conclusion === 'success';
    const isRunning = run.status === 'in_progress' || run.status === 'queued';
    const badgeClass = isRunning ? 'in_progress' : (isSuccess ? 'success' : 'failure');
    const badgeLabel = isRunning ? (run.status === 'queued' ? 'Queued' : 'Running') : (run.conclusion || 'Done');

    const duration = formatDuration(run.run_started_at, run.updated_at, isRunning);
    const workflowName = run.name.replace('Daily YouTube Shorts Automation Engine', 'CH1 Black Pearl')
                                 .replace('Daily WonderPeak Shorts Automation Engine', 'CH2 WonderPeak')
                                 .replace('Gemini Session Cloud Heartbeat (Auto-Renew)', 'Cloud Heartbeat');

    return `
      <tr>
        <td style="font-weight: 600; color: #f1f5f9;">${workflowName}</td>
        <td><span class="run-badge ${badgeClass}">${badgeLabel}</span></td>
        <td>${formatTimeAgo(run.created_at)}</td>
        <td>${duration}</td>
        <td>
          <a href="${run.html_url}" target="_blank" class="run-link">View Logs &rarr;</a>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// Time & Formatting Helpers
// ==========================================================================
function formatTimeAgo(isoString) {
  if (!isoString) return '--';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

function formatDuration(startIso, endIso, isRunning) {
  if (!startIso) return '--';
  const start = new Date(startIso).getTime();
  const end = isRunning ? Date.now() : new Date(endIso).getTime();
  const totalSec = Math.max(0, Math.floor((end - start) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec < 10 ? '0' : ''}${sec}s`;
}

// ==========================================================================
// Master Refresh Loop
// ==========================================================================
async function refreshDashboard() {
  el.refreshBtn.classList.add('loading');
  try {
    await Promise.all([
      updateChannelCards(),
      updateWorkflowRuns()
    ]);
    el.lastUpdatedText.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error('Refresh error:', err);
  } finally {
    el.refreshBtn.classList.remove('loading');
  }
}

function startPolling() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(refreshDashboard, state.pollInterval * 1000);
}

// ==========================================================================
// Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ─── Password Protection ────────────────────────────────────────────────
  const CORRECT_PASSWORD = '1974';
  const SESSION_KEY      = 'yt_unlocked';
  const overlay          = document.getElementById('passwordOverlay');
  const pwInput          = document.getElementById('pwInput');
  const pwError          = document.getElementById('pwError');
  const pwSubmitBtn      = document.getElementById('pwSubmitBtn');

  function unlockDashboard() {
    sessionStorage.setItem(SESSION_KEY, '1');
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 420);
    // Start dashboard only after unlock
    initDashboard();
  }

  function tryPassword() {
    if (pwInput.value === CORRECT_PASSWORD) {
      unlockDashboard();
    } else {
      pwError.classList.add('visible');
      pwInput.classList.add('shake');
      pwInput.value = '';
      setTimeout(() => { pwInput.classList.remove('shake'); }, 420);
      pwInput.focus();
    }
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    // Already unlocked this browser session
    overlay.style.display = 'none';
    initDashboard();
  } else {
    pwSubmitBtn.addEventListener('click', tryPassword);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryPassword(); });
    pwInput.focus();
  }
  // ────────────────────────────────────────────────────────────────────────
});

// ==========================================================================
// Dashboard init — runs only after password unlock
// ==========================================================================
function initDashboard() {
  // Pre-fill inputs
  el.repoInput.value = state.repo;
  el.tokenInput.value = state.token;
  el.pollIntervalInput.value = state.pollInterval;

  // Initial Load
  refreshDashboard();
  startPolling();

  // Button Listeners
  el.refreshBtn.addEventListener('click', refreshDashboard);

  el.triggerCh1Btn.addEventListener('click', () => {
    if (confirm('Start Daily Video Generation for Channel 1 (Black Pearl)?')) {
      triggerWorkflow(CONFIG.WORKFLOW_CH1, 1, el.triggerCh1Btn, el.ch1BtnText);
    }
  });

  el.triggerCh2Btn.addEventListener('click', () => {
    if (confirm('Start Daily Video Generation for Channel 2 (WonderPeak)?')) {
      triggerWorkflow(CONFIG.WORKFLOW_CH2, 2, el.triggerCh2Btn, el.ch2BtnText);
    }
  });

  el.triggerCh3Btn.addEventListener('click', () => {
    if (confirm('Start Daily Video Generation for Channel 3 (NeuroByte)?')) {
      triggerWorkflow(CONFIG.WORKFLOW_CH3, 3, el.triggerCh3Btn, el.ch3BtnText);
    }
  });

  el.triggerHbBtn.addEventListener('click', () => {
    if (confirm('Trigger Gemini Cloud Session Heartbeat now?')) {
      triggerWorkflow(CONFIG.WORKFLOW_HEARTBEAT, 0, el.triggerHbBtn, el.triggerHbBtn);
    }
  });

  // Settings Modal
  el.settingsBtn.addEventListener('click', () => {
    el.settingsModal.classList.add('open');
  });

  el.closeSettingsBtn.addEventListener('click', () => {
    el.settingsModal.classList.remove('open');
  });

  el.saveSettingsBtn.addEventListener('click', () => {
    const newRepo     = el.repoInput.value.trim();
    const newToken    = el.tokenInput.value.trim();
    const newInterval = parseInt(el.pollIntervalInput.value) || 15;

    state.repo         = newRepo;
    state.token        = newToken;
    state.pollInterval = newInterval;

    localStorage.setItem('yt_repo', newRepo);
    localStorage.setItem('yt_token', newToken);
    localStorage.setItem('yt_poll_interval', newInterval);

    el.settingsModal.classList.remove('open');
    refreshDashboard();
    startPolling();
  });
}
