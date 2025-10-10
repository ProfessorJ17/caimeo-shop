import { getCurrentUserId } from './auth.js';
import { getCurrentProject, setCurrentProject, getEditorContent } from './editor.js';
import { showError, notify } from './ui.js';
import { rebuildSidebarForProject } from './sidebar.js';
import { db } from './auth.js';
import { ref, get, update, serverTimestamp, runTransaction, set, onValue } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';
import { awardDailyReward } from './rewards.js';

/* @tweakable ask for confirmation before deleting a project */
const confirmDeleteProject = true;
/* @tweakable confirmation message for delete */
const deleteConfirmText = "Delete this project? This cannot be undone.";
/* @tweakable max length for project title/name */
const titleMaxLength = 86;
/* @tweakable max length for the sidebar description */
const descriptionMaxLength = 86;
const allowedTlds = ['clos','dafy','taur','cele'];
const SLUG_MAP_PATH = 'projectSlugs';

// Add reward constant for publishing projects (1 QBC per initial publish)
const REWARD_QBC_PROJECT_PUBLISH = 10; // 10 QBC per initial publish

// Add size limit constants
const MAX_CONTENT_SIZE = 200000; // 200KB total content limit
const MAX_VERSION_HISTORY = 5; // Reduce from 10 to 5 versions
const MAX_SINGLE_FILE_SIZE = 50000; // 50KB per file

// Redemption Constants
const REDEEM_COST = 29470;
const RHODIUM_TOKEN_NAME = 'Rhodium20 Token';
const REDEEM_RTDB_PATH = 'rhodiumRedemptionStatus';
const REDEEM_TARGET_EMAIL = 'moddarkrevolt@gmail.com';

function truncateContent(content, maxSize) {
  if (!content || content.length <= maxSize) return content;
  return content.substring(0, maxSize - 3) + '...';
}

function calculateDataSize(obj) {
  return JSON.stringify(obj).length;
}

const room = new WebsimSocket();
let unsubscribeList = null;

export function initProjects(onProjectsChanged) {
  const newProjectBtn = document.getElementById('newProjectBtn');
  const saveProjectBtn = document.getElementById('saveProjectBtn');

  if (newProjectBtn) {
    // hide plus until confirmed public upload
    newProjectBtn.style.display = (localStorage.getItem('pq.cloudSaved') === '1') ? '' : 'none';
    newProjectBtn.addEventListener('click', () => {
      if (localStorage.getItem('pq.cloudSaved') !== '1') { alert('Upload public quantum keys first.'); return; }
      const event = new CustomEvent('openEditor', { detail: { project: null } });
      document.dispatchEvent(event);
    });
  }

  if (saveProjectBtn) {
    saveProjectBtn.addEventListener('click', saveCurrentProject);
  }

  return {
    subscribeToUserProjects: (userId) => {
      if (unsubscribeList) unsubscribeList();
      // keep previous published state to detect changes and broadcast to the page
      let prevPublished = new Map();
      const wrapper = (projects) => {
        try {
          if (Array.isArray(projects)) {
            projects.forEach(p => {
              const id = p.id;
              const prev = prevPublished.get(id);
              if (typeof prev === 'undefined') {
                prevPublished.set(id, !!p.published);
              } else {
                const now = !!p.published;
                if (prev !== now) {
                  // publish-state changed -> notify UI so all tabs can refresh
                  document.dispatchEvent(new CustomEvent('projectPublished', { detail: { id: id, published: now, project: p } }));
                  prevPublished.set(id, now);
                }
              }
            });
            // cleanup any removed projects from prevPublished
            const ids = new Set(projects.map(x => x.id));
            for (const k of Array.from(prevPublished.keys())) if (!ids.has(k)) prevPublished.delete(k);
          }
        } catch (e) { /* ignore detection errors */ }
        onProjectsChanged(projects);
      };
      unsubscribeList = room.collection('project_v1').filter({ owner_id: userId }).subscribe(wrapper);
    },
    unsubscribe: () => {
      if (unsubscribeList) { unsubscribeList(); unsubscribeList = null; }
    }
  };
}

