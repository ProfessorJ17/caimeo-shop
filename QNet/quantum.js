import { getCurrentUserId, auth, getUserPlanStatus, saveQuantumKeysToDb } from './auth.js';
import { combineSrcDoc } from './editor.js';
import { showError, getSectionVisibilityPreference, setupVisibilityToggles } from './ui.js';
import { openKeysViewer, deleteKeysFromCloudAndLocal, openKeygenFlow, getKeyOrEmpty } from './keyManagement.js';
import { navState, make404, extractQuantumSlug, leetIPv6FromText, leetFromText } from './pageViewer.js';
import { ref, get, onValue } from 'firebase/database';
import { db } from './auth.js';
import { voteOn } from './social.js';

const room = new WebsimSocket();
let _lastVisibleSection = null;
let _browserControls = null;
let _unsubPublished = null;
let projectVoteListeners = {}; 

const PUBLIC_TLDS = ['clos','dafy','taur','cele'];
const PRIVATE_TLDS = ['life','end'];

// add shared gate helpers at module scope
const hasKeys = () => !!(localStorage.getItem('pq.kem.priv') && localStorage.getItem('pq.dsa.priv'));
const hasPublicKeys = () => !!(localStorage.getItem('pq.kem.pub') && localStorage.getItem('pq.dsa.pub'));
const hasConfirmedPublicKeys = () => localStorage.getItem('pq.cloudSaved') === '1';

export async function updateGate(){
  const s = document.getElementById('pqGateStatus');
  const uid = auth.currentUser?.uid || '';
  const cloud = (()=>{ try{ return localStorage.getItem('pq.cloudSaved') === '1'; }catch(_){ return false; } })();
  let dbHasKeys = false;
  try{
    if (uid) {
      const snap = await get(ref(db, `users/${uid}`));
      const v = snap.exists() ? snap.val() : {};
      dbHasKeys = !!(v.pqKemPub && v.pqDsaPub);
      try{ localStorage.setItem('pq.cloudSaved', dbHasKeys ? '1' : '0'); }catch(_){}
    }
  }catch(_){}
  const localOwnerOk = (localStorage.getItem('pq.owner') === uid);
  const localKemPub = getKeyOrEmpty('pq.kem.pub');
  const localDsaPub = getKeyOrEmpty('pq.dsa.pub');
  const localHas = !!(localKemPub && localDsaPub) && localOwnerOk;
  
  // DETERMINE KEY STATUS
  const keysExist = localHas || dbHasKeys;

  if (s) s.textContent = dbHasKeys ? 'Ready — Cloud saved' : (localHas ? 'Ready — Local only' : 'Missing');
  const showBtn = document.getElementById('pqShowBtn');
  if (showBtn) {
    showBtn.disabled = !keysExist;
    showBtn.style.display = keysExist ? '' : 'none';
  }
  const planEl = document.getElementById('pqUserPlan');
  (async () => {
    const plan = await getUserPlanStatus();
    if (planEl) planEl.textContent = plan;
  })();
  const userEl = document.getElementById('pqUserName');
  const preferredName = (window.qnetUsername && String(window.qnetUsername)) || '';
  if (userEl) userEl.textContent = preferredName || (auth.currentUser?.displayName || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : ''));
  
  // ADJUSTED VISIBILITY LOGIC for Gen and Delete: show when authenticated
  const genBtn = document.getElementById('pqGenBtn');
  if (genBtn) {
      // Always show Generate Keys button when authenticated
      genBtn.style.display = ''; 
  }

  const deleteBtn = document.getElementById('pqDeleteBtn');
  if (deleteBtn) {
      // Show Delete Keys button only if keys exist (local or cloud)
      deleteBtn.style.display = keysExist ? '' : 'none';
  }

  const uploadBtn = document.getElementById('pqUploadPubBtn');
  if (uploadBtn) uploadBtn.style.display = (!!(localKemPub || localDsaPub) && !dbHasKeys) ? '' : 'none';

  // gate tabs and plus button until confirmed public upload
  const tabQ = document.getElementById('tabQuantum'), tabS = document.getElementById('tabSocial'), plus = document.getElementById('newProjectBtn');
  const ok = dbHasKeys;
  tabQ && tabQ.classList.toggle('hidden', !ok);
  tabS && tabS.classList.toggle('hidden', !ok);
  plus && (plus.style.display = ok ? '' : 'none');
}

