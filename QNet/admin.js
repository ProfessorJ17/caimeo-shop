import { db, isAdmin } from './auth.js';
import { get, ref, update, remove, onValue, runTransaction, serverTimestamp } from 'firebase/database';
import { setupVisibilityToggles } from './ui.js';

const PAGE_SIZE = 10;
let adminFeedPage = 1, adminPostsCache = [];

// Constants for redemption context (Mirrored from projects.js)
const REDEEM_COST = 29470;
const REDEEM_RTDB_PATH = 'rhodiumRedemptionStatus';

function computeStatus(u){
  const purchased = !!u.purchased;
  const endRaw = u.dayEnd;
  const end = endRaw ? new Date(typeof endRaw === 'number' ? endRaw : endRaw) : null;
  if (!purchased) return 'Free';
  if (end && end <= new Date()) return 'Free';
  return 'Premium';
}

async function loadAllUsers(){
  const list = document.getElementById('adminUsersList');
  if (!list) return;
  list.innerHTML = '';
  try{
    const snap = await get(ref(db, 'users'));
    if (!snap.exists()) { list.innerHTML = '<div class=\"empty\">No users found.</div>'; return; }
    const data = snap.val() || {};
    const rows = Object.values(data).map((u, idx) => ({
      uid: u.uid,
      label: `user${idx+1}`,
      username: u.username || (u.email ? String(u.email).split('@')[0] : '(unknown)'),
      email: u.email || '(no email)',
      status: computeStatus(u),
      purchased: !!u.purchased
    }));
    rows.forEach(r=>{
      const div = document.createElement('div');
      div.className = 'admin-row';
      div.innerHTML = `<div><div class=\"project-name\">${r.label} — ${r.username}</div><div class=\"project-meta\">${r.email}</div></div><div class=\"project-meta\">Member: <strong>${r.status}</strong></div><div class=\"row\"><button class=\"btn outline tiny toggle\" data-uid=\"${r.uid}\" data-p=\"${r.purchased ? '1':'0'}\">${r.purchased ? 'Set Free':'Set Premium'}</button><button class=\"btn danger tiny wipe\" data-uid=\"${r.uid}\">Delete User Files</button></div>`;
      list.appendChild(div);
    });
    list.querySelectorAll('.toggle').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const uid = btn.dataset.uid; const cur = btn.dataset.p === '1';
        const nextPurchased = !cur;
        const dayEnd = nextPurchased ? new Date(Date.now() + 30*24*60*60*1000).toISOString() : null;
        try{
          await update(ref(db, `users/${uid}`), { purchased: nextPurchased, dayEnd });
          loadAllUsers();
        }catch(_){}
      });
    });
    list.querySelectorAll('.wipe').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const uid = btn.dataset.uid;
        if (!confirm('Delete all files/projects for this user? This cannot be undone.')) return;
        try{
          // remove RTDB userFiles bucket
          await remove(ref(db, `userFiles/${uid}`));
          // delete projects via WebsimSocket
          const room = new WebsimSocket();
          const projects = room.collection('project_v1').filter({ owner_id: uid }).getList() || [];
          for (const p of projects) {
            try{ await room.collection('project_v1').delete(p.id); }catch(_){}
          }
          loadAllUsers();
        }catch(_){}
      });
    });
  }catch(e){
    list.innerHTML = `<div class="empty">Failed to load users.</div>`;
    try { await loadAllUsersFromFirestore(list); } catch (_) { /* keep error */ }
  }
}

let unsubWall = null;

