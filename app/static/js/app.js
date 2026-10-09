/**
 * REAL-LIFE DUNGEON MASTER — CORE FRONTEND CONTROLLER
 * Full Dynamic Gamified Schedule Planner & Focus Timer Engine
 */

const API_BASE = window.location.origin;

// Application Global State
const state = {
  token: localStorage.getItem('dm_access_token') || '',
  user: null,
  score: 50,
  dailyScore: { score: 50, productive_seconds: 0, distracting_seconds: 0 },
  goals: [],
  schedule: [],
  analytics: null,
  scoreEvents: [],
  isRecording: false,
  recognition: null,
};

// ── Web Audio Synthesizer (Fanfare, Level-Up, and Chimes) ──
const soundFx = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  playLevelUp() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.25, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.35);
      });
    } catch (e) {
      console.warn('Audio FX error:', e);
    }
  },
  playChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {}
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
      if (endpoint !== '/api/v1/auth/login' && endpoint !== '/api/v1/auth/register') {
        console.warn('Unauthorized token, authenticating adventurer session...');
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

// ── Focus Timer Controller Engine ──
const focusTimer = {
  goalId: null,
  goalTitle: '',
  category: 'Coding',
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  intervalId: null,
  isPaused: false,
  elapsedFocusSeconds: 0,

  start(goal) {
    if (this.intervalId) {
      this.stop(true);
    }

    const mins = goal.estimated_minutes || Math.round((goal.target_duration_seconds || 0) / 60) || 25;
    this.goalId = goal.id;
    this.goalTitle = goal.title;
    this.category = goal.category || 'Focus';
    this.totalSeconds = mins * 60;
    this.remainingSeconds = this.totalSeconds;
    this.isPaused = false;
    this.elapsedFocusSeconds = 0;

    // UI elements update
    document.getElementById('focusHudIdle').style.display = 'none';
    document.getElementById('focusHudActive').style.display = 'flex';
    document.getElementById('activeQuestTitle').textContent = this.goalTitle;
    document.getElementById('activeQuestCategory').textContent = this.category;
    document.getElementById('btnPauseResumeIcon').textContent = '⏸';
    document.getElementById('btnPauseResumeText').textContent = 'Pause';
    
    this.updateClockDisplay();
    soundFx.playChime();
    showToast(`⚔️ Started Focus Session: ${this.goalTitle} (${mins} mins)`);

    this.intervalId = setInterval(() => this.tick(), 1000);
    renderQuests();
  },

  tick() {
    if (this.isPaused) return;

    this.remainingSeconds--;
    this.elapsedFocusSeconds++;
    this.updateClockDisplay();

    // Periodic 30s background telemetry stream
    if (this.elapsedFocusSeconds > 0 && this.elapsedFocusSeconds % 30 === 0) {
      this.streamHeartbeat(30);
    }

    if (this.remainingSeconds <= 0) {
      this.complete();
    }
  },

  togglePause() {
    this.isPaused = !this.isPaused;
    const btnIcon = document.getElementById('btnPauseResumeIcon');
    const btnText = document.getElementById('btnPauseResumeText');
    const subStatus = document.getElementById('focusSubStatus');

    if (this.isPaused) {
      btnIcon.textContent = '▶';
      btnText.textContent = 'Resume';
      subStatus.textContent = '⏸ Focus Timer Paused';
      showToast('Focus session paused.');
    } else {
      btnIcon.textContent = '⏸';
      btnText.textContent = 'Pause';
      subStatus.textContent = 'Deep Work Flow • Earning +1 XP/min';
      showToast('Focus session resumed!');
    }
  },

  async streamHeartbeat(durationSecs) {
    const now = new Date();
    const start = new Date(now.getTime() - durationSecs * 1000);
    const act = {
      source: 'web_focus_timer',
      application: `Quest Focus (${this.category})`,
      window_title: `${this.goalTitle} - Questlog`,
      category: this.category,
      started_at: start.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: durationSecs,
      is_productive: true,
    };

    try {
      await api('/api/v1/activities/batch', {
        method: 'POST',
        body: JSON.stringify({ activities: [act] }),
      });
      // Soft local increment
      if (state.dailyScore) {
        state.dailyScore.productive_seconds = (state.dailyScore.productive_seconds || 0) + durationSecs;
        updateRpgAndScoreUI();
      }
    } catch (e) {
      console.warn('Telemetry heartbeat sync error:', e);
    }
  },

  updateClockDisplay() {
    const mins = Math.floor(Math.max(0, this.remainingSeconds) / 60);
    const secs = Math.max(0, this.remainingSeconds) % 60;
    const clockStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const clockEl = document.getElementById('focusClock');
    if (clockEl) clockEl.textContent = clockStr;

    // Progress bar
    const fillEl = document.getElementById('focusProgressFill');
    if (fillEl && this.totalSeconds > 0) {
      const pct = Math.max(0, Math.min(100, (this.remainingSeconds / this.totalSeconds) * 100));
      fillEl.style.width = `${pct}%`;
    }

    // Document Title
    document.title = `[${clockStr}] ${this.goalTitle} — Questlog`;
  },

  stop(quiet = false) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    document.title = 'Real-Life Dungeon Master — Questlog & Productivity Console';
    document.getElementById('focusHudActive').style.display = 'none';
    document.getElementById('focusHudIdle').style.display = 'flex';
    this.goalId = null;
    if (!quiet) {
      showToast('Focus timer stopped.');
    }
    renderQuests();
  },

  async complete() {
    const gId = this.goalId;
    const title = this.goalTitle;
    this.stop(true);

    if (gId) {
      try {
        await api(`/api/v1/goals/${gId}/complete`, { method: 'POST' });
        soundFx.playLevelUp();
        showToast(`🏆 Quest '${title}' completed! +50 XP and Score points awarded!`);
        await refreshAll();
      } catch (e) {
        showToast(`Error completing quest: ${e.message}`);
      }
    }
  }
};