export function initQuantum() {
  const tabProjects = document.getElementById('tabProjects');
  const tabQuantum = document.getElementById('tabQuantum');
  const projectsList = document.getElementById('projectsList');
  const projectsListSection = document.getElementById('projectsListSection');
  const quantumView = document.getElementById('quantumView');
  const adminView = document.getElementById('adminView');
  const pqGate = document.getElementById('pqGate');
  const accountDetailsSection = document.getElementById('accountDetailsSection');

  document.getElementById('pqGenBtn')?.addEventListener('click', ()=> openKeygenFlow());
  document.getElementById('pqShowBtn')?.addEventListener('click', ()=> openKeysViewer());
  document.getElementById('pqUploadPubBtn')?.addEventListener('click', async ()=>{
    const kemPub = getKeyOrEmpty('pq.kem.pub');
    const dsaPub = getKeyOrEmpty('pq.dsa.pub');
    if(!kemPub && !dsaPub){ alert('Generate keys first.'); return; }
    try{ await saveQuantumKeysToDb({ kemPub, dsaPub }); localStorage.setItem('pq.cloudSaved','1'); updateGate(); alert('Public keys uploaded.'); }
    catch(e){ alert('Upload failed: ' + (e.message||e)); }
  });
  document.getElementById('pqDeleteBtn')?.addEventListener('click', ()=> deleteKeysFromCloudAndLocal()); // WIRING DELETE BUTTON
  updateGate(); 
  window.addEventListener('storage', (e)=>{ if(e.key==='pq.hasKeys') updateGate(); });
  document.addEventListener('authUserChanged', (e)=> {
    const name = e.detail?.user?.name || '';
    const el = document.getElementById('pqUserName');
    if (el) el.textContent = name || '';
    updateGate();
  });

  if (tabProjects && tabQuantum && quantumView) {
    tabProjects.addEventListener('click', ()=> {
      const socialView = document.getElementById('socialView');
      
      // We rely on setupVisibilityToggles to apply user preference for pqGate and projectsList display state
      
      if (projectsListSection) projectsListSection.style.display = '';
      projectsList.classList.remove('hidden');
      
      quantumView.classList.add('hidden');
      quantumView.style.display = 'none';
      if (adminView) adminView.classList.add('hidden');
      tabProjects.classList.add('outline');
      tabQuantum.classList.remove('outline');
      
      if (pqGate) { 
        pqGate.classList.remove('hidden'); 
      }
      if (accountDetailsSection) accountDetailsSection.style.display = ''; // RESTORE visibility of the section container
      
      // Apply visibility toggles to apply user preferences to pqGate and projectsList
      setupVisibilityToggles();
      
      const newProjectBtn = document.getElementById('newProjectBtn');
      if (newProjectBtn) newProjectBtn.classList.remove('hidden');
      if (socialView) socialView.classList.add('hidden');
      const hamb = document.getElementById('toggleUsersSidebarBtn');
      if (hamb) { hamb.classList.add('hidden'); hamb.style.display = 'none'; }
    });

    tabQuantum.addEventListener('click', ()=> {
      const socialView = document.getElementById('socialView');
      if (!hasConfirmedPublicKeys()) { alert('Upload public quantum keys first.'); window.open('QuantumKeyPair.txt','_blank'); return; }
      if (!hasPublicKeys()) { alert('Generate and save your public quantum keys first.'); window.open('QuantumKeyPair.txt','_blank'); return; }

      if (projectsListSection) projectsListSection.style.display = 'none';
      if (accountDetailsSection) accountDetailsSection.style.display = 'none';
      
      projectsList.classList.add('hidden');
      projectsList.style.display = 'none';
      quantumView.classList.remove('hidden');
      quantumView.style.display = '';
      tabQuantum.classList.add('outline');
      tabProjects.classList.remove('outline');
      if (pqGate) { pqGate.classList.add('hidden'); pqGate.style.display = 'none'; }
      if (socialView) socialView.classList.add('hidden');
      if (adminView) adminView.classList.add('hidden');
      const hamb = document.getElementById('toggleUsersSidebarBtn');
      if (hamb) { hamb.classList.add('hidden'); hamb.style.display = 'none'; }
      loadQuantumPages();
    });
  }

  // Listen for project published events
  document.addEventListener('projectPublished', () => {
    if (!quantumView.classList.contains('hidden')) {
      loadQuantumPages();
    }
  });
  document.addEventListener('projectMetaUpdated', (e) => {
    const slug = (e?.detail?.slug || '').trim(); 
    if (!slug || !_browserControls) return;
    const urlInput = _browserControls.querySelector('.page-viewer-url');
    if (urlInput) urlInput.value = slug.includes('.') ? `QTTPS://${slug}` : slug;
  });

  if (!_unsubPublished) {
    _unsubPublished = room.collection('project_v1').filter({ published: true }).subscribe(() => {
      const qv = document.getElementById('quantumView');
      if (qv && !qv.classList.contains('hidden')) loadQuantumPages();
    });
  }
}