function showAdmin(){
  // Guard: only allow admins to view this section
  if (!isAdmin()) {
    alert('Access denied: Admin privileges required');
    showProjects();
    return;
  }
  
  const projectsList = document.getElementById('projectsList');
  const quantumView = document.getElementById('quantumView');
  const pqGate = document.getElementById('pqGate');
  const adminView = document.getElementById('adminView');
  const socialView = document.getElementById('socialView');
  const accountDetailsSection = document.getElementById('accountDetailsSection');
  const projectsListSection = document.getElementById('projectsListSection');

  // HIDE ACCOUNT SECTIONS
  if (accountDetailsSection) accountDetailsSection.style.display = 'none';
  if (projectsListSection) projectsListSection.style.display = 'none';
  
  projectsList.classList.add('hidden');
  quantumView.classList.add('hidden');
  if (pqGate) { 
    pqGate.classList.add('hidden');
    pqGate.style.display = 'none'; 
  }
  adminView.classList.remove('hidden');
  if (socialView) socialView.classList.add('hidden');
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) { newProjectBtn.classList.add('hidden'); newProjectBtn.style.display = 'none'; }
  const hamb = document.getElementById('toggleUsersSidebarBtn');
  if (hamb) { hamb.classList.add('hidden'); hamb.style.display = 'none'; }
  loadAllUsers();
  loadAllSites();
  loadAdminWallFeed();
  loadQBCModeration();
}

export function showProjects(){
  const projectsList = document.getElementById('projectsList');
  const adminView = document.getElementById('adminView');
  const quantumView = document.getElementById('quantumView');
  const pqGate = document.getElementById('pqGate');
  const socialView = document.getElementById('socialView');
  const accountDetailsSection = document.getElementById('accountDetailsSection'); 
  const projectsListSection = document.getElementById('projectsListSection'); 
  
  adminView.classList.add('hidden');
  quantumView.classList.add('hidden');
  if (socialView) socialView.classList.add('hidden');

  // 1. Ensure parent sections are visible (Account tab is active)
  if (accountDetailsSection) accountDetailsSection.style.display = ''; 
  if (projectsListSection) projectsListSection.style.display = ''; 
  
  // 2. Restore visibility to default/user preference state
  setupVisibilityToggles();
  
  // 3. Ensure containers don't have the 'hidden' class 
  if (pqGate) { 
    pqGate.classList.remove('hidden'); 
  }
  projectsList.classList.remove('hidden');
  
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) { newProjectBtn.classList.remove('hidden'); newProjectBtn.style.display = ''; }
  const hamb = document.getElementById('toggleUsersSidebarBtn');
  if (hamb) { hamb.classList.add('hidden'); hamb.style.display = 'none'; }
}

function showQuantum(){
  const projectsList = document.getElementById('projectsList');
  const adminView = document.getElementById('adminView');
  const quantumView = document.getElementById('quantumView');
  const pqGate = document.getElementById('pqGate');
  const socialView = document.getElementById('socialView');
  const accountDetailsSection = document.getElementById('accountDetailsSection'); // ADDED
  const projectsListSection = document.getElementById('projectsListSection'); // ADDED

  adminView.classList.add('hidden');
  projectsList.classList.add('hidden');
  if (pqGate) pqGate.classList.add('hidden');

  if (accountDetailsSection) accountDetailsSection.style.display = 'none'; // HIDE SECTION
  if (projectsListSection) projectsListSection.style.display = 'none'; // HIDE SECTION

  quantumView.classList.remove('hidden');
  if (socialView) socialView.classList.add('hidden');
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) { newProjectBtn.classList.add('hidden'); newProjectBtn.style.display = 'none'; }
  const hamb = document.getElementById('toggleUsersSidebarBtn');
  if (hamb) { hamb.classList.add('hidden'); hamb.style.display = 'none'; }
}

function wireTabs(){
  const tabAdmin = document.getElementById('tabAdmin');
  const tabProjects = document.getElementById('tabProjects');
  const tabQuantum = document.getElementById('tabQuantum');
  if (tabAdmin) tabAdmin.addEventListener('click', showAdmin);
  if (tabProjects) tabProjects.addEventListener('click', showProjects);
  if (tabQuantum) tabQuantum.addEventListener('click', showQuantum);
}

function setAdminTabVisibility(isAdmin){
  const tabAdmin = document.getElementById('tabAdmin');
  if (!tabAdmin) return;
  if (isAdmin) tabAdmin.classList.remove('hidden'); else tabAdmin.classList.add('hidden');
  // If admin tab is hidden and currently visible view is admin, switch back to projects
  const adminView = document.getElementById('adminView');
  if (!isAdmin && adminView && !adminView.classList.contains('hidden')) showProjects();
}