export async function saveCurrentProject() {
  const userId = getCurrentUserId();
  if (!userId) return showError('You must be signed in.');
  
  const currentProject = getCurrentProject();
  const projectNameInput = document.getElementById('projectNameInput');
  const editorContent = getEditorContent();
  const now = new Date().toISOString();
  
  // Validate slug if project has one set
  if (currentProject?.page_slug) {
    try {
      await validateSlugUnique(currentProject.page_slug, currentProject.id);
    } catch(e) {
      return showError(e.message || 'This domain is already taken.');
    }
  }
  
  // Truncate large content
  const truncatedContent = {
    html: truncateContent(editorContent.html, MAX_SINGLE_FILE_SIZE),
    css: truncateContent(editorContent.css, MAX_SINGLE_FILE_SIZE),
    js: truncateContent(editorContent.js, MAX_SINGLE_FILE_SIZE),
    html_filename: editorContent.html_filename,
    css_filename: editorContent.css_filename,
    js_filename: editorContent.js_filename
  };

  const prevVersions = Array.isArray(currentProject?.versions) ? currentProject.versions.slice() : [];
  const lastNum = prevVersions.length ? (prevVersions[prevVersions.length - 1].version_number || prevVersions.length) : 0;
  const nextVersionNumber = lastNum + 1;
  
  const newVersion = {
    id: `${Date.now()}`,
    version_number: nextVersionNumber,
    name: projectNameInput.value.trim() || 'Untitled',
    ...truncatedContent,
    created_at: now,
    files: {} // Remove files from versions to save space
  };
  
  // Limit version history and remove oldest if needed
  const versions = [...prevVersions, newVersion].slice(-MAX_VERSION_HISTORY);

  // Truncate files object
  const files = { ...(currentProject?.files || {}) };
  const truncatedFiles = {};
  Object.keys(files).forEach(key => {
    truncatedFiles[key] = truncateContent(files[key], MAX_SINGLE_FILE_SIZE);
  });

  const files_list = Array.from(new Set([
    truncatedContent.html_filename, truncatedContent.css_filename, truncatedContent.js_filename, "README.md",
    ...Object.keys(truncatedFiles)
  ])).filter(Boolean).slice(0, 20); // Limit file list size

  const payload = {
    owner_id: userId,
    name: (projectNameInput.value.trim() || 'Untitled').substring(0, 86),
    ...truncatedContent,
    files: truncatedFiles,
    files_list,
    file_name: ((document.getElementById('fileNameInput')?.value || 'z.qnet').trim()).substring(0, 64),
    description: (document.getElementById('fileDescInput')?.value || '').substring(0, descriptionMaxLength),
    updated_at: now,
    versions
  };

  // Check total payload size
  const payloadSize = calculateDataSize(payload);
  if (payloadSize > MAX_CONTENT_SIZE) {
    // Further reduce content if still too large
    payload.files = {}; // Remove all additional files
    payload.versions = versions.slice(-2); // Keep only 2 most recent versions
    payload.description = payload.description.substring(0, 100);
    
    const newSize = calculateDataSize(payload);
    if (newSize > MAX_CONTENT_SIZE) {
      return showError('Project too large to save. Please reduce content size.');
    }
  }

  try{
    if (currentProject?.id) {
      await room.collection('project_v1').update(currentProject.id, payload);
      setCurrentProject({ ...currentProject, ...payload });
    } else {
      const rec = await room.collection('project_v1').create(payload);
      setCurrentProject(rec);
    }
    rebuildSidebarForProject();
    document.dispatchEvent(new CustomEvent('restoreVersion', { detail: { index: (payload.versions.length - 1) } }));
  }catch(err){
    showError(err.message || 'Save failed - content may be too large');
  }
}

export async function deleteProject(projectId) {
  if (!confirmDeleteProject || confirm(deleteConfirmText)) {
    try { 
      await room.collection('project_v1').delete(projectId); 
    } catch(e){ 
      showError(e.message || 'Delete failed'); 
    }
  }
}