export async function loadQuantumPages(){
  unsubscribeProjectVotes(); // Cleanup previous vote listeners

  const publicDetails = document.getElementById('quantumPublicDetails');
  const privateDetails = document.getElementById('quantumPrivateDetails');
  const publicContainer = document.getElementById('quantumPublicPagesContent');
  const privateContainer = document.getElementById('quantumPrivatePagesContent');
  
  if (!publicContainer || !privateContainer || !publicDetails || !privateDetails) return;
  
  const publicSummarySpan = publicDetails.querySelector('summary span.gradient-summary-text');
  const privateSummarySpan = privateDetails.querySelector('summary span.gradient-summary-text');

  // --- VIP Check ---
  const userPlan = await getUserPlanStatus();
  const isVip = userPlan === 'Premium';

  publicContainer.innerHTML = '';
  privateContainer.innerHTML = '';
  
  const published = room.collection('project_v1').filter({ published: true }).getList() || [];

  if (!published.length) {
    publicContainer.innerHTML = '<div class=\"empty\">No published public pages yet.</div>';
    privateContainer.innerHTML = isVip ? '<div class=\"empty\">No published private pages yet.</div>' : '<div class=\"empty\">Private section requires VIP membership.</div>';
    
    // Update main summaries with (0) count
    if (publicSummarySpan) publicSummarySpan.textContent = 'Quantum Internet — Public (0)';
    if (privateSummarySpan) privateSummarySpan.textContent = `Quantum Internet — Private (${isVip ? 0 : 'VIP'})`;
    
    return;
  }

  // --- Public TLD setup (.clos, .dafy, .taur, .cele) ---
  const publicTlds = PUBLIC_TLDS;
  const publicLists = {};
  publicTlds.forEach(t => {
    const d = document.createElement('details');
    d.open = true;
    d.style.marginBottom = '8px';
    const containerId = `public-${t}-list`;
    // Added count placeholder span
    d.innerHTML = `<summary style="font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer;"><span class="tld-arrow">▾</span><span class="gradient-summary-text">.${t} — Public (<span class="tld-count">0</span>)</span></summary><div id="${containerId}" class="projects-list" style="margin-top:8px;"></div>`;
    publicContainer.appendChild(d);
    publicLists[t] = d.querySelector(`#${containerId}`);
  });

  // --- Private TLD setup (.life, .end) ---
  const privateTlds = PRIVATE_TLDS;
  const privateLists = {};
  
  // Conditionally set up Private TLD containers only if VIP
  if (isVip) {
      privateTlds.forEach(t => {
          const d = document.createElement('details');
          d.open = true;
          d.style.marginBottom = '8px';
          const containerId = `private-${t}-list`;
          // Added count placeholder span
          d.innerHTML = `<summary style="font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer;"><span class="tld-arrow">▾</span><span class="gradient-summary-text">.${t} — Private (<span class="tld-count">0</span>)</span></summary><div id="${containerId}" class="projects-list" style="margin-top:8px;"></div>`;
          privateContainer.appendChild(d);
          privateLists[t] = d.querySelector(`#${containerId}`);
      });
  } else {
      privateContainer.innerHTML = '<div class="empty">Private section requires VIP membership.</div>';
  }

  // Wire arrow toggles: flip .tld-arrow when details open/close
  setTimeout(()=>{ // defer to ensure DOM nodes are in tree
    document.getElementById('quantumView')?.querySelectorAll('details summary').forEach(sum => {
      const details = sum.closest('details');
      const arrow = sum?.querySelector('.tld-arrow');
      if (!details || !arrow) return;
      const sync = ()=> { arrow.textContent = details.open ? '▾' : '▸'; };
      sync();
      sum.addEventListener('click', ()=> setTimeout(sync, 10));
    });
  }, 0);


  // fetch scores for each published project (upvotes - downvotes)
  const scorePromises = published.map(async (p) => {
    try {
      const snap = await get(ref(db, `projectVotes/${p.id}/votes`));
      let up = 0, dn = 0;
      if (snap && snap.exists()) {
        Object.entries(snap.val()).forEach(([_, v]) => { const n = Number(v)||0; if (n>0) up++; else if (n<0) dn++; });
      }
      return { id: p.id, score: up - dn, up, down: dn, project: p };
    } catch(_) {
      return { id: p.id, score: 0, up:0, down:0, project: p };
    }
  });

  const scored = await Promise.all(scorePromises);

  // group by tld and sort descending by score, then by updated_at fallback
  const groups = {};
  scored.forEach(s => {
    const p = s.project;
    const slug = (p.page_slug || `${(p.name||'untitled').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9.-]/g,'')}.clos`).toLowerCase();
    const tld = slug.split('.').pop();
    // Only include private TLDs if user is VIP
    if (PUBLIC_TLDS.includes(tld) || (isVip && PRIVATE_TLDS.includes(tld))) {
        if (!groups[tld]) groups[tld] = [];
        groups[tld].push({ meta: s, slug, project: p });
    }
  });

  let totalPublic = 0;
  let totalPrivate = 0;
  let hasPublicContent = false;
  let hasPrivateContent = false;

  // helper to render a list with limit and expand
  function renderList(container, arr){
    container.innerHTML = '';
    if (!arr || !arr.length) return;
    // sort by score desc, then updated_at desc
    arr.sort((a,b)=>{
      if (b.meta.score !== a.meta.score) return b.meta.score - a.meta.score;
      const atA = a.project.updated_at || a.project.created_at || 0;
      const atB = b.project.updated_at || b.project.created_at || 0;
      return (new Date(atB)).valueOf() - (new Date(atA)).valueOf();
    });
    const limit = 10;
    const visible = arr.slice(0, limit);
    const hidden = arr.slice(limit);
    visible.forEach(entry => {
      const p = entry.project;
      const slug = entry.slug;
      const projectId = p.id;
      const card = document.createElement('div');
      card.className = 'project-card';
      const display = slug && slug.includes('.') ? `QTTPS://${slug}` : slug;
      card.innerHTML = `<div class="project-main">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="project-name">
            <a href="#" class="open-link" data-id="${p.id}">${display}</a>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="btn tiny upvote" data-id="${projectId}" title="Thumbs up">👍</button><span id="q-up-${projectId}" style="min-width:16px;color:#27c93f">${entry.meta.up}</span>
            <button class="btn tiny danger downvote" data-id="${projectId}" title="Thumbs down">👎</button><span id="q-down-${projectId}" style="min-width:16px;color:#ff6b6b">${entry.meta.down}</span>
          </div>
        </div>
        <div class="project-desc" style="color:var(--muted);font-size:12px;margin-top:4px;">${(p.description||'').slice(0,86)}</div>
      </div>`;
      card.querySelector('.open-link')?.addEventListener('click', (e)=>{ e.preventDefault(); openPublishedFullscreen(p); });
      card.querySelector('.upvote')?.addEventListener('click', () => voteOnProject(projectId, 1));
      card.querySelector('.downvote')?.addEventListener('click', () => voteOnProject(projectId, -1));
      // subscribe vote updates for these displayed projects
      subscribeProjectVote(projectId, card);
      container.appendChild(card);
    });

    if (hidden.length) {
      const moreDiv = document.createElement('div');
      moreDiv.style.cssText = 'padding:8px;color:var(--muted);font-size:13px;';
      const btn = document.createElement('button');
      btn.className = 'btn outline tiny';
      btn.textContent = `Show ${hidden.length} more`;
      let expanded = false;
      btn.addEventListener('click', () => {
        if (!expanded) {
          hidden.forEach(entry => {
            const p = entry.project;
            const slug = entry.slug;
            const projectId = p.id;
            const card = document.createElement('div');
            card.className = 'project-card';
            const display = slug && slug.includes('.') ? `QTTPS://${slug}` : slug;
            card.innerHTML = `<div class="project-main">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="project-name">
                  <a href="#" class="open-link" data-id="${p.id}">${display}</a>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                  <button class="btn tiny upvote" data-id="${projectId}" title="Thumbs up">👍</button><span id="q-up-${projectId}" style="min-width:16px;color:#27c93f">${entry.meta.up}</span>
                  <button class="btn tiny danger downvote" data-id="${projectId}" title="Thumbs down">👎</button><span id="q-down-${projectId}" style="min-width:16px;color:#ff6b6b">${entry.meta.down}</span>
                </div>
              </div>
              <div class="project-desc" style="color:var(--muted);font-size:12px;margin-top:4px;">${(p.description||'').slice(0,86)}</div>
            </div>`;
            card.querySelector('.open-link')?.addEventListener('click', (e)=>{ e.preventDefault(); openPublishedFullscreen(p); });
            card.querySelector('.upvote')?.addEventListener('click', () => voteOnProject(projectId, 1));
            card.querySelector('.downvote')?.addEventListener('click', () => voteOnProject(projectId, -1));
            subscribeProjectVote(projectId, card);
            container.appendChild(card);
          });
          btn.textContent = 'Show less';
          expanded = true;
        } else {
          // remove the hidden nodes we appended
          for (let i = 0; i < hidden.length; i++) container.lastElementChild?.remove();
          btn.textContent = `Show ${hidden.length} more`;
          expanded = false;
        }
      });
      moreDiv.appendChild(btn);
      container.appendChild(moreDiv);
    }
  }

  // render public groups (.clos,.dafy,.taur,.cele)
  publicTlds.forEach(t => {
    const arr = groups[t] || [];
    const count = arr.length;
    totalPublic += count;
    
    // Update the summary text for the TLD specific section
    const detailsEl = publicLists[t]?.closest('details');
    if (detailsEl) {
        const countSpan = detailsEl.querySelector('.tld-count');
        if (countSpan) countSpan.textContent = count;
    }

    if (arr.length) {
      renderList(publicLists[t], arr);
      hasPublicContent = true;
    } else if (publicLists[t]) {
      publicLists[t].innerHTML = '<div class="empty">No sites in this TLD.</div>';
    }
  });

  // render private groups (only if VIP)
  if (isVip) {
    privateTlds.forEach(t => {
      const arr = groups[t] || [];
      const count = arr.length;
      totalPrivate += count;

      // Update the summary text for the TLD specific section
      const detailsEl = privateLists[t]?.closest('details');
      if (detailsEl) {
          const countSpan = detailsEl.querySelector('.tld-count');
          if (countSpan) countSpan.textContent = count;
      }

      if (arr.length) {
        renderList(privateLists[t], arr);
        hasPrivateContent = true;
      } else if (privateLists[t]) {
        privateLists[t].innerHTML = '<div class="empty">No sites in this TLD.</div>';
      }
    });
  } else {
    privateContainer.innerHTML = '<div class="empty">Private section requires VIP membership.</div>';
  }

  // final empty checks
  if (!hasPublicContent) {
    publicContainer.innerHTML = '<div class=\"empty\">No published public pages yet.</div>';
  }
  if (isVip && !hasPrivateContent) {
    privateContainer.innerHTML = '<div class=\"empty\">No published private pages yet.</div>';
  } else if (!isVip) {
    privateContainer.innerHTML = privateContainer.innerHTML || '<div class="empty">Private section requires VIP membership.</div>';
  }
  
  // Final total counts update:
  if (publicSummarySpan) {
      publicSummarySpan.textContent = `Quantum Internet — Public (${totalPublic})`;
  }

  if (privateSummarySpan) {
      const privateTotalText = isVip ? totalPrivate : 'VIP';
      privateSummarySpan.textContent = `Quantum Internet — Private (${privateTotalText})`;
  }
}

