import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const authScreen    = $('authScreen');
const trackerScreen = $('trackerScreen');
const emailInput    = $('emailInput');
const passwordInput = $('passwordInput');
const loginBtn      = $('loginBtn');
const authStatusMsg = $('authStatusMsg');
const userLabel     = $('userLabel');
const activeProblem = $('activeProblem');
const activityList  = $('activityList');
const statSolved    = $('statSolved');
const statStreak    = $('statStreak');
const dashboardBtn  = $('dashboardBtn');
const logoutBtn     = $('logoutBtn');

// ── State ─────────────────────────────────────────────────────────────────────
let currentProblem  = null;
let currentUrl      = null;
let timerInterval   = null;
let isPaused        = false;
let selectedFriends = new Set();
let loggedQuestionId = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    authScreen.classList.add('hidden');
    trackerScreen.classList.remove('hidden');
    userLabel.textContent = user.displayName || user.email.split('@')[0];
    initTracker();
  } else {
    authScreen.classList.remove('hidden');
    trackerScreen.classList.add('hidden');
    stopTimer();
  }
});

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const pass  = passwordInput.value;
  if (!email || !pass) return;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  authStatusMsg.style.color = '#a1a1aa';
  authStatusMsg.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    authStatusMsg.style.color = '#f87171';
    authStatusMsg.textContent = 'Invalid credentials. Try again.';
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });

logoutBtn.addEventListener('click', () => signOut(auth));

dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://grind-sync-seven.vercel.app/dashboard' });
});

// ── Main Init ─────────────────────────────────────────────────────────────────
function initTracker() {
  loadRecentActivity();
  loadStats();
  checkActiveTab();
}

// ── Active Tab / Problem ──────────────────────────────────────────────────────
async function checkActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const isLeetCode   = tab?.url?.includes('leetcode.com/problems/');
  const isCodeforces = tab?.url?.includes('codeforces.com') &&
    /\/(problemset\/problem|contest|gym|group)\//.test(tab.url);

  if (!tab || (!isLeetCode && !isCodeforces)) {
    renderNoProblem();
    return;
  }

  currentUrl = tab.url;
  syncPausedState(() => {
    // Request problem details from content.js
    chrome.tabs.sendMessage(tab.id, { type: 'GET_PROBLEM_DETAILS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderNoProblem('Reload the problem page to start tracking.');
        return;
      }
      currentProblem = response;
      renderProblem();
    });
  });
}

function pauseKey()  { return `${currentUrl}:paused`; }
function solvedKey() { return `${currentUrl}:grindsync-solved`; }

function syncPausedState(cb) {
  if (!currentUrl) { cb?.(); return; }
  chrome.storage.local.get([pauseKey(), solvedKey()], (result) => {
    isPaused = Boolean(result[pauseKey()]);
    cb?.();
  });
}

// ── Renders ───────────────────────────────────────────────────────────────────
function renderNoProblem(msg = 'Navigate to a LeetCode or Codeforces problem to start tracking.') {
  stopTimer();
  activeProblem.innerHTML = `
    <div class="no-problem-msg">
      <span>🎯</span>${msg}
    </div>
  `;
}

function renderProblem() {
  const diffClass = normDiffClass(currentProblem.difficulty);

  chrome.storage.local.get([solvedKey()], (result) => {
    const alreadySolved = Boolean(result[solvedKey()]);

    activeProblem.innerHTML = `
      <div class="problem-title" title="${currentProblem.title}">${currentProblem.title}</div>
      <div class="problem-meta">
        <span class="difficulty-pill ${diffClass}">${currentProblem.difficulty}</span>
        <div class="timer-display">
          <div class="timer-dot ${isPaused ? 'paused' : ''}" id="timerDot"></div>
          <span id="timerText">00:00</span> tracked
        </div>
      </div>

      <div class="action-grid">
        <button class="btn btn-primary" id="logBtn" ${alreadySolved ? 'disabled' : ''}>
          ${alreadySolved ? '✓ Already Logged' : '✓ Log as Solved'}
        </button>
        <button class="btn btn-secondary" id="challengeBtn">⚔️ Send Challenge</button>
        <button class="btn btn-secondary" id="pauseBtn">
          ${isPaused ? '▶️ Resume Timer' : '⏸️ Pause Timer'}
        </button>
      </div>

      <!-- Perceived difficulty (hidden until after log) -->
      <div id="perceivedSection" class="hidden" style="margin-top:10px;">
        <div class="feel-label">How did it feel?</div>
        <div id="perceivedRow">
          <button class="feel-btn easy"  data-feel="easy">Easy</button>
          <button class="feel-btn okay"  data-feel="okay">Okay</button>
          <button class="feel-btn hard"  data-feel="hard">Hard</button>
        </div>
      </div>

      <!-- Inline status message -->
      <div class="inline-status" id="inlineStatus"></div>

      <!-- Challenge friend panel -->
      <div id="challengePanel">
        <div class="gs-section-label" style="margin-top:8px;">Select friend</div>
        <div class="friend-list" id="friendList">
          <div style="color:#52525b; font-size:11px; text-align:center; padding:8px;">Loading friends...</div>
        </div>
        <button class="btn btn-primary" id="sendChallengeBtn" disabled>Send Challenge</button>
      </div>
    `;

    bindProblemActions();
    startTimer();
  });
}