document.addEventListener('DOMContentLoaded', wireTabs);
/* initialize visibility on load based on current auth state */
document.addEventListener('DOMContentLoaded', () => setAdminTabVisibility(!!isAdmin()));
document.addEventListener('adminStatusChanged', (e)=> setAdminTabVisibility(!!e.detail?.isAdmin));

async function loadAllSites(){
  const list = document.getElementById('adminSitesList');
  if (!list) return;
  list.innerHTML = '';
  try{
    const room = new WebsimSocket();
    const published = room.collection('project_v1').filter({ published: true }).getList() || [];
    const usersSnap = await get(ref(db, 'users'));
    const usersData = usersSnap.exists() ? usersSnap.val() : {};
    const userOptions = Object.values(usersData).map((u, idx) => ({ uid: u.uid, label: `user${idx+1}`, name: u.username || (u.email ? String(u.email).split('@')[0] : '(unknown)') }));
    if (!published.length) { list.innerHTML = '<div class=\"empty\">No websites found.</div>'; return; }
    published.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'admin-row';
      const slug = p.page_slug || '(no slug)';
      const optionsHtml = userOptions.map(u => `<option value="${u.uid}">${u.label} — ${u.name}</option>`).join('');
      div.innerHTML = `<div><div class="project-name">${p.name || 'Untitled'}</div><div class="project-meta">${slug}</div></div><div class="row"><select class="owner-select" data-id="${p.id}">${optionsHtml}</select><button class="btn outline tiny transfer-site" data-id="${p.id}">Transfer Ownership</button><button class="btn danger tiny del-site" data-id="${p.id}">Delete Website</button></div>`;
      list.appendChild(div);
    });
    list.querySelectorAll('.del-site').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if (!confirm('Delete this website? This cannot be undone.')) return;
        try{
          const room = new WebsimSocket();
          await room.collection('project_v1').delete(btn.dataset.id);
          loadAllSites();
        }catch(_){}
      });
    });
    list.querySelectorAll('.transfer-site').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.id;
        const sel = btn.closest('.row')?.querySelector('.owner-select[data-id="'+id+'"]');
        const newOwner = sel?.value || '';
        if (!newOwner) return;
        if (!confirm('Transfer ownership of this website?')) return;
        try{
          const room = new WebsimSocket();
          await room.collection('project_v1').update(id, { owner_id: newOwner, updated_at: new Date().toISOString() });
          loadAllSites();
        }catch(_){}
      });
    });
  }catch(_){
    list.innerHTML = '<div class="empty">Failed to load websites.</div>';
  }
}

function loadAdminWallFeed(){
  const list = document.getElementById('adminWallFeedList'); if (!list) return;
  if (unsubWall) unsubWall();
  const feedRef = ref(db, 'socialFeed');
  unsubWall = onValue(feedRef, (snap)=>{
    list.innerHTML = '';
    if (!snap.exists()) { list.innerHTML = '<div class="empty">No posts found.</div>'; adminPostsCache = []; return; }
    const posts = [];
    snap.forEach(c=>{
      // keep full post data but avoid forcing seq=0; let rendering assign a stable global index
      posts.push({ id: c.key, ...c.val() });
    });
    adminPostsCache = posts;
    adminFeedPage = 1;
    renderAdminWallPage();
  });
}

