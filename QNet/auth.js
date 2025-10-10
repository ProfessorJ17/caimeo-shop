import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  sendPasswordResetEmail
} from "firebase/auth";
import { getDatabase, ref, update, get, set, serverTimestamp } from "firebase/database";
import { runTransaction } from "firebase/database";
import { showError } from './ui.js';
import { awardDailyReward } from './rewards.js';

const firebaseConfig = {
  apiKey: "AIzaSyBCYd47pYB0e01_VblQlitnsjfNK02aiig",
  authDomain: "web-search-3276e.firebaseapp.com",
  databaseURL: "https://web-search-3276e.firebaseio.com",
  projectId: "web-search-3276e",
  storageBucket: "web-search-3276e.firebasestorage.app",
  messagingSenderId: "80681107085",
  appId: "1:80681107085:web:01985c7c264093d9052cc4"
};

// Initialize Firebase (modular)
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getDatabase(app);
export { db };

/* @tweakable Sign-in provider popup behavior (true = popup, false = redirect) */
const usePopup = true;
/* @tweakable Minimum password length (UI hint only; auth enforces rules) */
const minPasswordLength = 6;
/* @tweakable hide the email/password form when a user is authenticated */
const hideAuthUiWhenLoggedIn = true;
/* @tweakable enable Google sign-in (false disables UI and handlers) */
const enableGoogleSignIn = false;

let currentUserId = null;
let currentUserAdmin = false;

export function getCurrentUserId() {
  return currentUserId;
}

export function isAdmin(){ 
  const u = auth.currentUser;
  return !!currentUserAdmin;
}

export async function signUp(email, password, showError, username){
  if(password.length < minPasswordLength) return showError(`Password must be at least ${minPasswordLength} chars.`);
  try{
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCred.user;
    if(user){
      const displayName = (username && username.trim()) || email.split('@')[0];
      await updateProfile(user, { displayName });
      const now = new Date().toISOString();
      const kemPub = localStorage.getItem('pq.kem.pub') || '';
      const dsaPub = localStorage.getItem('pq.dsa.pub') || '';
      await set(ref(db, `users/${user.uid}`), {
        uid: user.uid,
        email,
        username: displayName,
        usernameLower: displayName.toLowerCase(),
        admin: false,
        purchased: false,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        pqKemPub: kemPub,
        pqDsaPub: dsaPub,
        qbitBalance: 0
      });
    }
    return userCred?.user;
  }catch(err){
    showError(err.message || 'Sign up failed');
  }
}

export async function signIn(email, password, showError){
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    showError(err.message || 'Sign in failed');
  }
}

export async function signInWithGoogle(showError){
  const provider = new GoogleAuthProvider();
  try{
    if(usePopup){
      await signInWithPopup(auth, provider);
    }else{
      await signInWithRedirect(auth, provider);
    }
  }catch(err){
    showError(err.message || 'Google sign-in failed');
  }
}

export function signOut(){
  (async ()=>{
    try{
      const uid = auth.currentUser?.uid;
      // remove presence node immediately on sign-out so user disappears from online list
      if (uid) await set(ref(db, `presence/${uid}`), null);
      await fbSignOut(auth);
    } finally {
      // keep local quantum keys for later use; do not clear pq.hasKeys/pq.cloudSaved
      try{ localStorage.removeItem('pq.hasKeys'); localStorage.removeItem('pq.cloudSaved'); localStorage.removeItem('pq.owner'); }catch(_){}
      location.reload();
    }
  })();
}