function normDiffClass(d) {
  const lower = (d || '').toLowerCase();
  if (lower === 'easy' || lower === 'beginner') return 'easy';
  if (lower === 'hard' || lower === 'advanced') return 'hard';
  return 'medium';
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  if (!currentUrl) return;
  chrome.storage.local.get([currentUrl, pauseKey()], (result) => {
    const totalSecs = Math.round(result[currentUrl] || 0);
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    const timerText = document.getElementById('timerText');
    const timerDot  = document.getElementById('timerDot');
    if (timerText) timerText.textContent = `${m}:${s}`;
    isPaused = Boolean(result[pauseKey()]);
    if (timerDot) {
      timerDot.className = `timer-dot ${isPaused ? 'paused' : ''}`;
    }
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = isPaused ? '▶️ Resume Timer' : '⏸️ Pause Timer';
  });
}

// ── Action Binding ────────────────────────────────────────────────────────────
function bindProblemActions() {
  // LOG AS SOLVED
  document.getElementById('logBtn')?.addEventListener('click', handleLogSolved);

  // PAUSE / RESUME
  document.getElementById('pauseBtn')?.addEventListener('click', () => {
    isPaused = !isPaused;
    chrome.storage.local.set({ [pauseKey()]: isPaused });
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = isPaused ? '▶️ Resume Timer' : '⏸️ Pause Timer';
    const dot = document.getElementById('timerDot');
    if (dot) dot.className = `timer-dot ${isPaused ? 'paused' : ''}`;
  });

  // CHALLENGE TOGGLE
  document.getElementById('challengeBtn')?.addEventListener('click', toggleChallengePanel);

  // SEND CHALLENGE
  document.getElementById('sendChallengeBtn')?.addEventListener('click', handleSendChallenge);
}

// ── Log as Solved Flow ────────────────────────────────────────────────────────
async function handleLogSolved() {
  if (!currentProblem || !currentUrl) return;
  const logBtn = document.getElementById('logBtn');
  if (!logBtn) return;

  logBtn.disabled = true;
  logBtn.textContent = 'Saving...';
  setStatus('');

  const seconds = await getStoredSeconds();
  const timeTakenMins = Math.max(1, Math.round(seconds / 60));

  chrome.runtime.sendMessage({
    type: 'LOG_QUESTION',
    payload: { ...currentProblem, timeTakenMins },
  }, (response) => {
    if (response?.success) {
      loggedQuestionId = response.id;
      logBtn.textContent = '✓ Logged!';
      logBtn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';

      // Mark as solved in storage
      chrome.storage.local.set({ [solvedKey()]: true });

      // Save to recent activity
      saveToRecentActivity({
        title: currentProblem.title,
        url: currentProblem.url,
        solvedAt: Date.now(),
      });
      loadRecentActivity();
      loadStats();

      // Show perceived difficulty
      const perceivedSection = document.getElementById('perceivedSection');
      if (perceivedSection) perceivedSection.classList.remove('hidden');
      bindPerceivedButtons();

      setStatus('✅ Logged! How did it feel?', '#4ade80');
    } else {
      logBtn.disabled = false;
      logBtn.textContent = '✓ Log as Solved';
      setStatus(response?.error || 'Failed to log. Try again.', '#f87171');
    }
  });
}

function bindPerceivedButtons() {
  document.querySelectorAll('.feel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const feel = btn.dataset.feel;
      if (!loggedQuestionId) return;
      chrome.runtime.sendMessage({
        type: 'UPDATE_PERCEIVED_DIFFICULTY',
        payload: { questionId: loggedQuestionId, perceivedDifficulty: feel },
      });
      document.getElementById('perceivedSection')?.classList.add('hidden');
      setStatus(`Marked as ${feel} ✓`, '#a5b4fc');
      setTimeout(() => setStatus(''), 2500);
    });
  });
}