function createAdminPostRow(p, num){
  const div=document.createElement('div'); div.className='admin-row';
  const time=p.timestamp?new Date(p.timestamp).toLocaleString():'';
  // Prefer permanent postNumber if present; fall back to the computed index
  const numLabel = (typeof p.postNumber === 'number') ? p.postNumber : num;
  // Show UI display name in list, but include a hidden owner-info span so admins can see real poster when anon is true
  const uiName = p.displayName || p.username || 'User';
  div.innerHTML=`
    <div style="flex:1">
      <div class="project-name">#${numLabel} — ${uiName} ${p.anon ? '<small style="color:var(--muted);"> (anon)</small>' : ''}</div>
      <div class="project-meta owner-info" data-owner-uid="${p.posterUid || p.uid || ''}">${time}</div>
      <div class="project-meta" style="max-width:720px;word-wrap:break-word;white-space:pre-wrap;margin-top:6px;">${(p.content||'').slice(0,200)}</div>
    </div>
    <div class="row">
      <button class="btn danger tiny del-post" data-id="${p.id}">Delete</button>
    </div>`;
  // resolve poster identity for admin: if anon true, fetch username and show next to (anon)
  const ownerUid = p.posterUid || p.uid || '';
  if (ownerUid) {
    (async ()=>{
      try {
        const snap = await get(ref(db, `users/${ownerUid}`));
        if (snap.exists()) {
          const u = snap.val();
          const ownerLine = div.querySelector('.owner-info');
          const ownerName = u.username || (u.email ? u.email.split('@')[0] : ownerUid);
          if (ownerLine) ownerLine.innerHTML = `${time} ${p.anon ? `<span style="color:#ffb86b;font-weight:700;margin-left:8px;">(real: ${ownerName} — ${ownerUid})</span>` : ''}`;
        }
      } catch(_) {}
    })();
  }
  const delBtn = div.querySelector('.del-post');
  if (delBtn) {
    delBtn.addEventListener('click', async ()=>{
      const postId = delBtn.dataset.id;
      if (!confirm('Delete this post?')) return;
      try{
        // fetch post to know owner and timestamp
        const pSnap = await get(ref(db, `socialFeed/${postId}`));
        if (pSnap.exists()){
          const p = pSnap.val();
          const ownerUid = p.uid;
          // compute dateKey from timestamp if present
          let dateKey = new Date().toISOString().slice(0,10);
          if (p.timestamp && typeof p.timestamp === 'number') dateKey = new Date(p.timestamp).toISOString().slice(0,10);
          // decrement per-day counter
          try { await runTransaction(ref(db, `postCountByDay/${ownerUid}/${dateKey}`), (cur) => Math.max(0, (Number(cur||0) - 1))); } catch(e){ console.warn('Failed to decrement daily count', e); }
          // decrement qbit balance by 1
          try { await runTransaction(ref(db, `users/${ownerUid}/qbitBalance`), (cur) => { const val = Number(cur||0); return Math.max(0, parseFloat((val - 1).toFixed(8))); }); } catch(e){ console.warn('Failed to decrement qbitBalance', e); }
          // notify UI listeners with refreshed balance
          try{ const balSnap = await get(ref(db, `users/${ownerUid}/qbitBalance`)); const newBal = balSnap.exists() ? balSnap.val() : null; window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid: ownerUid, balance: newBal } })); }catch(_){}
        }
        await remove(ref(db, `socialFeed/${postId}`));
        loadAdminWallFeed(); // refresh list
      }catch(e){
        console.error('Failed to delete post:', e);
        alert('Failed to delete post: ' + (e?.message || ''));
      }
    });
  }
  return div;
}

function renderAdminWallPage(){
  const list=document.getElementById('adminWallFeedList'); if(!list) return;
  list.innerHTML='';
  
  // Sort by permanent postNumber descending (newest first). Fallback to timestamp if postNumber missing.
  const posts = adminPostsCache.slice().sort((a,b)=>{
    const aNum = (typeof a.postNumber === 'number') ? a.postNumber : (a.timestamp || 0);
    const bNum = (typeof b.postNumber === 'number') ? b.postNumber : (b.timestamp || 0);
    return bNum - aNum;
  });
  
  if (posts.length === 0) {
    list.innerHTML = '<div class="empty">No posts found.</div>';
    return;
  }
  
  const total=Math.max(1,Math.ceil(posts.length/PAGE_SIZE));
  adminFeedPage=Math.min(Math.max(1,adminFeedPage),total);
  const start=(adminFeedPage-1)*PAGE_SIZE, end=start+PAGE_SIZE;
  
  // Show posts with their index in the full sorted list (unique global numbering)
  posts.slice(start,end).forEach((p,i)=>{
    list.appendChild(createAdminPostRow(p, null));
  });
  
  const pager=`<div class="row" style="justify-content:space-between;margin-top:12px;"><button id="adminPrev" class="btn outline tiny"${adminFeedPage<=1?' disabled':''}>Prev</button><div class="project-meta">Page ${adminFeedPage} / ${total} (${posts.length} total posts)</div><button id="adminNext" class="btn outline tiny"${adminFeedPage>=total?' disabled':''}>Next</button></div>`;
  list.insertAdjacentHTML('beforeend', pager);
  document.getElementById('adminPrev')?.addEventListener('click',()=>{ if(adminFeedPage>1){ adminFeedPage--; renderAdminWallPage(); } });
  document.getElementById('adminNext')?.addEventListener('click',()=>{ if(adminFeedPage<total){ adminFeedPage++; renderAdminWallPage(); } });
}