export function initAuth(onUserChange, showError, clearError) {
  // Elements
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const signInBtn = document.getElementById('signInBtn');
  const signUpBtn = document.getElementById('signUpBtn');
  const googleBtn = document.getElementById('googleSignIn');
  const signOutBtn = document.getElementById('signOutBtn');
  const authUi = document.getElementById('auth-ui');
  const accountArea = document.getElementById('account-area');
  const registerLink = document.getElementById('registerLink');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  // UI wiring
  signUpBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    signUp(emailInput.value.trim(), passwordInput.value, showError);
  });
  signInBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    signIn(emailInput.value.trim(), passwordInput.value, showError);
  });

  // Only wire Google button if enabled and present
  if (enableGoogleSignIn && googleBtn) {
    googleBtn.addEventListener('click', (e) => { 
      e.preventDefault(); 
      clearError();
      signInWithGoogle(showError); 
    });
  }

  signOutBtn.addEventListener('click', (e) => { e.preventDefault(); signOut(); });

  if (registerLink) {
    registerLink.addEventListener('click', (e)=>{ e.preventDefault(); clearError(); openRegisterModal(); });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e)=>{
      e.preventDefault();
      clearError();
      openForgotModal();
    });
  }

  // Auth state observer using modular onAuthStateChanged
  onAuthStateChanged(auth, async (user) => {
    clearError();
    if(user){
      currentUserId = user.uid;
      if (hideAuthUiWhenLoggedIn) authUi.classList.add('hidden');
      accountArea.classList.remove('hidden');
      signOutBtn.classList.remove('hidden');
      const resolvedName = await resolveUserDisplayName(user);
      window.qnetUsername = resolvedName;
      const pqNameEl = document.getElementById('pqUserName');
      if (pqNameEl) pqNameEl.textContent = resolvedName;
      const uid = user.uid;
      const snap = await get(ref(db, `users/${uid}`)).catch(()=>null);
      const val = snap && snap.exists() ? snap.val() : {};
      
      let qbitBalance = val.qbitBalance != null ? Number(val.qbitBalance) : 0;
      const TIMESTAMP_THRESHOLD = 1000000000000; // 1 trillion (roughly year 2001 in ms)

      // Sanitize corrupted QBitCoin balance if it looks like a timestamp
      if (qbitBalance >= TIMESTAMP_THRESHOLD) {
          console.warn(`[AUTH] QBitCoin balance (${qbitBalance}) detected as potential timestamp. Resetting balance to 0.`);
          try {
              // Atomically reset balance to 0 in DB
              await runTransaction(ref(db, `users/${uid}/qbitBalance`), () => 0);
              qbitBalance = 0; // Use 0 for subsequent local checks
          } catch(e) {
              console.error('Failed to reset corrupted balance:', e);
          }
      } else {
          qbitBalance = Number(val.qbitBalance || 0);
      }

      currentUserAdmin = !!val.admin;
      document.dispatchEvent(new CustomEvent('adminStatusChanged',{ detail:{ isAdmin: currentUserAdmin }}));
      const credEl = document.getElementById('pqCredentials');
      if (credEl) { credEl.textContent = currentUserAdmin ? 'Admin' : 'None'; credEl.classList.toggle('cred-admin', currentUserAdmin); credEl.classList.toggle('cred-none', !currentUserAdmin); }
      // ensure admin tab visibility updates immediately
      const tabAdmin = document.getElementById('tabAdmin');
      if (tabAdmin) { 
        if (currentUserAdmin) tabAdmin.classList.remove('hidden'); 
        else tabAdmin.classList.add('hidden'); 
      }
      // If currently viewing admin section and not admin, redirect to projects
      const adminView = document.getElementById('adminView');
      if (!currentUserAdmin && adminView && !adminView.classList.contains('hidden')) {
        const showProjects = (await import('./admin.js')).showProjects || (() => {
          const projectsList = document.getElementById('projectsList');
          if (projectsList) projectsList.classList.remove('hidden');
          if (adminView) adminView.classList.add('hidden');
        });
        showProjects();
      }
      
      const tabQuantum = document.getElementById('tabQuantum');
      const tabSocial = document.getElementById('tabSocial');
      const newProjectBtn = document.getElementById('newProjectBtn');
      const confirmed = (localStorage.getItem('pq.cloudSaved') === '1') || (!!val.pqKemPub && !!val.pqDsaPub);
      tabQuantum && tabQuantum.classList.toggle('hidden', !confirmed);
      tabSocial && tabSocial.classList.toggle('hidden', !confirmed);
      newProjectBtn && (newProjectBtn.style.display = confirmed ? '' : 'none');
      const createdEl = document.getElementById('pqCreated');
      const lastEl = document.getElementById('pqLastLogin');
      const qbitEl = document.getElementById('qbitBalance');
      const toText = (v)=> typeof v === 'number' ? new Date(v).toLocaleString() : (v ? new Date(v).toLocaleString() : '—');
      if (createdEl) createdEl.textContent = toText(val.createdAt);
      if (lastEl) lastEl.textContent = toText(val.lastLogin);
      if (qbitEl) qbitEl.textContent = String(qbitBalance); // Display sanitized balance initially
      const statusEl = document.getElementById('pqGateStatus');
      try{ 
        const plan = await getUserPlanStatus(); 
        if (statusEl) statusEl.textContent = plan; 
        const memberEl = document.getElementById('pqMemberStatus');
        if (memberEl) { const premium = (plan === 'Premium'); memberEl.textContent = premium ? 'VIP' : 'Free'; memberEl.classList.toggle('vip-badge', premium); memberEl.classList.toggle('member-free', !premium); }
      }catch(_){}
      await update(ref(db, `users/${uid}`), { lastLogin: serverTimestamp() });
      try { await awardDailyReward(db, uid, { ref, get, update, serverTimestamp, runTransaction }); } catch(_){}
      // re-fetch to ensure timestamps resolve, then update UI fields
      try{
        const snap2 = await get(ref(db, `users/${uid}`));
        const v2 = snap2.exists() ? snap2.val() : {};
        if (createdEl) createdEl.textContent = toText(v2.createdAt);
        if (lastEl) lastEl.textContent = toText(v2.lastLogin);
        
        // Final check and dispatch using the most recent DB value after daily reward transaction
        const finalBal = (typeof v2.qbitBalance === 'number') ? v2.qbitBalance : ((v2.qbitBalance != null) ? Number(v2.qbitBalance) : 0);
        if (qbitEl) qbitEl.textContent = String(finalBal);
        window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid: user.uid, balance: finalBal } }));

      }catch(_){}
      onUserChange(currentUserId);
      document.dispatchEvent(new CustomEvent('authUserChanged',{ detail:{ user:{ id:user.uid, name: resolvedName } } }));
    }else{
      currentUserId = null;
      authUi.classList.remove('hidden');
      accountArea.classList.add('hidden');
      signOutBtn.classList.add('hidden');
      const tabSocial = document.getElementById('tabSocial');
      if (tabSocial) tabSocial.classList.add('hidden');
      onUserChange(null);
      document.dispatchEvent(new CustomEvent('authUserChanged',{ detail:{ user:null } }));
      currentUserAdmin = false;
      document.dispatchEvent(new CustomEvent('adminStatusChanged',{ detail:{ isAdmin: false }}));
    }
  });
}

