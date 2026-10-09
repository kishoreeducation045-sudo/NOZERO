/**
 * REAL-LIFE DUNGEON MASTER — CORE FRONTEND CONTROLLER
 * Connects directly to FastAPI Async Daemon API
 */

const API_BASE = window.location.origin;

// Application State
const state = {
  token: localStorage.getItem('dm_access_token') || '',
  user: null,
  score: 50,
  dailyScore: null,
  goals: [],
  schedule: [],
  analytics: null,
  scoreEvents: [],
  isRecording: false,
  recognition: null,
};

// ── Audio Synthesizer (Zero external audio files required) ──
const soundFx = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playLevelUp() {
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) { }
  },
  playChime() {
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) { }
  }
};

// ── API Fetch Helper ──
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Invalid/expired token
      if (endpoint !== '/api/v1/auth/login' && endpoint !== '/api/v1/auth/register') {
        console.warn('Unauthorized, logging in demo adventurer...');
        await autoDemoLogin();
        return api(endpoint, options);
      }
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || `HTTP Error ${res.status}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// ── Authentication & Demo Login ──
async function autoDemoLogin() {
  try {
    const demoPayload = {
      email: 'adventurer@questlog.dm',
      name: 'Hero of the Realm',
      password: 'CampaignPassword2026!',
      timezone: 'UTC',
    };

    // Try login first
    try {
      const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoPayload.email, password: demoPayload.password }),
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        state.token = data.access_token;
        state.user = data.user;
        localStorage.setItem('dm_access_token', state.token);
        return;
      }
    } catch (e) {}

    // Otherwise register
    const regRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demoPayload),
    });
    if (regRes.ok) {
      const data = await regRes.json();
      state.token = data.access_token;
      state.user = data.user;
      localStorage.setItem('dm_access_token', state.token);
    }
  } catch (e) {
    console.error('Demo login error:', e);
  }
}

// ── Refresh App Data ──
async function refreshAll() {
  try {
    if (!state.token) {
      await autoDemoLogin();
    }

    const [userRes, scoreRes, goalsRes, schedRes, eventsRes, analyticsRes] = await Promise.allSettled([
      api('/api/v1/auth/me'),
      api('/api/v1/score/today'),
      api('/api/v1/goals'),
      api('/api/v1/schedule/today'),
      api('/api/v1/score/events'),
      api('/api/v1/analytics/today'),
    ]);

    if (userRes.status === 'fulfilled') {
      state.user = userRes.value;
      document.getElementById('heroName').textContent = state.user.name;
    }

    if (scoreRes.status === 'fulfilled') {
      state.dailyScore = scoreRes.value;
      state.score = state.dailyScore.score;
      updateScoreUI();
    }

    if (goalsRes.status === 'fulfilled') {
      state.goals = goalsRes.value;
      renderQuests();
    }

    if (schedRes.status === 'fulfilled') {
      state.schedule = schedRes.value;
      renderSchedule();
    }

    if (eventsRes.status === 'fulfilled') {
      state.scoreEvents = eventsRes.value;
      renderScoreEvents();
    }

    if (analyticsRes.status === 'fulfilled') {
      state.analytics = analyticsRes.value;
      renderAnalytics();
    }
  } catch (err) {
    showToast(`Failed to load data: ${err.message}`);
  }
}

// ── Score & XP Rendering ──
function updateScoreUI() {
  const scoreVal = state.score || 50;
  document.getElementById('scoreDisplay').textContent = scoreVal;
  document.getElementById('topScoreBadge').textContent = scoreVal;

  // Update SVG circular gauge (Circumference = 2 * PI * 60 ≈ 377)
  const maxDash = 377;
  const offset = maxDash - (scoreVal / 100) * maxDash;
  const gaugeEl = document.getElementById('gaugeProgress');
  if (gaugeEl) {
    gaugeEl.style.strokeDashoffset = offset;
  }

  // XP level calculation (Level = floor(Score / 20) + 1)
  const level = Math.floor(scoreVal / 20) + 1;
  const levelXp = (scoreVal % 20) * 5; // 0 to 100%
  document.getElementById('heroLevel').textContent = `Level ${level} Paladin`;
  document.getElementById('xpProgress').textContent = `${levelXp}%`;
  document.getElementById('xpFill').style.width = `${levelXp}%`;

  if (state.dailyScore) {
    const prodMin = Math.round(state.dailyScore.productive_seconds / 60);
    const distMin = Math.round(state.dailyScore.distracting_seconds / 60);
    document.getElementById('prodTimeMini').textContent = `${prodMin}m`;
    document.getElementById('distractTimeMini').textContent = `${distMin}m`;
  }
}

// ── Quest Management Rendering ──
function renderQuests() {
  const listEl = document.getElementById('questList');
  if (!listEl) return;

  if (state.goals.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 2rem 1rem; color: var(--text-dim); font-size: 0.88rem;">
        ⚔️ No active quests! Speak to the Dungeon Master or click "New Quest" to begin your campaign.
      </div>`;
    return;
  }

  listEl.innerHTML = state.goals
    .map((g) => {
      const isDone = g.status === 'completed';
      const prio = g.priority || 'medium';
      const mins = g.estimated_minutes || Math.round((g.target_duration_seconds || 0) / 60) || 30;

      return `
      <div class="quest-item ${isDone ? 'completed' : ''}" data-id="${g.id}">
        <div class="quest-left">
          <button class="quest-checkbox ${isDone ? 'checked' : ''}" onclick="toggleQuestComplete('${g.id}', ${isDone})">
            ${isDone ? '✓' : ''}
          </button>
          <div>
            <div class="quest-title-text" style="${isDone ? 'text-decoration: line-through;' : ''}">${escapeHtml(g.title)}</div>
            <div class="quest-meta-row">
              <span class="badge-prio ${prio}">${prio}</span>
              <span>⏳ ${mins}m</span>
              <span>🏷️ ${escapeHtml(g.category || 'Quest')}</span>
            </div>
          </div>
        </div>
        <div class="quest-actions">
          <button class="btn-icon-action" title="Delete Quest" onclick="deleteQuest('${g.id}')">🗑️</button>
        </div>
      </div>
    `;
    })
    .join('');
}