export async function openPublishedFullscreen(project){
  const accountArea = document.getElementById('account-area');
  const editorArea = document.getElementById('editor-area');
  const topbarActions = document.getElementById('topbarActions');

  _lastVisibleSection = {
    accountHidden: accountArea.classList.contains('hidden'),
    editorHidden: editorArea.classList.contains('hidden')
  };

  const panel = document.createElement('div');
  panel.id = 'pageViewer';
  panel.className = 'page-viewer-panel';

  _browserControls = document.createElement('div');
  _browserControls.id = 'browserControls';
  _browserControls.className = 'page-viewer-toolbar';
  _browserControls.style.display = 'flex';
  _browserControls.style.alignItems = 'center';
  _browserControls.style.gap = '8px';
  _browserControls.style.width = '100%';

  const hasContent = (()=>{ const c = getContentFromProject(project); return !!(c.html || c.css || c.js); })();
  const slug = project?.page_slug || (project?.name ? `${project.name.toLowerCase().replace(/\s+/g,'')}.clos` : 'z.clos');
  const tld = slug.split('.').pop();
  
  // VIP check for private TLDs (.life, .end)
  if (PRIVATE_TLDS.includes(tld)) {
    const userPlan = await getUserPlanStatus();
    if (userPlan !== 'Premium') {
      showError(`Access denied: "QTTPS://${slug}" is a private site. VIP membership required.`);
      return; // HALT
    }
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'btn browser-nav icon';
  backBtn.textContent = '←';
  backBtn.title = 'Back';
  _browserControls.appendChild(backBtn);

  const forwardBtn = document.createElement('button');
  forwardBtn.className = 'btn browser-nav icon';
  forwardBtn.textContent = '→';
  forwardBtn.title = 'Forward';
  _browserControls.appendChild(forwardBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn browser-nav icon';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  _browserControls.appendChild(closeBtn);

  // lock button + version badge (v4) inserted before the URL input
  const protoModes = ['v4', 'v6', 'v8']; let protoIndex = 0;
  const lockVerBtn = document.createElement('button');
  lockVerBtn.className = 'btn browser-nav';
  lockVerBtn.title = 'Protocol';
  lockVerBtn.setAttribute('aria-label', 'Protocol');
  lockVerBtn.textContent = '🔒 ' + protoModes[protoIndex];
  lockVerBtn.addEventListener('click', async () => {
    protoIndex = (protoIndex + 1) % protoModes.length;
    lockVerBtn.textContent = '🔒 ' + protoModes[protoIndex];
    const mode = protoModes[protoIndex];
    if (mode === 'v4') { urlInput.value = displayUrl; }
    else if (mode === 'v6') { const v6 = await leetIPv6FromText(project?.page_slug||''); urlInput.value = `QTTPS://[${v6}]`; }
    else { const v8 = await leetFromText(project?.page_slug||''); urlInput.value = `QTTPS://${v8}`; }
  });
  _browserControls.appendChild(lockVerBtn);

  const urlInput = document.createElement('input');
  urlInput.className = 'page-viewer-url';
  urlInput.type = 'text';
  urlInput.setAttribute('aria-label','URL');
  urlInput.style.flex = '1';
  urlInput.style.minWidth = '220px';
  urlInput.style.padding = '6px 8px';
  urlInput.style.borderRadius = '6px';
  urlInput.style.border = '1px solid #333';
  urlInput.style.background = '#000';
  urlInput.style.color = '#fff';
  _browserControls.appendChild(urlInput);

  const goBtn = document.createElement('button');
  goBtn.className = 'btn icon';
  goBtn.textContent = 'Go';
  goBtn.title = 'Load URL';
  _browserControls.appendChild(goBtn);

  topbarActions.appendChild(_browserControls);

  const iframe = document.createElement('iframe');
  iframe.className = 'page-viewer-iframe';
  panel.appendChild(iframe);

  const card = document.getElementById('auth-card') || document.body;
  card.appendChild(panel);

  window._currentPublishedProject = project;

  // prefer showing a friendly public URL for published pages
  const displayUrl = slug && slug.includes('.') ? `QTTPS://${slug}` : ((window.baseUrl || (window.location.origin + window.location.pathname)) + slug);
  urlInput.value = displayUrl;

  const base = getContentFromProject(project);
  const baseHtml = base.html || '<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>New Project</title></head><body><h1>Hello</h1></body></html>';
  const baseCss = base.css || 'body{font-family: Noto Sans, system-ui; margin:20px;}';
  const baseJs = base.js || 'console.log(\"Ready\");';

  if(!hasContent){
    const notFoundHtml = make404(slug);
    const srcdoc = combineSrcDoc(notFoundHtml, 'body{background:#fff;color:#111}', '');
    navState.push(srcdoc, slug);
    iframe.srcdoc = srcdoc;
  } else {
    const srcdoc = combineSrcDoc(baseHtml, baseCss, baseJs);
    navState.push(srcdoc, slug);
    iframe.srcdoc = srcdoc;
  }

  function loadCurrent(){
    const cur = navState.current();
    if(!cur){ iframe.srcdoc = ''; return; }
    iframe.srcdoc = cur.srcdoc;
    const label = String(cur.label||'');
    urlInput.value = (!label || label===slug) ? displayUrl : `${displayUrl}/${label}`;
  }
  navState.onchange = loadCurrent;

  backBtn.addEventListener('click', ()=> navState.back());
  forwardBtn.addEventListener('click', ()=> navState.forward());
  closeBtn.addEventListener('click', ()=> closePublishedFullscreen());
  goBtn.addEventListener('click', () => {
    const entered = (urlInput.value||'').trim();
    handleNavigateTo(entered);
  });

  urlInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); goBtn.click(); } });

  const onMsg = (e)=>{ 
    if(e?.data?.type === 'qnet:viewerClose') closePublishedFullscreen(); 
    else if(e?.data?.type === 'qnet:navigate') handleNavigateTo(e.data.href);
  };
  window.addEventListener('message', onMsg);

  accountArea.classList.add('hidden');
  editorArea.classList.add('hidden');
}

