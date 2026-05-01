let timeSpentSeconds = 0;
let lastActiveTime = Date.now();
let isVisible = !document.hidden;
let hasLoggedAuto = false;
let isPaused = false;

function getPauseStorageKey() {
  return `${window.location.href}:paused`;
}

chrome.storage.local.get([getPauseStorageKey()], (result) => {
  isPaused = Boolean(result[getPauseStorageKey()]);
  if (isPaused) lastActiveTime = Date.now();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const pauseChange = changes[getPauseStorageKey()];
  if (!pauseChange) return;
  const nextPaused = Boolean(pauseChange.newValue);
  if (nextPaused && !isPaused && isVisible) {
    timeSpentSeconds += (Date.now() - lastActiveTime) / 1000;
    chrome.storage.local.set({ [window.location.href]: timeSpentSeconds });
  }
  isPaused = nextPaused;
  lastActiveTime = Date.now();
});

// Time tracking
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (isVisible) {
      timeSpentSeconds += (Date.now() - lastActiveTime) / 1000;
      isVisible = false;
      saveTimeToStorage();
    }
  } else {
    lastActiveTime = Date.now();
    isVisible = true;
  }
});

function getTotalSeconds() {
  if (isPaused) return timeSpentSeconds;
  const currentSession = isVisible ? (Date.now() - lastActiveTime) / 1000 : 0;
  return timeSpentSeconds + currentSession;
}

function saveTimeToStorage() {
  if (isPaused) return;
  chrome.storage.local.set({ [window.location.href]: getTotalSeconds() });
}

setInterval(saveTimeToStorage, 5000); // Save every 5 seconds

// Allow popup to request problem details manually
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PROBLEM_DETAILS') {
    sendResponse(getProblemDetails());
  }
});

// Best effort auto-logger for LeetCode
const observer = new MutationObserver(() => {
  if (hasLoggedAuto) return;
  
  const url = window.location.href;
  // LeetCode's submission tab typically displays an "Accepted" header
  if (url.includes('leetcode.com') && url.includes('/submissions/')) {
    const text = document.body.innerText;
    if (text.includes('Accepted') && !text.includes('Wrong Answer') && !text.includes('Time Limit Exceeded')) {
      hasLoggedAuto = true;
      console.log('[GrindSync] LeetCode solution Accepted. Auto-logging...');
      chrome.runtime.sendMessage({ 
        type: 'LOG_QUESTION', 
        payload: getProblemDetails() 
      }, (response) => {
        if (response?.success) {
          console.log('[GrindSync] Auto-logged successfully!', response.id);
        } else {
          console.error('[GrindSync] Auto-log failed:', response?.error);
        }
      });
    }
  }
});

// Start observing if we are on a platform
if (window.location.href.includes('leetcode.com') || window.location.href.includes('codeforces.com')) {
  observer.observe(document.body, { childList: true, subtree: true });
}

function extractPlatformAverageTime(platform) {
  if (platform !== 'leetcode') return null;
  // LeetCode submission result page shows runtime in ms, e.g. "Accepted\n42 ms"
  // Look for a pattern like "XX ms" near the accepted header
  const bodyText = document.body.innerText;
  const runtimeMatch = bodyText.match(/(\d+)\s*ms/);
  if (runtimeMatch) {
    const ms = parseInt(runtimeMatch[1], 10);
    // Convert milliseconds to minutes, minimum 0.1
    const mins = Math.max(0.1, Math.round((ms / 1000 / 60) * 10) / 10);
    return mins;
  }
  return null;
}

function getProblemDetails() {
  const url = window.location.href;
  let platform = 'unknown';
  let title = document.title;
  let difficulty = 'intermediate'; // Default fallback
  
  if (url.includes('leetcode.com')) {
    platform = 'leetcode';
    title = document.title.split(' - ')[0] || document.title;
    
    // Attempt to extract difficulty from LeetCode
    const text = document.body.innerText.toLowerCase();
    if (text.includes('easy')) difficulty = 'easy';
    else if (text.includes('medium')) difficulty = 'medium';
    else if (text.includes('hard')) difficulty = 'hard';
    
  } else if (url.includes('codeforces.com')) {
    platform = 'codeforces';
    title = document.title.replace(' - Codeforces', '').trim();
  }
  
  let totalMinutes = Math.round(getTotalSeconds() / 60);
  if (totalMinutes < 1) totalMinutes = 1;

  const platformAverageTime = extractPlatformAverageTime(platform);

  return { title, url, platform, timeTakenMins: totalMinutes, difficulty, platformAverageTime };
}
