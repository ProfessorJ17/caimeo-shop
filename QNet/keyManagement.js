import { updateGate } from './quantum.js';
import { saveQuantumKeysToDb } from './auth.js';
import { auth, db } from './auth.js';
import { bytesToB64 } from './encryption.js';
import { update, ref, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';

export function getKeyOrEmpty(k){ 
  // k is the base key like 'pq.kem.pub' - store per-user to avoid cross-account leakage
  const uid = auth.currentUser?.uid || localStorage.getItem('pq.owner') || '';
  if (!uid) return localStorage.getItem(k) || '';
  return localStorage.getItem(`${k}.${uid}`) || '';
}

export function copyText(t){ 
  try{ navigator.clipboard.writeText(t); }catch(_){ /* ignore */ } 
}

export function openKeysViewer(){
  const overlay = document.createElement('div'); 
  overlay.className = 'modal-overlay';
  const wrap = document.createElement('div'); 
  wrap.className = 'modal';
  const kemPub = getKeyOrEmpty('pq.kem.pub'), kemPriv = getKeyOrEmpty('pq.kem.priv');
  const dsaPub = getKeyOrEmpty('pq.dsa.pub'), dsaPriv = getKeyOrEmpty('pq.dsa.priv');
  
  wrap.innerHTML = `
    <h3>Quantum Keys</h3>
    <div class=\"key-row\"><label style=\"min-width:110px;color:var(--muted)\">Kyber Public</label><textarea id=\"kk-pub\" readonly>${kemPub}</textarea><button class=\"btn outline tiny\" id=\"kk-pub-copy\">Copy</button></div>
    <div class=\"key-row\"><label style=\"min-width:110px;color:var(--muted)\">Kyber Private</label><textarea id=\"kk-priv\" readonly>${kemPriv}</textarea><button class=\"btn outline tiny\" id=\"kk-priv-copy\">Copy</button></div>
    <div class=\"key-row\"><label style=\"min-width:110px;color:var(--muted)\">Dilithium Public</label><textarea id=\"dd-pub\" readonly>${dsaPub}</textarea><button class=\"btn outline tiny\" id=\"dd-pub-copy\">Copy</button></div>
    <div class=\"key-row\"><label style=\"min-width:110px;color:var(--muted)\">Dilithium Private</label><textarea id=\"dd-priv\" readonly>${dsaPriv}</textarea><button class=\"btn outline tiny\" id=\"dd-priv-copy\">Copy</button></div>
    <div class=\"actions\"><button class=\"btn outline\" id=\"kk-upload\">Upload Public Keys</button><button class=\"btn outline\" id=\"keys-close\">Close</button></div>
  `;
  
  overlay.appendChild(wrap); 
  document.body.appendChild(overlay);
  
  const byId = (id)=> wrap.querySelector('#'+id);
  byId('kk-pub-copy')?.addEventListener('click', ()=> copyText(byId('kk-pub').value));
  byId('kk-priv-copy')?.addEventListener('click', ()=> copyText(byId('kk-priv').value));
  byId('dd-pub-copy')?.addEventListener('click', ()=> copyText(byId('dd-pub').value));
  byId('dd-priv-copy')?.addEventListener('click', ()=> copyText(byId('dd-priv').value));
  
  // Upload public keys to RTDB for current signed-in user
  byId('kk-upload')?.addEventListener('click', async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { alert('Sign in to upload public keys.'); return; }
      const pubKem = byId('kk-pub')?.value || '';
      const pubDsa = byId('dd-pub')?.value || '';
      if (!pubKem && !pubDsa) { alert('No public keys found to upload.'); return; }
      await saveQuantumKeysToDb({ kemPub: pubKem, dsaPub: pubDsa });
      try { localStorage.setItem(`pq.cloudSaved.${uid}`, '1'); localStorage.setItem('pq.cloudSaved','1'); } catch(_) {}
      alert('Public keys uploaded to cloud. You can now use messaging and Q-Social.');
      updateGate(); // refresh UI gate state
    } catch (e) {
      console.warn('Upload failed', e);
      alert('Upload failed: ' + (e?.message || e));
    }
  });
  
  const close=()=> overlay.remove(); 
  byId('keys-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
}