export function closePublishedFullscreen(){
  const accountArea = document.getElementById('account-area');
  const editorArea = document.getElementById('editor-area');
  const signOutBtn = document.getElementById('signOutBtn');

  const overlay = document.getElementById('pageViewer');
  if (overlay) overlay.remove();

  const btn = document.getElementById('browserBackBtn');
  if (btn) btn.remove();

  if (_browserControls) { 
    _browserControls.remove(); 
    _browserControls = null; 
  }

  if (signOutBtn) signOutBtn.classList.remove('hidden');

  if (_lastVisibleSection) {
    if (!_lastVisibleSection.accountHidden) accountArea.classList.remove('hidden'); 
    else accountArea.classList.add('hidden');
    if (!_lastVisibleSection.editorHidden) editorArea.classList.remove('hidden'); 
    else editorArea.classList.add('hidden');
    _lastVisibleSection = null;
  } else {
    accountArea.classList.remove('hidden');
    editorArea.classList.add('hidden');
  }

  // Ensure we return to the Quantum Internet — Public view (page 1)
  const quantumView = document.getElementById('quantumView');
  const projectsList = document.getElementById('projectsList');
  const tabQuantum = document.getElementById('tabQuantum');
  const tabProjects = document.getElementById('tabProjects');
  if (quantumView) {
    // show quantum view and hide other main views
    quantumView.classList.remove('hidden');
    quantumView.style.display = '';
    if (projectsList) { projectsList.classList.add('hidden'); projectsList.style.display = 'none'; }
    // update tab visual state
    if (tabQuantum) tabQuantum.classList.remove('hidden');
    if (tabProjects) tabProjects.classList.remove('outline');
    if (tabQuantum) tabQuantum.classList.add('outline');
  }
}