async function loadAllUsersFromFirestore(listEl){
  const { getFirestore, collection, getDocs } = await import('firebase/firestore');
  const fs = getFirestore();
  const snap = await getDocs(collection(fs, 'users'));
  const rows = [];
  snap.forEach(doc => {
    const u = doc.data() || {};
    rows.push({
      uid: u.uid || doc.id,
      label: `user`,
      username: u.username || (u.email ? String(u.email).split('@')[0] : '(unknown)'),
      email: u.email || '(no email)',
      status: computeStatus(u),
      purchased: !!u.purchased
    });
  });
  if (!rows.length) { listEl.innerHTML = '<div class="empty">No users found.</div>'; return; }
  listEl.innerHTML = '';
  rows.forEach((r, idx) => {
    const div = document.createElement('div');
    div.className = 'admin-row';
    div.innerHTML = `<div><div class="project-name">user${idx+1} — ${r.username}</div><div class="project-meta">${r.email}</div></div><div class="project-meta">Member: <strong>${r.status}</strong></div><div class="row"><button class="btn outline tiny" disabled title="RTDB only">Set ${r.purchased ? 'Free':'Premium'}</button><button class="btn danger tiny" disabled title="RTDB only">Delete User Files</button></div>`;
    listEl.appendChild(div);
  });
}

// --- QBC Moderation Functions ---

async function loadQBCModeration() {
    const container = document.getElementById('adminQBCModeration');
    if (!container) return;
    
    // Replace placeholder text
    container.innerHTML = '<div class="empty">Loading pending moderation requests...</div>';

    try {
        const rewardsSnap = await get(ref(db, 'userRewards'));
        if (!rewardsSnap.exists()) {
            container.innerHTML = '<div class="empty">No user rewards data found.</div>';
            return;
        }

        const allRewards = rewardsSnap.val() || {};
        const pendingRequests = [];

        // Iterate through all users' rewards data
        for (const [uid, rewards] of Object.entries(allRewards)) {
            // Check if user has a redemption status node
            if (rewards && rewards[REDEEM_RTDB_PATH]) {
                const status = rewards[REDEEM_RTDB_PATH];
                if (status.status === 'pending') {
                    // Ensure defaults are set if missing
                    if (status.amount === undefined) status.amount = REDEEM_COST;
                    if (status.token === undefined) status.token = 'Rhodium20 Token';
                    
                    pendingRequests.push({ uid, ...status });
                }
            }
        }
        
        if (pendingRequests.length === 0) {
            container.innerHTML = '<div class="empty">No pending Rhodium Token redemptions.</div>';
            return;
        }

        container.innerHTML = '';
        pendingRequests.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        pendingRequests.forEach(req => {
            const time = req.timestamp ? new Date(req.timestamp).toLocaleString() : 'N/A';
            const div = document.createElement('div');
            // Using project-card style for visual grouping
            div.className = 'project-card'; 
            div.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 8px; background: #1a1a1a; border-color: #333;';
            
            div.innerHTML = `
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                    <div class="project-name" style="font-size:14px;">Redemption Request (UID: ${req.uid})</div>
                    <div class="project-meta">Status: <strong style="color:#ff9800;">Pending</strong></div>
                </div>
                <div class="project-meta" style="font-size:12px; width:100%;">
                    <div>User Email: ${req.userEmail || 'N/A'}</div>
                    <div>QBC Email: ${req.qbcEmail || 'N/A'}</div>
                    <div>Requested: 1 ${req.token} (Cost: ${req.amount} QBC)</div>
                    <div>Timestamp: ${time}</div>
                </div>
                <div class="row" style="margin-top: 8px; justify-content: flex-start;">
                    <button class="btn success tiny approve-qbc" data-uid="${req.uid}" data-amount="${req.amount}">Approve</button>
                    <button class="btn danger tiny deny-qbc" data-uid="${req.uid}" data-amount="${req.amount}">Deny (Refund)</button>
                </div>
            `;
            container.appendChild(div);
        });
        
        container.querySelectorAll('.approve-qbc').forEach(btn => {
            btn.addEventListener('click', () => approveRedemption(btn.dataset.uid));
        });

        container.querySelectorAll('.deny-qbc').forEach(btn => {
            btn.addEventListener('click', () => denyRedemption(btn.dataset.uid, Number(btn.dataset.amount)));
        });

    } catch (e) {
        console.error('Failed to load QBC Moderation:', e);
        container.innerHTML = `<div class="empty" style="color:#ff6b6b;">Error loading requests: ${e.message || e}</div>`;
    }
}