// Global hooks for HTML onclick attributes
function toggleFocusTimerPause() {
  focusTimer.togglePause();
}
function stopFocusTimer(quiet) {
  focusTimer.stop(quiet);
}
function completeActiveQuestFromTimer() {
  focusTimer.complete();
}

// ── Refresh All App Data ──
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

    if (userRes.status === 'fulfilled' && userRes.value) {
      state.user = userRes.value;
      const nameEl = document.getElementById('heroName');
      const headerNameEl = document.getElementById('heroHeaderName');
      if (nameEl) nameEl.textContent = state.user.name || 'Hero of the Realm';
      if (headerNameEl) headerNameEl.textContent = (state.user.name || 'Adventurer').split(' ')[0];
    }

    if (scoreRes.status === 'fulfilled' && scoreRes.value) {
      state.dailyScore = scoreRes.value;
      state.score = state.dailyScore.score ?? 50;
    }

    if (goalsRes.status === 'fulfilled' && Array.isArray(goalsRes.value)) {
      state.goals = goalsRes.value;
      renderQuests();
    }

    if (schedRes.status === 'fulfilled' && Array.isArray(schedRes.value)) {
      state.schedule = schedRes.value;
      renderSchedule();
    }

    if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) {
      state.scoreEvents = eventsRes.value;
      renderScoreEvents();
    }

    if (analyticsRes.status === 'fulfilled' && analyticsRes.value) {
      state.analytics = analyticsRes.value;
      renderAnalytics();
    }

    // Update dynamic RPG progression curves
    updateRpgAndScoreUI();
  } catch (err) {
    console.error('Data refresh error:', err);
  }
}

