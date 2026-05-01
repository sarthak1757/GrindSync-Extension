import { auth, createExtensionChallenge, getChallengeFriends, logQuestion, updatePerceivedDifficulty } from './firebase.js';

// Setup background listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'LOG_QUESTION') {
    handleLogQuestion(request.payload)
      .then((id) => sendResponse({ success: true, id }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep message channel open for async response
  }

  if (request.type === 'UPDATE_PERCEIVED_DIFFICULTY') {
    handleUpdatePerceived(request.payload)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }

  if (request.type === 'GET_CHALLENGE_FRIENDS') {
    handleGetChallengeFriends()
      .then((friends) => sendResponse({ success: true, friends }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }

  if (request.type === 'SEND_CHALLENGE') {
    handleSendChallenge(request.payload)
      .then((id) => sendResponse({ success: true, id }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
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

async function handleUpdatePerceived(payload) {
  const user = await waitForAuth();
  if (!user) {
    throw new Error('User not logged in.');
  }
  return await updatePerceivedDifficulty(user.uid, payload.questionId, payload.perceivedDifficulty);
}

async function handleGetChallengeFriends() {
  const user = await waitForAuth();
  if (!user) {
    throw new Error('User not logged in. Please log in via the GrindSync extension popup.');
  }
  return await getChallengeFriends(user.uid);
}

async function handleSendChallenge(payload) {
  const user = await waitForAuth();
  if (!user) {
    throw new Error('User not logged in. Please log in via the GrindSync extension popup.');
  }
  return await createExtensionChallenge(user, payload);
}