async function handleNavigateTo(href){
  const entered = String(href||'').trim(); if (!entered) return;
  const slug = extractQuantumSlug(entered);
  
  if (slug) {
    const published = room.collection('project_v1').filter({ published: true }).getList() || [];
    // robust lookup: exact match first, then fallback to endsWith (handle aliases/subdomains)
    let target = published.find(p => String(p.page_slug || '').toLowerCase() === slug);
    if (!target) {
      target = published.find(p => String(p.page_slug || '').toLowerCase().endsWith('.' + slug) || slug.endsWith('.' + String(p.page_slug || '').toLowerCase()));
    }

    if (target) {
      const tld = slug.split('.').pop();
      // VIP check for private TLDs
      if (PRIVATE_TLDS.includes(tld)) {
        const userPlan = await getUserPlanStatus();
        if (userPlan !== 'Premium') {
          showError(`Access denied: "QTTPS://${slug}" is a private site. VIP membership required.`);
          const nf = make404(`Access Denied: ${slug}`);
          const srcdoc = combineSrcDoc(nf, 'body{background:#fff;color:#111}', '');
          navState.push(srcdoc, entered);
          const currentIframe = document.querySelector('.page-viewer-iframe');
          const urlInput = document.querySelector('.page-viewer-url');
          if (currentIframe) currentIframe.srcdoc = srcdoc;
          if (urlInput) urlInput.value = `Access Denied: ${slug}`;
          return; // HALT
        }
      }

      const currentIframe = document.querySelector('.page-viewer-iframe');
      const urlInput = document.querySelector('.page-viewer-url');
      if (currentIframe && urlInput) {
        const content = getContentFromProject(target);
        const hasContent = !!(content.html || content.css || content.js);
        if (hasContent) {
          const srcdoc = combineSrcDoc(content.html, content.css, content.js);
          navState.push(srcdoc, target.page_slug);
          currentIframe.srcdoc = srcdoc; urlInput.value = `QTTPS://${target.page_slug}`; window._currentPublishedProject = target;
        } else {
          const nf = make404(target.page_slug);
          const srcdoc = combineSrcDoc(nf, 'body{background:#fff;color:#111}', '');
          navState.push(srcdoc, target.page_slug);
          currentIframe.srcdoc = srcdoc;
          urlInput.value = `QTTPS://${target.page_slug}`;
        }
        return;
      } else {
        openPublishedFullscreen(target); 
        return; 
      }
    }
  }
  if (/^https?:|^mailto:|^tel:/i.test(entered)) { window.open(entered,'_blank'); return; }
  
  // Check if it's a quantum internet page slug
  if (/\.(clos|dafy|taur|cele|life|end)$/i.test(entered)) {
    const published = room.collection('project_v1').filter({ published: true }).getList() || [];
    // robust lookup: exact match then suffix match
    let targetProject = published.find(p => String(p.page_slug||'').toLowerCase() === entered.toLowerCase());
    if (!targetProject) {
      targetProject = published.find(p => String(p.page_slug||'').toLowerCase().endsWith('.' + entered.toLowerCase()) || entered.toLowerCase().endsWith('.' + String(p.page_slug||'').toLowerCase()));
    }
    if (targetProject) {
        const tld = targetProject.page_slug.split('.').pop();
        
        // VIP check for redundant TLD block
        if (PRIVATE_TLDS.includes(tld)) {
            const userPlan = await getUserPlanStatus();
            if (userPlan !== 'Premium') {
                 showError(`Access denied: "QTTPS://${targetProject.page_slug}" is a private site. VIP membership required.`);
                 const nf = make404(`Access Denied: ${targetProject.page_slug}`);
                 const srcdoc = combineSrcDoc(nf, 'body{background:#fff;color:#111}', '');
                 navState.push(srcdoc, entered);
                 const currentIframe = document.querySelector('.page-viewer-iframe');
                 const urlInput = document.querySelector('.page-viewer-url');
                 if (currentIframe) currentIframe.srcdoc = srcdoc;
                 if (urlInput) urlInput.value = `Access Denied: ${targetProject.page_slug}`;
                 return; // HALT
            }
        }

      // Check if we're in a viewer
      const currentIframe = document.querySelector('.page-viewer-iframe');
      const urlInput = document.querySelector('.page-viewer-url');
      if (currentIframe && urlInput) {
        const content = getContentFromProject(targetProject);
        const hasContent = targetProject && (content.html || content.css || content.js);
        if (hasContent) {
          const srcdoc = combineSrcDoc(targetProject.html || '', targetProject.css || '', targetProject.js || '');
          navState.push(srcdoc, targetProject.page_slug);
          currentIframe.srcdoc = srcdoc;
          urlInput.value = `QTTPS://${targetProject.page_slug}`;
          window._currentPublishedProject = targetProject;
        }
        return;
      } else {
        openPublishedFullscreen(targetProject);
        return;
      }
    }
  }
  
  // Handle relative file navigation within current project
  const fname = entered.replace(/^\.\/$/,'').split('#')[0].split('?')[0];
  const proj = window._currentPublishedProject || null;
  const content = getContentFromProject(proj || {});
  const main = (proj?.html_filename) || 'index.html';
  const htmlContent = (!fname || fname === main) ? (content.html || '') : (proj?.files?.[fname] || '');
  if (!htmlContent) {
    const nf = make404(entered);
    const srcdoc = combineSrcDoc(nf, 'body{background:#fff;color:#111}', '');
    navState.push(srcdoc, entered);
  } else {
    const css = content.css || '';
    const js = content.js || '';
    const srcdoc = combineSrcDoc(htmlContent, css, js);
    navState.push(srcdoc, fname || proj?.page_slug || 'page');
  }
  const cur = navState.current(); if (cur) document.querySelector('.page-viewer-iframe')?.setAttribute('srcdoc', cur.srcdoc);
  const input = document.querySelector('.page-viewer-url');
  if (input && proj?.page_slug) input.value = (!fname ? `QTTPS://${proj.page_slug}` : `QTTPS://${proj.page_slug}/${fname}`);
}