export async function publishProject() {
  const userId = getCurrentUserId();
  if (!userId) return showError('You must be signed in to publish.');
  
  const currentProject = getCurrentProject();
  if (!currentProject) return showError('Open a project to publish.');
  
  const base = (currentProject.page_slug || '').toLowerCase().trim();
  let slug = base && allowedTlds.some(t=>base.endsWith('.'+t)) ? base : `${(currentProject.name||'untitled').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9-]/g,'')}.${allowedTlds[0]}`;
  
  const existing = room.collection('project_v1').filter({ page_slug: slug }).getList() || [];
  if (existing.length && !(existing.length === 1 && existing[0].id === currentProject.id)) {
    return showError(`The slug "${slug}" is already taken. Choose a different title.`);
  }

    const alreadyPublished = !!currentProject.published;

    // Enforce per-day limit for published pages (20 per day) stored under userRewards/{uid}/publishedPages/{date}
    const today = new Date();
    const dateKey = today.toISOString().slice(0,10);
    const publishedPagesRef = ref(db, `userRewards/${userId}/publishedPages/${dateKey}`);
    try {
      const snaps = await get(publishedPagesRef);
      const pagesCount = Number(snaps.exists() ? snaps.val() : 0);
      const MAX_PAGES_PER_DAY = 20;
      if (pagesCount >= MAX_PAGES_PER_DAY) {
        return showError(`Publish limit reached: ${MAX_PAGES_PER_DAY} pages per day.`);
      }
    } catch(e) {
      console.warn('Failed to check published pages limit', e);
    }
  
    const updatedProject = {
      ...currentProject,
      published: true,
      page_slug: slug,
      updated_at: new Date().toISOString()
    };

    try {
      if (currentProject.id) {
        await reserveSlug(slug, currentProject.id);
        await room.collection('project_v1').update(currentProject.id, updatedProject);
        setCurrentProject(updatedProject);
      } else {
        const rec = await room.collection('project_v1').create(Object.assign({}, updatedProject, { owner_id: userId }));
        try { await reserveSlug(slug, rec.id); } catch(e){ await room.collection('project_v1').update(rec.id, { published: false }); throw e; }
        setCurrentProject(rec);
      }

      // Reward for publishing if it's the first time for this project/publish action
      if (!alreadyPublished) {
          console.log(`Rewarding ${REWARD_QBC_PROJECT_PUBLISH} QBC for initial project publication.`);
          const balanceRef = ref(db, `users/${userId}/qbitBalance`);
          await runTransaction(balanceRef, cur => parseFloat(((Number(cur||0) + REWARD_QBC_PROJECT_PUBLISH)).toFixed(8)));
          
          // Notify UI listeners
          const balSnap = await get(balanceRef);
          const newBal = balSnap.exists() ? balSnap.val() : null;
          window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid: userId, balance: newBal } }));
        
        // increment userRewards publishedPages counter for today
        try {
          await runTransaction(ref(db, `userRewards/${userId}/publishedPages/${dateKey}`), (cur) => {
            const v = Number(cur || 0);
            const MAX_PAGES_PER_DAY = 20;
            if (v >= MAX_PAGES_PER_DAY) return v; // safety
            return v + 1;
          });
          await update(ref(db, `userRewards/${userId}`), { publishedPagesLastAt: serverTimestamp() });
        } catch (e) {
          console.warn('Failed to update userRewards.publishedPages', e);
        }
      }

      alert(`Published as: QTTPS://${slug}`);
      document.dispatchEvent(new CustomEvent('projectPublished'));
    } catch (e) {
      showError(e.message || 'Publish failed');
    }
}

export async function deleteVersion(index){
  const current = getCurrentProject();
  if (!current || !Array.isArray(current.versions)) return;
  const versions = current.versions.slice();
  if (!versions[index]) return;
  versions.splice(index, 1);
  const updated = { ...current, versions, updated_at: new Date().toISOString() };
  try{
    if (current.id) await room.collection('project_v1').update(current.id, updated);
    setCurrentProject(updated);
    rebuildSidebarForProject();
  }catch(e){
    showError(e.message || 'Delete version failed');
  }
}

export async function setLiveVersion(index){
  const current = getCurrentProject();
  if (!current || !Array.isArray(current.versions) || !current.versions[index]) return;
  const v = current.versions[index];
  const updated = { 
    ...current, 
    current_version_index: index, 
    current_version_number: v.version_number 
  };
  try{
    if (current.id) await room.collection('project_v1').update(current.id, { current_version_index: index, current_version_number: v.version_number, updated_at: new Date().toISOString() });
    setCurrentProject(updated);
  }catch(e){
    showError(e.message || 'Failed to set live version');
  }
}