// ── Dynamic RPG Progression System ──
function updateRpgAndScoreUI() {
  const scoreVal = Math.max(0, Math.min(100, Math.round(state.score || 50)));
  const prodSecs = state.dailyScore ? state.dailyScore.productive_seconds || 0 : 0;
  const distSecs = state.dailyScore ? state.dailyScore.distracting_seconds || 0 : 0;
  
  // Calculate dynamic XP:
  // +1 XP per minute of productive focus
  // +50 XP per completed high/critical quest, +25 XP per low/med quest
  const focusXp = Math.floor(prodSecs / 60);
  let questXp = 0;
  let completedCount = 0;

  state.goals.forEach(g => {
    if (g.status === 'completed') {
      completedCount++;
      const prio = (g.priority || 'medium').toLowerCase();
      questXp += (prio === 'critical' || prio === 'high') ? 50 : 25;
    }
  });

  const totalXp = focusXp + questXp;

  // Level Tiers:
  // Lvl 1: 0 - 100 XP (Novice)
  // Lvl 2: 100 - 250 XP (Apprentice)
  // Lvl 3: 250 - 500 XP (Adept)
  // Lvl 4: 500 - 1000 XP (Warrior)
  // Lvl 5: 1000+ XP (Grandmaster)
  let level = 1;
  let rank = 'Novice';
  let curLvlBase = 0;
  let nextLvlBase = 100;
  let avatarIcon = '🧙‍♂️';

  if (totalXp >= 1000) {
    level = 5 + Math.floor((totalXp - 1000) / 500);
    rank = 'Grandmaster';
    curLvlBase = 1000 + (level - 5) * 500;
    nextLvlBase = curLvlBase + 500;
    avatarIcon = '👑';
  } else if (totalXp >= 500) {
    level = 4;
    rank = 'Warrior';
    curLvlBase = 500;
    nextLvlBase = 1000;
    avatarIcon = '🛡️';
  } else if (totalXp >= 250) {
    level = 3;
    rank = 'Adept';
    curLvlBase = 250;
    nextLvlBase = 500;
    avatarIcon = '⚡';
  } else if (totalXp >= 100) {
    level = 2;
    rank = 'Apprentice';
    curLvlBase = 100;
    nextLvlBase = 250;
    avatarIcon = '🏹';
  } else {
    level = 1;
    rank = 'Novice';
    curLvlBase = 0;
    nextLvlBase = 100;
    avatarIcon = '🧙‍♂️';
  }

  const xpInTier = totalXp - curLvlBase;
  const tierRange = nextLvlBase - curLvlBase;
  const xpPct = Math.min(100, Math.max(0, Math.round((xpInTier / tierRange) * 100)));

  // Update UI Elements
  document.getElementById('topStreakBadge').textContent = `${Math.max(1, Math.min(14, completedCount + 1))} Days`;
  document.getElementById('topRankBadge').textContent = rank;
  document.getElementById('topScoreBadge').textContent = scoreVal;
  document.getElementById('scoreDisplay').textContent = scoreVal;
  document.getElementById('heroLevel').textContent = `Level ${level} ${rank}`;
  document.getElementById('xpProgress').textContent = `${xpInTier} / ${tierRange} XP (${totalXp} Total XP)`;
  document.getElementById('xpFill').style.width = `${xpPct}%`;
  
  const charAvatar = document.getElementById('charAvatar');
  if (charAvatar) charAvatar.textContent = avatarIcon;

  // Update SVG circular gauge (Circumference = 2 * PI * 60 ≈ 377)
  const maxDash = 377;
  const offset = maxDash - (scoreVal / 100) * maxDash;
  const gaugeEl = document.getElementById('gaugeProgress');
  if (gaugeEl) {
    gaugeEl.style.strokeDashoffset = offset;
  }

  // Mini stats
  const prodMin = Math.round(prodSecs / 60);
  const distMin = Math.round(distSecs / 60);
  document.getElementById('prodTimeMini').textContent = `${prodMin}m`;
  document.getElementById('distractTimeMini').textContent = `${distMin}m`;
}