// ── Schedule Rendering ──
function renderSchedule() {
  const schedEl = document.getElementById('timelineList');
  if (!schedEl) return;

  if (state.schedule.length === 0) {
    schedEl.innerHTML = `
      <div style="text-align:center; padding: 1.5rem 1rem; color: var(--text-dim); font-size: 0.85rem;">
        📅 No schedule items today. Click <strong>Generate Schedule</strong> to let the AI organize your day!
      </div>`;
    return;
  }

  schedEl.innerHTML = state.schedule
    .map((item) => {
      const start = new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const end = new Date(item.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isDone = item.status === 'completed';

      return `
      <div class="timeline-item">
        <div class="timeline-time-col">${start} - ${end}</div>
        <div class="timeline-block" style="${isDone ? 'opacity: 0.6; border-left-color: var(--accent-emerald);' : ''}">
          <div class="timeline-block-title">${escapeHtml(item.title)}</div>
          ${item.reason ? `<div class="timeline-block-reason">⚡ ${escapeHtml(item.reason)}</div>` : ''}
        </div>
      </div>
    `;
    })
    .join('');
}

// ── Score Ledger Rendering ──
function renderScoreEvents() {
  const ledgerEl = document.getElementById('ledgerList');
  if (!ledgerEl) return;

  if (state.scoreEvents.length === 0) {
    ledgerEl.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 1rem;">No score events yet today.</div>`;
    return;
  }

  ledgerEl.innerHTML = state.scoreEvents
    .slice(0, 8)
    .map((e) => {
      const isPos = e.points >= 0;
      return `
      <div class="ledger-item">
        <div>
          <div style="font-weight: 600; color: var(--text-highlight); font-size: 0.82rem;">${escapeHtml(e.reason)}</div>
          <div style="font-size: 0.7rem; color: var(--text-dim);">${escapeHtml(e.event_type)}</div>
        </div>
        <div class="ledger-points ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${e.points} pts</div>
      </div>
    `;
    })
    .join('');
}

// ── Analytics Rendering ──
function renderAnalytics() {
  if (!state.analytics) return;
  const { top_apps, best_focus_start, best_focus_end } = state.analytics;

  const bannerEl = document.getElementById('focusBanner');
  if (bannerEl) {
    if (best_focus_start && best_focus_end) {
      bannerEl.innerHTML = `🌟 <strong>Peak Flow State:</strong> ${best_focus_start} – ${best_focus_end}`;
      bannerEl.style.display = 'block';
    } else {
      bannerEl.style.display = 'none';
    }
  }

  const topAppsList = document.getElementById('topAppsList');
  if (topAppsList && top_apps && top_apps.length > 0) {
    topAppsList.innerHTML = top_apps
      .slice(0, 4)
      .map((a) => {
        const mins = Math.round(a.seconds / 60);
        return `
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <span>💻 ${escapeHtml(a.application)}</span>
          <span style="font-weight:600; color:var(--accent-secondary);">${mins}m</span>
        </div>`;
      })
      .join('');
  }
}

// ── Quest Actions ──
async function toggleQuestComplete(goalId, currentlyCompleted) {
  if (currentlyCompleted) return;
  try {
    await api(`/api/v1/goals/${goalId}/complete`, { method: 'POST' });
    soundFx.playLevelUp();
    showToast('🏆 Quest completed! XP & Score points awarded!');
    await refreshAll();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function deleteQuest(goalId) {
  try {
    await api(`/api/v1/goals/${goalId}`, { method: 'DELETE' });
    showToast('Quest removed from questlog.');
    await refreshAll();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function createNewQuestFromForm(e) {
  e.preventDefault();
  const title = document.getElementById('newGoalTitle').value.trim();
  const prio = document.getElementById('newGoalPriority').value;
  const mins = parseInt(document.getElementById('newGoalMins').value, 10) || 30;
  const cat = document.getElementById('newGoalCat').value || 'Quest';

  if (!title) return;

  try {
    await api('/api/v1/goals', {
      method: 'POST',
      body: JSON.stringify({
        title,
        priority: prio,
        estimated_minutes: mins,
        category: cat,
      }),
    });
    soundFx.playChime();
    closeModal('modalNewQuest');
    document.getElementById('formNewQuest').reset();
    showToast(`⚔️ Quest '${title}' added to campaign!`);
    await refreshAll();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

// ── Dynamic Schedule Shifting ──
async function triggerScheduleShift() {
  if (!state.schedule || state.schedule.length === 0) {
    showToast('No active schedule to shift.');
    return;
  }
  const anchorItem = state.schedule[0];
  const overrun = parseInt(document.getElementById('shiftMinutesSelect').value, 10) || 30;

  try {
    await api('/api/v1/schedule/shift', {
      method: 'POST',
      body: JSON.stringify({
        item_id: anchorItem.id,
        overrun_minutes: overrun,
      }),
    });
    soundFx.playChime();
    showToast(`⚡ Slid schedule blocks forward by +${overrun}m!`);
    await refreshAll();
  } catch (err) {
    showToast(`Shift Error: ${err.message}`);
  }
}

// ── AI Schedule Generation ──
async function triggerAiScheduleGen() {
  try {
    showToast('🧙‍♂️ Dungeon Master is formulating your timetable...');
    await api('/api/v1/schedule/generate', {
      method: 'POST',
      body: JSON.stringify({ notes: 'Prioritize deep focus morning sessions' }),
    });
    soundFx.playChime();
    showToast('Tactical schedule synchronized!');
    await refreshAll();
  } catch (err) {
    showToast(`Planner error: ${err.message}`);
  }
}

// ── AI Voice & Chat Dialogue ──
async function sendAiMessage(msg) {
  const text = msg || document.getElementById('aiInputText').value.trim();
  if (!text) return;

  appendChat('user', text);
  document.getElementById('aiInputText').value = '';

  try {
    // 1. First test if user is asking for quest/task manipulation (Tool Agent)
    const lower = text.toLowerCase();
    const isGoalIntent = ['add quest', 'create task', 'schedule', 'delete all', 'clear all', 'delete quest', 'complete quest'].some(k => lower.includes(k));

    if (isGoalIntent) {
      const planRes = await api('/api/v1/goals/from-conversation', {
        method: 'POST',
        body: JSON.stringify({ text, conversation_history: [] }),
      });
      appendChat('ai', planRes.assistant_reply);
      soundFx.playChime();
      await refreshAll();
      return;
    }

    // 2. Otherwise route to AI Coach
    const chatRes = await api('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
    appendChat('ai', chatRes.reply);
    soundFx.playChime();
  } catch (err) {
    appendChat('ai', `⚔️ Error reaching Dungeon Master: ${err.message}`);
  }
}

function appendChat(sender, text) {
  const chatBox = document.getElementById('aiChatHistory');
  if (!chatBox) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ── Speech-to-Text Controller ──
function toggleSpeechRecognition() {
  const micBtn = document.getElementById('btnMic');
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Web Speech API is not supported on this browser. Type in the input below!');
    return;
  }

  if (state.isRecording) {
    if (state.recognition) state.recognition.stop();
    state.isRecording = false;
    micBtn.classList.remove('recording');
    return;
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  state.recognition = new SpeechRec();
  state.recognition.continuous = false;
  state.recognition.interimResults = false;
  state.recognition.lang = 'en-US';

  state.recognition.onstart = () => {
    state.isRecording = true;
    micBtn.classList.add('recording');
    showToast('🎙️ Listening... Speak your quest or command!');
  };

  state.recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('aiInputText').value = transcript;
    sendAiMessage(transcript);
  };

  state.recognition.onerror = (e) => {
    console.error('Speech error:', e);
    state.isRecording = false;
    micBtn.classList.remove('recording');
  };

  state.recognition.onend = () => {
    state.isRecording = false;
    micBtn.classList.remove('recording');
  };

  state.recognition.start();
}

// ── Telemetry Simulator (For Evaluator & Hackathon Judges) ──
async function simulateHeartbeats(type) {
  const now = new Date();
  const start = new Date(now.getTime() - 60000); // 1 minute duration

  let act = {};
  if (type === 'coding') {
    act = {
      source: 'desktop',
      application: 'Cursor',
      window_title: 'app/main.py - Questlog',
      category: 'Coding',
      started_at: start.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: 60,
      is_productive: true,
    };
  } else if (type === 'dsa') {
    act = {
      source: 'browser',
      domain: 'leetcode.com',
      window_title: 'Problems - LeetCode',
      category: 'DSA',
      started_at: start.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: 60,
      is_productive: true,
    };
  } else if (type === 'distraction') {
    act = {
      source: 'browser',
      domain: 'youtube.com',
      window_title: 'Funny Gaming Moments - YouTube',
      category: 'Entertainment',
      started_at: start.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: 60,
      is_productive: false,
    };
  }

  try {
    await api('/api/v1/activities/batch', {
      method: 'POST',
      body: JSON.stringify({ activities: [act] }),
    });
    soundFx.playChime();
    showToast(`📡 Ingested ${act.category} telemetry heartbeat!`);
    await refreshAll();
  } catch (err) {
    showToast(`Telemetry error: ${err.message}`);
  }
}

// ── Modal & Toast Helpers ──
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>⚔️</span> <span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
  await autoDemoLogin();
  await refreshAll();

  // Polling every 30 seconds for live telemetry synchronization
  setInterval(refreshAll, 30000);

  // Form listener
  const form = document.getElementById('formNewQuest');
  if (form) form.addEventListener('submit', createNewQuestFromForm);

  // Enter key on AI input
  const aiInput = document.getElementById('aiInputText');
  if (aiInput) {
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendAiMessage();
    });
  }
});
