import { signInWithEmailAndPassword, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase.js';

const ui = {
  authScreen: document.getElementById('authScreen'),
  trackerScreen: document.getElementById('trackerScreen'),
  statusMsg: document.getElementById('statusMsg'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  loginBtn: document.getElementById('loginBtn'),
  googleLoginBtn: document.getElementById('googleLoginBtn'),
  logManualBtn: document.getElementById('logManualBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  problemTitle: document.getElementById('problemTitle'),
  timeTracker: document.getElementById('timeTracker'),
  extUriDisplay: document.getElementById('extUriDisplay'),
};

// Set debug URI
if (ui.extUriDisplay && chrome.runtime.id) {
  ui.extUriDisplay.textContent = `chrome-extension://${chrome.runtime.id}`;
}

let currentProblem = null;
let currentUrl = null;
let timerInterval = null;

// Handle Auth State
onAuthStateChanged(auth, (user) => {
  if (user) {
    ui.authScreen.classList.add('hidden');
    ui.trackerScreen.classList.remove('hidden');
    ui.statusMsg.textContent = `Logged in as ${user.email}`;
    ui.statusMsg.style.color = '#4ade80';
    checkActiveTab();
  } else {
    ui.authScreen.classList.remove('hidden');
    ui.trackerScreen.classList.add('hidden');
    ui.statusMsg.textContent = '';
    if (timerInterval) clearInterval(timerInterval);
  }
});

// Auth Actions
ui.loginBtn.addEventListener('click', async () => {
  try {
    ui.loginBtn.disabled = true;
    ui.loginBtn.textContent = 'Logging in...';
    await signInWithEmailAndPassword(auth, ui.emailInput.value, ui.passwordInput.value);
  } catch (error) {
    ui.statusMsg.textContent = error.message;
    ui.statusMsg.style.color = '#f87171';
  } finally {
    ui.loginBtn.disabled = false;
    ui.loginBtn.textContent = 'Login';
  }
});

ui.googleLoginBtn.addEventListener('click', async () => {
  try {
    ui.googleLoginBtn.disabled = true;
    ui.googleLoginBtn.textContent = 'Please wait...';
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    ui.statusMsg.textContent = error.message;
    ui.statusMsg.style.color = '#f87171';
  } finally {
    ui.googleLoginBtn.disabled = false;
    ui.googleLoginBtn.textContent = 'Continue with Google';
  }
});

ui.logoutBtn.addEventListener('click', () => signOut(auth));

// Fetch active tab status
async function checkActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || (!tab.url.includes('leetcode.com') && !tab.url.includes('codeforces.com'))) {
    ui.problemTitle.textContent = 'Not on a supported page';
    ui.logManualBtn.disabled = true;
    return;
  }
  
  currentUrl = tab.url;

  // Ask content script for details
  chrome.tabs.sendMessage(tab.id, { type: 'GET_PROBLEM_DETAILS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      ui.problemTitle.textContent = 'Reload page to start tracking';
      return;
    }
    currentProblem = response;
    ui.problemTitle.textContent = response.title;
    ui.logManualBtn.disabled = false;
  });
  
  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// Read storage to update timer
function updateTimerDisplay() {
  if (!currentUrl) return;
  chrome.storage.local.get([currentUrl], (result) => {
    const totalSeconds = Math.round(result[currentUrl] || 0);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    ui.timeTracker.textContent = `${m}:${s}`;
  });
}

// Log manual
ui.logManualBtn.addEventListener('click', () => {
  if (!currentProblem) return;
  
  ui.logManualBtn.disabled = true;
  ui.logManualBtn.textContent = 'Saving...';
  
  chrome.storage.local.get([currentUrl], (result) => {
    const totalSeconds = Math.round(result[currentUrl] || 0);
    const timeTakenMins = Math.max(1, Math.round(totalSeconds / 60));
    
    currentProblem.timeTakenMins = timeTakenMins;
    
    chrome.runtime.sendMessage({ type: 'LOG_QUESTION', payload: currentProblem }, (response) => {
      if (response?.success) {
        ui.logManualBtn.textContent = 'Saved!';
        ui.logManualBtn.style.background = '#22c55e';
      } else {
        ui.logManualBtn.textContent = 'Error';
        ui.logManualBtn.style.background = '#ef4444';
        ui.statusMsg.textContent = response?.error || 'Failed to save';
        setTimeout(() => {
          ui.logManualBtn.disabled = false;
          ui.logManualBtn.textContent = 'Log as Solved';
          ui.logManualBtn.style.background = '#4f46e5';
        }, 2000);
      }
    });
  });
});