// ── Quest Rendering ──
function renderQuests() {
  const listEl = document.getElementById('questList');
  const countBadge = document.getElementById('questCountBadge');
  if (!listEl) return;

  if (countBadge) {
    const activeCount = state.goals.filter(g => g.status !== 'completed').length;
    countBadge.textContent = `(${activeCount} Active / ${state.goals.length} Total)`;
  }

  if (state.goals.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 2.25rem 1rem; color: var(--text-dim); font-size: 0.88rem;">
        ⚔️ No active quests yet! Click <strong>+ New Quest</strong> or ask the Dungeon Master AI to schedule your campaign.
      </div>`;
    return;
  }

  listEl.innerHTML = state.goals
    .map((g) => {
      const isDone = g.status === 'completed';
      const isCurrentlyFocusing = focusTimer.goalId === g.id;
      const prio = (g.priority || 'medium').toLowerCase();
      const mins = g.estimated_minutes || Math.round((g.target_duration_seconds || 0) / 60) || 25;

      return `
      <div class="quest-item ${isDone ? 'completed' : ''} ${isCurrentlyFocusing ? 'is-focusing' : ''}" data-id="${g.id}">
        <div class="quest-left">
          <button class="quest-checkbox ${isDone ? 'checked' : ''}" title="${isDone ? 'Completed' : 'Mark as complete'}" onclick="toggleQuestComplete('${g.id}', ${isDone})">
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
          ${!isDone ? `
            <button class="btn-focus-start ${isCurrentlyFocusing ? 'active' : ''}" onclick="launchQuestFocus('${g.id}')">
              ${isCurrentlyFocusing ? '⚡ Focusing' : '▶ Start Focus'}
            </button>
          ` : ''}
          <button class="btn-icon-action" title="Delete Quest" onclick="deleteQuest('${g.id}')">🗑️</button>
        </div>
      </div>
    `;
    })
    .join('');
}

function launchQuestFocus(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  focusTimer.start(goal);
}

// ── Schedule Rendering ──
function renderSchedule() {
  const schedEl = document.getElementById('timelineList');
  if (!schedEl) return;

  if (state.schedule.length === 0) {
    schedEl.innerHTML = `
      <div style="text-align:center; padding: 2rem 1rem; color: var(--text-dim); font-size: 0.85rem;">
        📅 No schedule blocks organized for today. Click <strong>🧙‍♂️ AI Auto-Plan</strong> to automatically slot your quests!
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
        <div class="timeline-block" style="${isDone ? 'opacity: 0.55; border-left-color: var(--accent-emerald);' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="timeline-block-title">${escapeHtml(item.title)}</div>
            ${!isDone ? `
              <button class="btn-focus-start" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="startScheduleItemFocus('${escapeHtml(item.title)}')">
                ▶ Focus
              </button>
            ` : '<span style="font-size:0.7rem; color:var(--accent-emerald);">✓ Done</span>'}
          </div>
          ${item.reason ? `<div class="timeline-block-reason">⚡ ${escapeHtml(item.reason)}</div>` : ''}
        </div>
      </div>
    `;
    })
    .join('');
}

function startScheduleItemFocus(title) {
  const matchGoal = state.goals.find(g => g.title.toLowerCase() === title.toLowerCase() && g.status !== 'completed');
  if (matchGoal) {
    focusTimer.start(matchGoal);
  } else {
    focusTimer.start({
      id: null,
      title: title,
      estimated_minutes: 25,
      category: 'Scheduled Block',
    });
  }
}

// ── Score Ledger Rendering ──
function renderScoreEvents() {
  const ledgerEl = document.getElementById('ledgerList');
  if (!ledgerEl) return;

  if (state.scoreEvents.length === 0) {
    ledgerEl.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 1.25rem;">No score events yet today. Complete quests to gain points!</div>`;
    return;
  }

  ledgerEl.innerHTML = state.scoreEvents
    .slice(0, 10)
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
      .slice(0, 5)
      .map((a) => {
        const mins = Math.round(a.seconds / 60);
        return `
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
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
    showToast('🏆 Quest completed! +50 XP and Score points awarded!');
    if (focusTimer.goalId === goalId) {
      focusTimer.stop(true);
    }
    await refreshAll();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function deleteQuest(goalId) {
  try {
    await api(`/api/v1/goals/${goalId}`, { method: 'DELETE' });
    if (focusTimer.goalId === goalId) {
      focusTimer.stop(true);
    }
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
  const mins = parseInt(document.getElementById('newGoalMins').value, 10) || 25;
  const cat = document.getElementById('newGoalCat').value || 'Coding';

  if (!title) return;

  try {
    // 1. Create Goal in database
    const createdGoal = await api('/api/v1/goals', {
      method: 'POST',
      body: JSON.stringify({
        title,
        priority: prio,
        estimated_minutes: mins,
        category: cat,
      }),
    });

    // 2. Auto-slot into schedule timeline
    try {
      const now = new Date();
      let startTime = new Date(now.getTime() + 5 * 60000);
      if (state.schedule.length > 0) {
        const lastItem = state.schedule[state.schedule.length - 1];
        const lastEnd = new Date(lastItem.end_time);
        if (lastEnd > now) {
          startTime = new Date(lastEnd.getTime() + 5 * 60000);
        }
      }
      const endTime = new Date(startTime.getTime() + mins * 60000);

      await api('/api/v1/schedule', {
        method: 'POST',
        body: JSON.stringify({
          title,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          reason: `Auto-scheduled quest (${cat})`,
        }),
      });
    } catch (schedErr) {
      console.warn('Auto-schedule note:', schedErr);
    }

    soundFx.playChime();
    closeModal('modalNewQuest');
    document.getElementById('formNewQuest').reset();
    showToast(`⚔️ Quest '${title}' added & scheduled!`);
    await refreshAll();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

// ── Dynamic Schedule Shifting ──
async function triggerScheduleShift() {
  if (!state.schedule || state.schedule.length === 0) {
    showToast('No active schedule blocks to shift.');
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
      body: JSON.stringify({ notes: 'Organize deep focus blocks with optimal rest intervals' }),
    });
    soundFx.playLevelUp();
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
    const lower = text.toLowerCase();
    const isGoalIntent = ['add quest', 'create task', 'schedule', 'delete all', 'clear all', 'delete quest', 'complete quest', 'shift schedule'].some(k => lower.includes(k));

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
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRec) {
    showToast('Web Speech API is not supported on this browser. Type in the input below!');
    return;
  }

  if (state.isRecording) {
    if (state.recognition) state.recognition.stop();
    state.isRecording = false;
    micBtn.classList.remove('recording');
    return;
  }

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

// ── Telemetry Simulator ──
async function simulateHeartbeats(type) {
  const now = new Date();
  const start = new Date(now.getTime() - 60000); // 1 minute duration

  let act = {};
  if (type === 'coding') {
    act = {
      source: 'desktop',
      application: 'VS Code',
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
      window_title: 'Gaming Videos - YouTube',
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

  // Background polling every 25s for live telemetry & score updates
  setInterval(refreshAll, 25000);

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