function getContentFromProject(p){
  // 1. Try root fields or current/latest version
  let v = Array.isArray(p?.versions) ? ((Number.isInteger(p.current_version_index) && p.versions[p.current_version_index]) || p.versions[p.versions.length-1]) : null;
  let html = p?.html || v?.html || '';
  let css = p?.css || v?.css || '';
  let js = p?.js || v?.js || '';
  
  // 2. If content is still empty, try iterating through all versions just in case
  if (!(html || css || js) && Array.isArray(p?.versions)) {
      // Iterate backwards from oldest to newest (excluding last checked version 'v')
      for (let i = p.versions.length - 1; i >= 0; i--) {
          const checkV = p.versions[i];
          if (checkV.html || checkV.css || checkV.js) {
              html = checkV.html || '';
              css = checkV.css || '';
              js = checkV.js || '';
              break; // Found content in an older version, use it
          }
      }
  }

  return { html, css, js };
}

function unsubscribeProjectVotes() {
  Object.values(projectVoteListeners).forEach(unsub => unsub());
  projectVoteListeners = {};
}

async function voteOnProject(projectId, val) {
  if (!auth.currentUser) return showError('Sign in to vote.');
  // Path for project votes: projectVotes/$projectId
  await voteOn(`projectVotes/${projectId}`, val);
}