export async function deleteKeysFromCloudAndLocal(){
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  
  const confirmed = confirm('Are you sure you want to delete your Quantum Keys locally AND from the cloud? You will need to generate new ones to use Quantum/Social features.');
  if (!confirmed) return;

  // 1. Clear keys from RTDB user profile
  try {
    await update(ref(db, `users/${uid}`), {
      pqKemPub: null,
      pqDsaPub: null,
      pqHasKeys: null, // explicitly remove the field
      pqKeysUpdatedAt: serverTimestamp(),
      pqKeysGeneratedAt: null // remove generation timestamp too
    });
  } catch (e) {
    console.error("Failed to delete cloud keys:", e);
  }

  // 2. Clear local storage (per-user keys)
  try {
    localStorage.removeItem(`pq.kem.pub.${uid}`);
    localStorage.removeItem(`pq.kem.priv.${uid}`);
    localStorage.removeItem(`pq.dsa.pub.${uid}`);
    localStorage.removeItem(`pq.dsa.priv.${uid}`);
    // remove legacy/owner markers if present
    if (localStorage.getItem('pq.owner') === uid) localStorage.removeItem('pq.owner');
    // global flags are kept or cleared in a safe way: only clear cloudSaved for this user
    localStorage.setItem(`pq.hasKeys.${uid}`, '0');
    localStorage.setItem(`pq.cloudSaved.${uid}`, '0');
  } catch(_) {}
  
  updateGate();
  alert('Quantum keys deleted locally and from cloud storage.');
}

export async function openKeygenFlow(){
  try{
    const pass = prompt('Passphrase for E2EE (min 12 chars recommended):'); 
    if(!pass) return;
    const salt = prompt('Salt (optional but recommended):') || '';
    const iters = Number(prompt('PBKDF2 iterations', '120000') || '120000');
    const kem = await import('https://esm.sh/@noble/post-quantum@0.5.1/ml-kem.js?bundle');
    const dsa = await import('https://esm.sh/@noble/post-quantum@0.5.1/ml-dsa.js?bundle');
    const enc = new TextEncoder();
    const derive = async (len)=>{ const k=await crypto.subtle.importKey('raw', enc.encode(pass), {name:'PBKDF2'}, false, ['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2', salt: enc.encode(salt), iterations: iters, hash:'SHA-256'}, k, len*8); return new Uint8Array(bits); };
    const kemKeys = kem.ml_kem768.keygen(await derive(64));
    const dsaKeys = dsa.ml_dsa65.keygen(await derive(32));
    const uid = auth.currentUser?.uid || '';
    if (!uid) {
      alert('Must be signed in to generate keys.');
      return;
    }
    localStorage.setItem(`pq.kem.pub.${uid}`, bytesToB64(kemKeys.publicKey)); 
    localStorage.setItem(`pq.kem.priv.${uid}`, bytesToB64(kemKeys.secretKey));
    localStorage.setItem(`pq.dsa.pub.${uid}`, bytesToB64(dsaKeys.publicKey)); 
    localStorage.setItem(`pq.dsa.priv.${uid}`, bytesToB64(dsaKeys.secretKey));
    localStorage.setItem(`pq.hasKeys.${uid}`,'1');
    localStorage.setItem('pq.owner', uid); // legacy pointer to current owner session
    await saveQuantumKeysToDb({ kemPub: bytesToB64(kemKeys.publicKey), dsaPub: bytesToB64(dsaKeys.publicKey) });
    localStorage.setItem(`pq.cloudSaved.${uid}`,'1');
    updateGate(); 
    alert('Quantum keys generated and stored locally.');
  }catch(e){ 
    alert('Key generation failed: ' + (e.message||e)); 
  }
}