async function approveRedemption(uid) {
    const redeemStatusRef = ref(db, `userRewards/${uid}/${REDEEM_RTDB_PATH}`);
    
    const currentStatusSnap = await get(redeemStatusRef);
    if (currentStatusSnap.val()?.status !== 'pending') {
        alert('This request is no longer pending.');
        loadQBCModeration();
        return;
    }
    
    if (!confirm(`Approve redemption for UID ${uid}? This confirms external payment has been made.`)) return;

    try {
        await update(redeemStatusRef, { status: 'approved', moderatedAt: serverTimestamp() });

        // Increment user's tokensRedeemed counter atomically
        const userTokensRef = ref(db, `users/${uid}/tokensRedeemed`);
        try {
            await runTransaction(userTokensRef, (cur) => {
                const n = Number(cur || 0);
                return n + 1;
            });
            // notify UI listeners about tokensRedeemed change
            const snap2 = await get(userTokensRef);
            const newTokens = snap2.exists() ? snap2.val() : null;
            window.dispatchEvent(new CustomEvent('tokensRedeemedChanged', { detail: { uid, tokens: newTokens } }));
        } catch (e) {
            console.warn('Failed to increment tokensRedeemed:', e);
        }

        alert(`Redemption for ${uid} approved successfully.`);
        // remove the pending redemption node so UI updates and "Pending" clears
        await remove(redeemStatusRef).catch(()=>{});
        loadQBCModeration(); // Refresh list
    } catch (e) {
        alert('Approval failed: ' + (e.message || e));
    }
}

async function denyRedemption(uid, amount) {
    const redeemStatusRef = ref(db, `userRewards/${uid}/${REDEEM_RTDB_PATH}`);
    const balanceRef = ref(db, `users/${uid}/qbitBalance`);

    const currentStatusSnap = await get(redeemStatusRef);
    if (currentStatusSnap.val()?.status !== 'pending') {
        alert('This request is no longer pending.');
        loadQBCModeration();
        return;
    }
    
    if (!confirm(`Deny redemption for UID ${uid}? This will refund ${amount} QBC to the user's balance.`)) return;
    
    try {
        let success = false;
        
        // 1. Refund QBC via transaction
        await runTransaction(balanceRef, (currentBalance) => {
            const current = Number(currentBalance || 0);
            success = true; // Assume success if transaction runs
            return parseFloat((current + amount).toFixed(8));
        });

        if (!success) throw new Error("Failed to process refund transaction.");
        
        // 2. Update status
        await update(redeemStatusRef, { status: 'denied', moderatedAt: serverTimestamp(), refundAmount: amount });
        
        alert(`Redemption for ${uid} denied. ${amount} QBC refunded.`);
        
        // 3. Notify UI listeners about balance change
        try{
            const balSnap = await get(balanceRef);
            const newBal = balSnap.exists() ? balSnap.val() : null;
            window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));
        }catch(_){}
        
        // remove the pending redemption node so UI updates and "Pending" clears
        await remove(redeemStatusRef).catch(()=>{});
        loadQBCModeration(); // Refresh list
    } catch (e) {
        alert('Denial/Refund failed: ' + (e.message || e));
        console.error('Denial/Refund error:', e);
    }
}