export async function updateProjectMeta({ name, description, slug }) {
  const current = getCurrentProject();
  if (!current) return;
  const norm = (slug || '').toLowerCase().trim();
  const m = norm.match(/^([a-z0-9-]+)\.([a-z]+)$/);
  if (!m) return showError('Enter a title and choose a domain.');
  const [, title, tld] = m;
  if (!allowedTlds.includes(tld)) return showError('Choose a valid domain (.clos, .dafy, .taur, .cele).');
  const normSlug = `${title}.${tld}`;
  
  // Validate slug is unique using RTDB
  try {
    await validateSlugUnique(normSlug, current.id);
  } catch(e) {
    return showError(e.message || `The domain "${normSlug}" is already taken. Choose a different title.`);
  }
  
  const versions = Array.isArray(current.versions) ? current.versions.slice() : [];
  const curIdx = Number.isInteger(current.current_version_index) ? current.current_version_index : (versions.length - 1);
  if (versions[curIdx]) versions[curIdx] = { ...versions[curIdx], name: (name || current.name || 'Untitled') };
  const oldSlug = current.page_slug || '';
  if (oldSlug !== normSlug && current.id) { await reserveSlug(normSlug, current.id); if (oldSlug) await releaseSlug(oldSlug, current.id); }
  const updated = { ...current, name: name || current.name, description: description || '', page_slug: normSlug, versions, updated_at: new Date().toISOString() };
  try {
    if (current.id) await room.collection('project_v1').update(current.id, { name: updated.name, description: updated.description, page_slug: updated.page_slug, versions: updated.versions, updated_at: updated.updated_at });
    setCurrentProject(updated);
    rebuildSidebarForProject();
    document.dispatchEvent(new CustomEvent('projectMetaUpdated', { detail: { slug: updated.page_slug, name: updated.name } }));
  } catch(e){ showError(e.message || 'Failed to update project meta'); }
}