function subscribeProjectVote(projectId, cardElement) {
  const meUid = auth.currentUser?.uid;
  const votesRef = ref(db, `projectVotes/${projectId}/votes`);

  // keep previous snapshot to detect who changed (avoid duplicate-notify on initial load)
  window._projectVotePrev = window._projectVotePrev || {};
  const unsub = onValue(votesRef, async (snap) => {
    let up = 0, dn = 0, myVote = 0;
    const map = snap.exists() ? snap.val() : {};
    for (const [uid, val] of Object.entries(map)) {
      const n = Number(val) || 0;
      if (n > 0) up++; else if (n < 0) dn++;
      if (uid === meUid) myVote = n;
    }

    const upEl = cardElement.querySelector(`#q-up-${projectId}`);
    const dnEl = cardElement.querySelector(`#q-down-${projectId}`);
    const upBtn = cardElement.querySelector(`.upvote[data-id="${projectId}"]`);
    const dnBtn = cardElement.querySelector(`.downvote[data-id="${projectId}"]`);
    if (upEl) upEl.textContent = String(up);
    if (dnEl) dnEl.textContent = String(dn);
    if (upBtn) upBtn.classList.toggle('active', myVote > 0);
    if (dnBtn) dnBtn.classList.toggle('active', myVote < 0);

    // detect single-change voter compared to previous state and notify owner once with their name
    try {
      const prev = window._projectVotePrev[projectId] || {};
      // find uid that changed value (new, removed, or changed)
      let changedUid = null, prevVal = 0, newVal = 0;
      const keys = new Set([...Object.keys(prev), ...Object.keys(map)]);
      for (const k of keys) {
        const a = Number(prev[k]||0), b = Number(map[k]||0);
        if (a !== b) { changedUid = k; prevVal = a; newVal = b; break; }
      }
      window._projectVotePrev[projectId] = map;
      // only notify if change exists, project owner is current user, and the voter is not you
      const ownerUid = window._currentPublishedProject?.id === projectId ? window._currentPublishedProject.owner_id : null;
      if (changedUid && ownerUid && auth.currentUser && ownerUid === auth.currentUser.uid && changedUid !== auth.currentUser.uid) {
        // fetch voter's display name (best-effort)
        const snapUser = await get(ref(db, `users/${changedUid}`));
        const display = snapUser && snapUser.exists() ? (snapUser.val().username || snapUser.val().email?.split('@')[0] || changedUid) : changedUid;
        if (newVal > 0) import('./ui.js').then(m => m.notify(`${display} liked your page (👍)`, 5000));
        else if (newVal < 0) import('./ui.js').then(m => m.notify(`${display} disliked your page (👎)`, 5000));
      }
    } catch (e) { /* swallow notification errors */ }
  });

  projectVoteListeners[projectId] = unsub;
}