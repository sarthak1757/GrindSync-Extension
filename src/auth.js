import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';

const googleLoginBtn = document.getElementById('googleLoginBtn');
const statusMsg = document.getElementById('statusMsg');

googleLoginBtn.addEventListener('click', async () => {
  try {
    googleLoginBtn.disabled = true;
    googleLoginBtn.textContent = 'Please wait...';
    
    // We create a fresh Google Auth provider
    const provider = new GoogleAuthProvider();
    // Prompt config to try to enforce the popup over redirect
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    // This now runs in a dedicated Chrome tab, which prevents the popup from aggressively closing!
    await signInWithPopup(auth, provider);
    
  } catch (error) {
    statusMsg.textContent = error.message;
    statusMsg.style.color = '#f87171';
    googleLoginBtn.disabled = false;
    googleLoginBtn.textContent = 'Try Again';
  }
});

// Auto-close tab when successfully authenticated
onAuthStateChanged(auth, (user) => {
  if (user) {
    statusMsg.textContent = 'Success! You can close this tab now.';
    statusMsg.style.color = '#4ade80';
    googleLoginBtn.style.display = 'none';
    setTimeout(() => window.close(), 1500);
  }
});