export function renderProjectsList(projects) {
  const projectsList = document.getElementById('projectsList');
  const rewardsContainer = document.getElementById('rewardsSection');
  if (!projectsList) return;
  projectsList.innerHTML = '';
  // render rewards UI into separate rewards container when logged in
  const uid = getCurrentUserId();
  if (rewardsContainer) {
    rewardsContainer.innerHTML = '';
    if (uid) {
      const rew = document.createElement('div');
      rew.className = 'project-card';
      rew.innerHTML = `
        <div style="flex:1">
          <div class="project-name">Rewards <span id="rewardsResetTimer" class="project-meta" style="margin-left:8px;"></span></div>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div class="project-meta" id="rewardsBalance">Loading balance...</div>
            <div id="redeemTokenArea" style="display:flex; align-items:center; gap:8px;">
                <button id="redeemTokenBtn" class="btn tiny" disabled>Redeem Token</button>
                <span id="redeemStatus" class="project-meta" style="font-weight:700; min-width:50px; text-align:right;"></span>
            </div>
          </div>

          <div id="dailyClaimGrid" style="margin-top:12px;display:grid;grid-template-columns:repeat(7,1fr);gap:6px"></div>
          
          <details id="rewardInfoDetails" style="margin-top:8px;">
            <summary style="font-weight:700;cursor:pointer;"><span class="gradient-summary-text">Reward Information</span></summary>
            <div style="margin-top:8px;font-size:13px;line-height:1.6;padding-left:12px;border-left:2px solid #333;">
              <p style="margin:0 0 8px;"><strong>Daily Login Claim:</strong> Up to 100 QBC per day, maximum 700 QBC per 7-day period.</p>
              <p style="margin:0 0 8px;"><strong>Social Posting Reward:</strong> 10 QBC per post, capped at 20 posts rewarded per day.</p>
              <p style="margin:0;"><strong>Quantum Publishing Reward:</strong> 10 QBC per project's initial publish, capped at 20 pages rewarded per day.</p>
              <p style="margin:8px 0 0; color:#ff6b6b; font-weight:700;">Redemption Cost: ${REDEEM_COST} QBC for 1 ${RHODIUM_TOKEN_NAME} payment.</p>
            </div>
          </details>

        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <button id="claimDailyBtn" class="btn">Claim Today</button>
        </div>`;
      rewardsContainer.appendChild(rew);
      startRewardsTimer?.();
      document.getElementById('claimDailyBtn')?.addEventListener('click', async () => {
        const uid = getCurrentUserId();
        if (!uid) return showError('Sign in to claim rewards.');
        try { await awardDailyReward(db, uid, { ref, get, update, serverTimestamp, runTransaction }); await populateRewards(uid); await loadClaimGrid(uid); }
        catch (e) { showError(e?.message || 'Failed to claim.'); }
      });
      document.getElementById('redeemTokenBtn')?.addEventListener('click', () => redeemToken(uid)); 
      (async ()=>{ if(uid) await populateRewards(uid); })();
      (async ()=>{ if(uid) await loadClaimGrid(uid); })();
    }
  }

  if (!projects || projects.length === 0) {
    // If authenticated, we already rendered the rewards. Show empty message below.
    if(uid) {
        projectsList.insertAdjacentHTML('beforeend', '<div class="empty">No projects yet.</div>');
    } else {
        // If not authenticated, ensure list is clean (although authentication should precede this call)
        projectsList.innerHTML = '<div class="empty">No projects yet.</div>';
    }
    return;
  }

  projects.forEach(p => {
    const displaySlug = p.page_slug ? `QTTPS://${p.page_slug}` : '';
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-main">
        <div class="project-name">${p.name || 'Untitled'}</div>
        <div class="project-desc" style="color:var(--muted); font-size:12px;">${(p.description||'').slice(0, descriptionMaxLength)}</div>
        <div class="project-meta">${new Date(p.updated_at || p.created_at).toLocaleString()} ${displaySlug ? ` — <span style="font-weight:700">${displaySlug}</span>` : ''}</div>
      </div>
      <div class="row">
        <button class="btn outline icon open" aria-label="Open project">↗</button>
        <button class="btn outline icon publish" aria-label="Publish project" title="Publish to Quantum Internet">${p.published ? '☑' : '☐'}</button>
        <button class="btn danger icon delete" aria-label="Delete project">✖</button>
      </div>
    `;
    card.querySelector('.open').addEventListener('click', () => {
      const event = new CustomEvent('openEditor', { detail: { project: p } });
      document.dispatchEvent(event);
    });
    // publish toggle (update published state)
    card.querySelector('.publish')?.addEventListener('click', async (evt) => {
      evt.preventDefault();
      if (!localStorage.getItem('pq.hasKeys')) { showError('Generate a quantum key pair first.'); return; }
      const newState = !p.published;
      
      const userId = getCurrentUserId(); // Get userId outside of transactions
      const shouldReward = newState && !p.published && userId; // Only reward if moving from unpublished to published

      try{
        const fallback = `${(p.name||'untitled').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9-]/g,'')}.${allowedTlds[0]}`;
        const desiredSlug = (p.page_slug && allowedTlds.some(t=>p.page_slug.endsWith('.'+t)) ? p.page_slug : fallback).toLowerCase();
        if (newState) { await reserveSlug(desiredSlug, p.id); }
        const updated = { published: newState, page_slug: desiredSlug, updated_at: new Date().toISOString() };
        await room.collection('project_v1').update(p.id, updated);
        if (!newState) { try{ await releaseSlug(desiredSlug, p.id); }catch(_){} }
        p.published = newState;
        card.querySelector('.publish').textContent = newState ? '☑' : '☐';
        document.dispatchEvent(new CustomEvent('projectPublished'));
        
        // APPLY REWARD LOGIC FOR TOGGLE
        if (shouldReward) {
            console.log(`Rewarding ${REWARD_QBC_PROJECT_PUBLISH} QBC for publishing project ${p.id} via toggle.`);
            const balanceRef = ref(db, `users/${userId}/qbitBalance`);
            await runTransaction(balanceRef, cur => parseFloat(((Number(cur||0) + REWARD_QBC_PROJECT_PUBLISH)).toFixed(8)));
            
            const balSnap = await get(balanceRef);
            const newBal = balSnap.exists() ? balSnap.val() : null;
            window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid: userId, balance: newBal } }));
        }
        
      }catch(err){
        showError(err.message || 'Publish toggle failed');
      }
    });
    card.querySelector('.delete').addEventListener('click', () => deleteProject(p.id));
    projectsList.appendChild(card);
  });
}

async function validateSlugUnique(slug, projectId) {
  const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js');
  const { db } = await import('./auth.js');
  const key = slug.replace(/[.#$\[\]]/g, '_');
  const r = ref(db, `${SLUG_MAP_PATH}/${key}`);
  const snap = await get(r);
  const owner = snap.exists() ? snap.val() : null;
  if (owner && owner !== projectId) {
    throw new Error("Sorry this address is not available unless it's the original site.");
  }
}

async function reserveSlug(slug, projectId){
  const { ref, runTransaction } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js');
  const { db } = await import('./auth.js');
  const key = slug.replace(/[.#$\[\]]/g, '_');
  const r = ref(db, `${SLUG_MAP_PATH}/${key}`);
  const res = await runTransaction(r, cur => {
    const v = cur || null;
    if (v && v !== projectId) return;
    return projectId;
  });
  if (!res.committed || (res.snapshot && res.snapshot.val() !== projectId)) throw new Error(`The slug "${slug}" is already taken.`);
}

async function releaseSlug(slug, projectId){
  const { ref, runTransaction } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js');
  const { db } = await import('./auth.js');
  const key = slug.replace(/[.#$\[\]]/g, '_');
  const r = ref(db, `${SLUG_MAP_PATH}/${key}`);
  await runTransaction(r, cur => (cur === projectId ? null : cur));
}

async function populateRewards(uid){
  try{
    const balanceRef = ref(db, `users/${uid}/qbitBalance`);
    const snap = await get(balanceRef);
    const el = document.getElementById('rewardsBalance');
    if(el) el.innerHTML = `QBitCoin Balance: <strong>${Number(snap.exists() ? Number(snap.val()) : 0)}</strong>`;
    
    // Update redeem button state and status
    const redeemBtn = document.getElementById('redeemTokenBtn');
    const redeemStatusEl = document.getElementById('redeemStatus');
    const redeemStatusRef = ref(db, `userRewards/${uid}/${REDEEM_RTDB_PATH}`);

    // ensure per-uid notification guard exists to avoid duplicate transient messages
    window._redeemNotifyState = window._redeemNotifyState || {};

    // Use a realtime listener so UI updates automatically when admin approves/denies/removes request
    try {
      onValue(redeemStatusRef, (statusSnap) => {
        const statusData = statusSnap.exists() ? statusSnap.val() : null;
        if (!redeemStatusEl) return;
        if (statusData?.status === 'pending') {
          redeemStatusEl.textContent = 'Pending';
          redeemStatusEl.style.color = '#ff9800';
          if (redeemBtn) redeemBtn.disabled = true;
          window._redeemNotifyState[uid] = 'pending';
        } else if (statusData?.status === 'approved') {
          redeemStatusEl.textContent = '';
          if (redeemBtn) redeemBtn.disabled = true;
          // notify once for approval transition
          if (window._redeemNotifyState[uid] !== 'approved') notify('Your Rhodium Token request was approved — check your email.', 5000);
          window._redeemNotifyState[uid] = 'approved';
        } else if (statusData?.status === 'denied') {
          redeemStatusEl.textContent = '';
          if (redeemBtn) redeemBtn.disabled = false;
          // only notify once when transition to denied occurs
          if (window._redeemNotifyState[uid] !== 'denied') notify('Your Rhodium Token request was denied and refunded.', 5000);
          window._redeemNotifyState[uid] = 'denied';
        } else {
          // no pending request
          // check balance to determine button state
          const curBal = Number(document.getElementById('qbitBalance')?.textContent || (snap.exists() ? snap.val() : 0));
          if (curBal >= REDEEM_COST) {
            redeemStatusEl.textContent = '';
            if (redeemBtn) redeemBtn.disabled = false;
            window._redeemNotifyState[uid] = 'none';
          } else {
            redeemStatusEl.textContent = `Need ${REDEEM_COST} QBC`;
            redeemStatusEl.style.color = '#ff6b6b';
            if (redeemBtn) redeemBtn.disabled = true;
            window._redeemNotifyState[uid] = 'none';
          }
        }
      }, { onlyOnce: false });
    } catch (e) {
      // Fallback to one-time check if realtime listener fails
      const statusSnap = await get(redeemStatusRef);
      const statusData = statusSnap.exists() ? statusSnap.val() : null;
      if (statusData?.status === 'pending') {
        redeemStatusEl.textContent = 'Pending';
        redeemStatusEl.style.color = '#ff9800';
        if (redeemBtn) redeemBtn.disabled = true;
        window._redeemNotifyState[uid] = 'pending';
      } else if (Number(snap.exists() ? snap.val() : 0) >= REDEEM_COST) {
        redeemStatusEl.textContent = '';
        if (redeemBtn) redeemBtn.disabled = false;
        window._redeemNotifyState[uid] = 'none';
      } else {
        redeemStatusEl.textContent = `Need ${REDEEM_COST} QBC`;
        redeemStatusEl.style.color = '#ff6b6b';
        if (redeemBtn) redeemBtn.disabled = true;
        window._redeemNotifyState[uid] = 'none';
      }
    }
    
  }catch(e){
    const el = document.getElementById('rewardsBalance');
    if(el) el.textContent = 'Balance unavailable';
    console.error('Error in populateRewards:', e);
  }
}

async function loadClaimGrid(uid){
  try{
    const daysContainer = document.getElementById('dailyClaimGrid');
    if(!daysContainer) return;
    daysContainer.innerHTML = '';
    const today = new Date();
    const year = today.getFullYear(), month = today.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const baseKey = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const snap = await get(ref(db, `userRewards/${uid}/daily`));
    const claimed = snap.exists() ? snap.val() : {};
    for(let d=1; d<=daysInMonth; d++){
      const dt = new Date(year, month, d);
      const key = baseKey(dt);
      const btn = document.createElement('button');
      btn.className = 'btn outline tiny';
      btn.style.padding = '8px';
      btn.style.fontSize = '12px';
      btn.textContent = String(d);
      // future days disabled
      if (dt > new Date()) { btn.classList.add('disabled'); }
      // already claimed — gradient + yellow glow
      if (claimed && claimed[key]) { btn.classList.add('disabled'); btn.style.background = 'linear-gradient(90deg,#6a0dad,#c2195c,#ff3b3b)'; btn.style.color='#fff'; btn.style.boxShadow = '0 0 0 2px rgba(255,213,79,.5), 0 0 12px rgba(255,213,79,.4)'; btn.title = 'Claimed'; }
      // today's claimed — same as claimed style (keep gradient + yellow glow)
      if (key === baseKey(new Date()) && claimed && claimed[key]) { btn.style.background = 'linear-gradient(90deg,#6a0dad,#c2195c,#ff3b3b)'; btn.style.color = '#fff'; btn.style.boxShadow = '0 0 0 2px rgba(255,213,79,.5), 0 0 12px rgba(255,213,79,.4)'; }
      // today available & not claimed yet — gradient, no glow
      if (key === baseKey(new Date()) && !(claimed && claimed[key])) { btn.style.background = 'linear-gradient(90deg,#6a0dad,#c2195c,#ff3b3b)'; btn.style.color = '#fff'; btn.style.boxShadow = 'none'; }
      // mark past missed days as gray
      const startToday = new Date(year, month, today.getDate());
      if (dt < startToday && !(claimed && claimed[key])) { btn.classList.add('disabled'); btn.style.background = '#2a2a2a'; btn.style.color = '#8a8a8a'; btn.title = 'Missed'; }

      // show details modal when clicking a date: posts / published pages counts (0/20 style)
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
          const postsSnap = await get(ref(db, `postCountByDay/${uid}/${key}`));
          const postsCount = Number(postsSnap.exists() ? postsSnap.val() : 0);
          const pagesSnap = await get(ref(db, `userRewards/${uid}/publishedPages/${key}`));
          const pagesCount = Number(pagesSnap.exists() ? pagesSnap.val() : 0);
          const dt = new Date(key);
          const weekday = dt.toLocaleDateString(undefined, { weekday: 'long' });
          const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
          const wrap = document.createElement('div'); wrap.className = 'modal';
          wrap.innerHTML = `<h3>${weekday} — ${key}</h3>
            <div style="margin-top:8px;">
              <div style="margin-bottom:6px;"><strong>Posts:</strong> ${postsCount} / 20</div>
              <div style="margin-bottom:6px;"><strong>Published pages:</strong> ${pagesCount} / 20</div>
              <div style="margin-top:12px;color:var(--muted);font-size:13px;">Note: limits are enforced per day (max 20).</div>
            </div>
            <div class="actions" style="margin-top:12px;"><button id="dlg-close" class="btn outline">Close</button></div>`;
          overlay.appendChild(wrap); document.body.appendChild(overlay);
          wrap.querySelector('#dlg-close').addEventListener('click', ()=> overlay.remove());
          overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
        } catch (e) { console.warn('Failed to fetch day details', e); }
      });

      daysContainer.appendChild(btn);
    }
  }catch(e){ console.warn('Failed to load claim grid', e); }
}

function startRewardsTimer(){ const el=document.getElementById('rewardsResetTimer'); if(!el) return; const tick=()=>{ const now=new Date(); const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1,0,0,0)); const diff=next-now; const h=String(Math.max(0,Math.floor(diff/3600000))).padStart(2,'0'); const m=String(Math.max(0,Math.floor((diff%3600000)/60000))).padStart(2,'0'); const s=String(Math.max(0,Math.floor((diff%60000)/1000))).padStart(2,'0'); el.textContent=`resets in ${h}:${m}:${s} (UTC)`; if(diff<=0) setTimeout(()=>location.reload(),1000); }; tick(); clearInterval(window._rewTimer); window._rewTimer=setInterval(tick,1000); }


async function redeemToken(uid) {
    const { auth } = await import('./auth.js');
    if (!uid) return showError('You must be signed in.');

    const balanceRef = ref(db, `users/${uid}/qbitBalance`);
    const balanceSnap = await get(balanceRef);
    const currentBalance = balanceSnap.exists() ? Number(balanceSnap.val()) : 0;

    if (currentBalance < REDEEM_COST) {
        return showError(`Sorry you must get ${REDEEM_COST} coins for 1 ${RHODIUM_TOKEN_NAME} payment.`);
    }

    // Check if a request is already pending
    const redeemStatusRef = ref(db, `userRewards/${uid}/${REDEEM_RTDB_PATH}`);
    const statusSnap = await get(redeemStatusRef);
    if (statusSnap.exists() && statusSnap.val()?.status === 'pending') {
        return showError('Redemption already pending.');
    }

    // 1. Prompt for QBitcoin Email
    const qbEmail = prompt('Enter your QBitcoin Email address:');
    if (!qbEmail || qbEmail.trim() === '') return;

    const user = auth.currentUser;
    const userEmail = user.email || 'N/A';
    
    const redeemedAmount = REDEEM_COST;
    const redeemBtn = document.getElementById('redeemTokenBtn');
    if (redeemBtn) redeemBtn.disabled = true;

    // 2. Perform atomic transaction: subtract balance
    try {
        const redemptionData = {
            status: 'pending',
            timestamp: serverTimestamp(),
            qbcEmail: qbEmail,
            userEmail: userEmail,
            userId: uid,
            amount: redeemedAmount,
            token: RHODIUM_TOKEN_NAME
        };

        let success = false;
        await runTransaction(ref(db, `users/${uid}`), (userData) => {
            if (userData) {
                let currentBal = Number(userData.qbitBalance || 0);
                if (currentBal >= redeemedAmount) {
                    userData.qbitBalance = parseFloat((currentBal - redeemedAmount).toFixed(8));
                    success = true;
                    return userData;
                }
            }
        });

        if (success) {
            // Set pending status in dedicated path
            await set(redeemStatusRef, redemptionData);

            // 3. Simulate email notification to admin
            const emailSubject = `Rhodium Token Request from QNet User ${userEmail}`;
            const emailBody = `
User: ${userEmail}
UID: ${uid}
QBitcoin Email attached: ${qbEmail}
Requested: 1 ${RHODIUM_TOKEN_NAME}
Cost: ${redeemedAmount} QBC deducted.
`;
            
            console.log(`SIMULATED EMAIL NOTIFICATION (${emailSubject}) sent to ${REDEEM_TARGET_EMAIL}`);
            console.log(emailBody);
            alert(`Redemption request successful! Your QBC balance has been reduced by ${redeemedAmount} and the request is now pending review by ${REDEEM_TARGET_EMAIL}.`);
            
            // Update UI
            populateRewards(uid);
            
            // Notify UI listeners for balance change
            const balSnap = await get(balanceRef);
            const newBal = balSnap.exists() ? balSnap.val() : null;
            window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));

        } else {
            showError(`Redemption failed due to concurrent transaction or insufficient funds.`);
            // Restore button state if transaction failed locally/atomically
            populateRewards(uid); 
        }

    } catch (e) {
        showError('Redemption failed: ' + (e.message || e));
        console.error('Redemption error:', e);
        // Restore button state on error
        populateRewards(uid);
    }
}