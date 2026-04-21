import { auth, logQuestion } from './firebase.js';

// Setup background listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'LOG_QUESTION') {
    handleLogQuestion(request.payload)
      .then((id) => sendResponse({ success: true, id }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep message channel open for async response
  }
});

function waitForAuth() {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user);
    }, error => {
      unsubscribe();
      reject(error);
    });
  });
}

async function handleLogQuestion(payload) {
  const user = await waitForAuth();
  if (!user) {
    throw new Error('User not logged in. Please log in via the GrindSync extension popup.');
  }
  return await logQuestion(user.uid, payload);
}
