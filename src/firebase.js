import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, addDoc, collection, doc, getDocs, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Simple normalizer replicating the core app's logic
function normalizeDifficulty(platform, difficulty) {
  const p = String(platform || '').toLowerCase();
  const d = String(difficulty || '').toLowerCase();

  if (p === 'leetcode') {
    if (d === 'easy') return 'beginner';
    if (d === 'medium') return 'intermediate';
    if (d === 'hard') return 'advanced';
  }

  if (p === 'codeforces') {
    const rating = Number(d);
    if (rating >= 800 && rating <= 1200) return 'beginner';
    if (rating > 1200 && rating <= 1800) return 'intermediate';
    if (rating > 1800) return 'advanced';
  }

  return d || 'intermediate';
}

export async function logQuestion(userId, payload) {
  const solvedAtTimestamp = Timestamp.now()
  const timeTakenMins = Number(payload.timeTakenMins || 20);
  const intervalDays = 3;
  const nextRevisionDate = solvedAtTimestamp.toDate();
  nextRevisionDate.setDate(nextRevisionDate.getDate() + intervalDays);
  const nextRevisionTimestamp = Timestamp.fromDate(nextRevisionDate);

  // platformAverageTime: convert from ms -> minutes already handled in content.js
  const platformAverageTime = typeof payload.platformAverageTime === 'number' ? payload.platformAverageTime : null;

  const question = {
    title: payload.title,
    url: payload.url,
    platform: payload.platform,
    topic: payload.topic || 'general',
    difficulty: normalizeDifficulty(payload.platform, payload.difficulty),
    perceivedDifficulty: null,          // Set later when user picks Easy / Okay / Hard
    platformAverageTime,                // Runtime metric scraped from LeetCode (mins), or null
    solveHistory: [
      {
        solvedAt: solvedAtTimestamp,
        timeTakenMins,
        felt: 'okay',
        notes: 'Logged via Extension',
      },
    ],
    revision: {
      nextRevisionDate: nextRevisionTimestamp,
      intervalDays,
      totalAttempts: 1,
      averageTimeMins: timeTakenMins,
      masteryScore: 50,
    },
    addedVia: 'extension',
    createdAt: serverTimestamp(),
  };

  const questionRef = await addDoc(collection(db, 'users', userId, 'questions'), question);
  
  await addDoc(collection(db, 'users', userId, 'revisionQueue'), {
    questionId: questionRef.id,
    questionTitle: question.title,
    scheduledFor: nextRevisionTimestamp,
    status: 'pending',
    reason: 'Newly solved question needs reinforcement in 3 days.',
    createdAt: serverTimestamp(),
  });
  
  return questionRef.id;
}

/**
 * Patches the perceivedDifficulty field on an already-saved question document.
 * Called asynchronously after the user clicks Easy / Okay / Hard in the toast.
 */
export async function updatePerceivedDifficulty(userId, questionId, perceivedDifficulty) {
  const questionRef = doc(db, 'users', userId, 'questions', questionId);
  await updateDoc(questionRef, { perceivedDifficulty });
}

export async function getChallengeFriends(userId) {
  const groupsSnap = await getDocs(collection(db, 'groups'));
  const friendsById = new Map();

  groupsSnap.docs.forEach((groupDoc) => {
    const group = { id: groupDoc.id, ...groupDoc.data() };
    const members = Array.isArray(group.members) ? group.members : [];
    const isInGroup = members.some((member) => member.userId === userId);
    if (!isInGroup) return;

    members.forEach((member) => {
      if (!member.userId || member.userId === userId) return;
      const existing = friendsById.get(member.userId);
      friendsById.set(member.userId, {
        userId: member.userId,
        displayName: member.displayName || member.email || 'Friend',
        photoURL: member.photoURL || '',
        groups: [...(existing?.groups || []), { id: group.id, name: group.name || group.title || 'Group' }],
      });
    });
  });

  return Array.from(friendsById.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function createExtensionChallenge(user, payload) {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const timeTakenMins = Math.max(1, Number(payload.timeTakenMins || 1));

  const challenge = {
    questionId: payload.questionId || payload.questionUrl || payload.url,
    questionTitle: payload.questionTitle || payload.title,
    questionUrl: payload.questionUrl || payload.url,
    difficulty: payload.difficulty || 'intermediate',
    topic: payload.topic || 'general',
    challenger: {
      userId: user.uid,
      displayName: user.displayName || user.email || 'GrindSync User',
      status: 'solved',
      timeTakenMins,
      solvedAt: now,
    },
    challenged: {
      userId: payload.friend.userId,
      displayName: payload.friend.displayName,
      status: 'pending',
    },
    groupId: payload.groupId || null,
    status: 'active',
    winner: null,
    expiresAt,
    createdAt: now,
    source: 'extension-widget',
  };

  const challengeRef = await addDoc(collection(db, 'challenges'), challenge);
  return challengeRef.id;
}