function setStatus(msg, color = '#a1a1aa') {
  const el = document.getElementById('inlineStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
}

// ── Challenge Flow ────────────────────────────────────────────────────────────
function toggleChallengePanel() {
  const panel = document.getElementById('challengePanel');
  if (!panel) return;
  const isVisible = panel.classList.contains('visible');
  if (isVisible) {
    panel.classList.remove('visible');
    panel.style.display = 'none';
    return;
  }
  panel.classList.add('visible');
  panel.style.display = 'block';
  loadFriends();
}

function loadFriends() {
  const friendList = document.getElementById('friendList');
  if (!friendList) return;
  friendList.innerHTML = '<div style="color:#52525b; font-size:11px; text-align:center; padding:8px;">Loading...</div>';
  selectedFriends.clear();

  chrome.runtime.sendMessage({ type: 'GET_CHALLENGE_FRIENDS' }, (response) => {
    if (!response?.success || !response.friends?.length) {
      friendList.innerHTML = '<div style="color:#52525b; font-size:11px; text-align:center; padding:8px;">No friends in shared groups yet.</div>';
      return;
    }
    friendList.innerHTML = '';
    response.friends.forEach((friend) => {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.dataset.userId = friend.userId;
      row.innerHTML = `
        <div class="friend-avatar">${friend.displayName.charAt(0).toUpperCase()}</div>
        <div class="friend-name">${friend.displayName}</div>
        <div class="friend-check"></div>
      `;
      row.addEventListener('click', () => {
        const isSelected = row.classList.contains('selected');
        // Single-select
        friendList.querySelectorAll('.friend-row.selected').forEach(r => r.classList.remove('selected'));
        selectedFriends.clear();
        if (!isSelected) {
          row.classList.add('selected');
          selectedFriends.add(friend);
        }
        const sendBtn = document.getElementById('sendChallengeBtn');
        if (sendBtn) sendBtn.disabled = selectedFriends.size === 0;
      });
      friendList.appendChild(row);
    });
  });
}

async function handleSendChallenge() {
  if (!currentProblem || selectedFriends.size === 0) return;
  const sendBtn = document.getElementById('sendChallengeBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }

  const seconds = await getStoredSeconds();
  const timeTakenMins = Math.max(1, Math.round(seconds / 60));
  const friend = [...selectedFriends][0];

  chrome.runtime.sendMessage({
    type: 'SEND_CHALLENGE',
    payload: {
      ...currentProblem,
      timeTakenMins,
      questionUrl: currentProblem.url,
      questionTitle: currentProblem.title,
      friend,
    },
  }, (response) => {
    const panel = document.getElementById('challengePanel');
    if (response?.success) {
      if (panel) { panel.classList.remove('visible'); panel.style.display = 'none'; }
      setStatus(`⚔️ Challenge sent to ${friend.displayName}!`, '#a5b4fc');
      setTimeout(() => setStatus(''), 3000);
    } else {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Challenge'; }
      setStatus(response?.error || 'Failed to send challenge.', '#f87171');
    }
  });
}

// ── Recent Activity ───────────────────────────────────────────────────────────
const ACTIVITY_KEY = 'grindsync-recent-activity';

function saveToRecentActivity(item) {
  chrome.storage.local.get([ACTIVITY_KEY], (result) => {
    const existing = Array.isArray(result[ACTIVITY_KEY]) ? result[ACTIVITY_KEY] : [];
    const updated = [item, ...existing].slice(0, 10); // keep last 10
    chrome.storage.local.set({ [ACTIVITY_KEY]: updated });
  });
}

function loadRecentActivity() {
  chrome.storage.local.get([ACTIVITY_KEY], (result) => {
    const items = Array.isArray(result[ACTIVITY_KEY]) ? result[ACTIVITY_KEY] : [];
    if (!items.length) {
      activityList.innerHTML = '<div style="color:#52525b; font-size:11px; text-align:center; padding:8px 0;">No activity yet</div>';
      return;
    }
    activityList.innerHTML = items.slice(0, 3).map((item) => {
      const ago = timeAgo(item.solvedAt);
      return `
        <a class="activity-item" href="${item.url}" target="_blank" title="${item.title}">
          <div class="activity-check">✓</div>
          <div class="activity-title">${item.title}</div>
          <div class="activity-time">${ago}</div>
        </a>
      `;
    }).join('');

    // Make links open in new tab properly
    activityList.querySelectorAll('a.activity-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: el.href });
      });
    });
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function loadStats() {
  chrome.storage.local.get([ACTIVITY_KEY], (result) => {
    const items = Array.isArray(result[ACTIVITY_KEY]) ? result[ACTIVITY_KEY] : [];
    statSolved.textContent = items.length;

    // Calculate streak from consecutive days
    const days = new Set(items.map(i => new Date(i.solvedAt).toDateString()));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) streak++;
      else if (i > 0) break;
    }
    statStreak.textContent = streak + '🔥';
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getStoredSeconds() {
  return new Promise((resolve) => {
    if (!currentUrl) { resolve(0); return; }
    chrome.storage.local.get([currentUrl], (result) => {
      resolve(Math.round(result[currentUrl] || 0));
    });
  });
}
