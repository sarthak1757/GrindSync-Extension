import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, addDoc, collection, serverTimestamp } from 'firebase/firestore';

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
  const solvedAt = new Date().toISOString();
  const timeTakenMins = Number(payload.timeTakenMins || 20);
  const intervalDays = 3;
  const nextRevisionDate = new Date(solvedAt);
  nextRevisionDate.setDate(nextRevisionDate.getDate() + intervalDays);

  const question = {
    title: payload.title,
    url: payload.url,
    platform: payload.platform,
    topic: payload.topic || 'general',
    difficulty: normalizeDifficulty(payload.platform, payload.difficulty),
    solveHistory: [
      {
        solvedAt,
        timeTakenMins,
        felt: 'okay',
        notes: 'Logged via Extension',
      },
    ],
    revision: {
      nextRevisionDate: nextRevisionDate.toISOString(),
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
    scheduledFor: nextRevisionDate.toISOString(),
    status: 'pending',
    reason: 'Newly solved question needs reinforcement in 3 days.',
    createdAt: serverTimestamp(),
  });
  
  return questionRef.id;
}