async function resolveUserDisplayName(user){
  const fallback = user?.displayName || (user?.email ? user.email.split('@')[0] : '');
  try{
    const uid = user?.uid;
    const snap = await get(ref(db, `users/${uid}`));
    const val = snap.exists() ? snap.val() : null;
    if (val && val.username) return String(val.username);
  }catch(_){}
  return fallback;
}

function openRegisterModal(){
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  const wrap = document.createElement('div'); wrap.className = 'modal';
  const preEmail = (document.getElementById('emailInput')?.value||'').trim();
  const prePass = document.getElementById('passwordInput')?.value||'';
  wrap.innerHTML = `
    <h3>Create an account</h3>
    <div class="row"><label style="min-width:90px;color:var(--muted)">Email</label><input id="reg-email" type="email" value="${preEmail}" placeholder="you@example.com"></div>
    <div class="row"><label style="min-width:90px;color:var(--muted)">Password</label><input id="reg-pass" type="password" value="${prePass}" placeholder="Minimum ${minPasswordLength} characters"></div>
    <div class="row"><label style="min-width:90px;color:var(--muted)">Username</label><input id="reg-name" type="text" placeholder="Display name"></div>
    <div class="actions"><button id="reg-cancel" class="btn outline">Cancel</button><button id="reg-submit" class="btn">Submit</button></div>
  `;
  overlay.appendChild(wrap); document.body.appendChild(overlay);
  const close=()=> overlay.remove();
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  wrap.querySelector('#reg-cancel')?.addEventListener('click', close);
  wrap.querySelector('#reg-submit')?.addEventListener('click', async ()=>{
    const email = wrap.querySelector('#reg-email').value.trim();
    const pass = wrap.querySelector('#reg-pass').value;
    const name = wrap.querySelector('#reg-name').value.trim();
    const btn = wrap.querySelector('#reg-submit'); btn.disabled = true;
    const u = await signUp(email, pass, showError, name);
    if(u) close(); else btn.disabled = false;
  });
}

function openForgotModal(){
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; const wrap=document.createElement('div'); wrap.className='modal';
  const preEmail=(document.getElementById('emailInput')?.value||'').trim();
  wrap.innerHTML=`<h3>Reset password</h3><div class="row"><label style="min-width:90px;color:var(--muted)">Username or Email</label><input id="fp-ue" type="text" value="${preEmail}" placeholder="username or you@example.com"></div><div class="actions"><button id="fp-cancel" class="btn outline">Cancel</button><button id="fp-submit" class="btn">Submit</button></div>`;
  overlay.appendChild(wrap); document.body.appendChild(overlay);
  const close=()=>overlay.remove(); overlay.addEventListener('click',(e)=>{ if(e.target===overlay) close(); });
  wrap.querySelector('#fp-cancel')?.addEventListener('click', close);
  wrap.querySelector('#fp-submit')?.addEventListener('click', async ()=>{
    const ue=wrap.querySelector('#fp-ue').value.trim(); 
    if(!ue) return showError('Enter your username or email.');
    if(ue.includes('@')){ try{ await sendPasswordResetEmail(auth, ue); close(); showError(`Password reset email sent to ${ue}.`);}catch(err){ showError(err.message||'Failed to send reset email'); } }
    else { showError('Please enter your email address to receive a reset link.'); }
  });
}

export async function getUserPlanStatus(){
  try{
    const uid = auth.currentUser?.uid; if(!uid) return 'Free';
    const snap = await get(ref(db, `users/${uid}`)); if(!snap.exists()) return 'Free';
    const d = snap.val()||{}; const purchased = !!d.purchased;
    const end = d.dayEnd ? new Date(d.dayEnd) : null;
    if (!purchased) return 'Free';
    if (end && end <= new Date()) return 'Free';
    return 'Premium';
  }catch{ return 'Free'; }
}

export async function saveQuantumKeysToDb({ kemPub = '', dsaPub = '' } = {}) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await update(ref(getDatabase(), `users/${uid}`), {
    pqKemPub: kemPub,
    pqDsaPub: dsaPub,
    pqHasKeys: true,
    pqKeysUpdatedAt: serverTimestamp(),
    pqKeysGeneratedAt: serverTimestamp()
  });
  try { localStorage.setItem(`pq.cloudSaved.${uid}`,'1'); } catch {}
}