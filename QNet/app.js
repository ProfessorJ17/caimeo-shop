import { initAuth } from './auth.js';
import { initUI, showError, clearError, setupVisibilityToggles } from './ui.js';
import { initEditor, loadProjectIntoEditor, getFilenames } from './editor.js';
import { buildSidebarHeader } from './sidebar.js';
import { initProjects, renderProjectsList, publishProject, deleteVersion } from './projects.js';
import { initSidebar, rebuildSidebarForProject } from './sidebar.js';
import { initQuantum } from './quantum.js';
import { initSocial } from './social.js';
import { setLiveVersion } from './projects.js';
import { updateProjectMeta } from './projects.js';
import { encryptAndUploadCurrentProject } from './encryption.js';
import { saveQuantumKeysToDb, auth } from './auth.js';

function renderAccountArea() {
  const accountArea = document.getElementById('account-area');
  const editorArea = document.getElementById('editor-area');
  const topbarActions = document.getElementById('topbarActions');
  const editorToolbar = document.getElementById('editorToolbar');

  accountArea.classList.remove('hidden');
  editorArea.classList.add('hidden');

  // move controls back into editorToolbar (if they were in topbar)
  if (topbarActions && editorToolbar) {
    [...topbarActions.childNodes].forEach(n => editorToolbar.appendChild(n));
  }
}

function renderEditorArea(project) {
  const accountArea = document.getElementById('account-area');
  const editorArea = document.getElementById('editor-area');
  const topbarActions = document.getElementById('topbarActions');
  const editorToolbar = document.getElementById('editorToolbar');
  const projectNameInput = document.getElementById('projectNameInput');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const backToAccountBtn = document.getElementById('backToAccountBtn');
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const publishProjectBtn = document.getElementById('publishProjectBtn');
  const encryptUploadBtn = document.getElementById('encryptUploadBtn');

  accountArea.classList.add('hidden');
  editorArea.classList.remove('hidden');

  projectNameInput.value = project?.name || 'Untitled';
  loadProjectIntoEditor(project);

  // move controls into top bar
  if (topbarActions && editorToolbar) {
    const controls = [backToAccountBtn, projectNameInput, saveProjectBtn, publishProjectBtn, encryptUploadBtn, toggleSidebarBtn].filter(Boolean);
    controls.forEach(el => topbarActions.appendChild(el));
  }

  rebuildSidebarForProject();
}

function show404(label){
  const overlay=document.createElement('div'); overlay.className='modal-overlay';
  const wrap=document.createElement('div'); wrap.className='modal';
  wrap.innerHTML=`<h3>404 — Page Not Found</h3><p>No page named \"${label||''}\".</p><div class=\"actions\"><button class=\"btn outline\" id=\"back404\">Back</button></div>`;
  overlay.appendChild(wrap); document.body.appendChild(overlay);
  const close=()=>overlay.remove(); wrap.querySelector('#back404')?.addEventListener('click', close);
  overlay.addEventListener('click',(e)=>{ if(e.target===overlay) close(); });
}

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initEditor();
  initSidebar();
  initQuantum();
  initSocial();

  setupVisibilityToggles(); // ADDED: Initialize visibility toggles

  const projectManager = initProjects(renderProjectsList);

  // Wire up back button
  const backToAccountBtn = document.getElementById('backToAccountBtn');
  if (backToAccountBtn) {
    backToAccountBtn.addEventListener('click', () => renderAccountArea());
  }

  // Wire up publish button
  const publishProjectBtn = document.getElementById('publishProjectBtn');
  if (publishProjectBtn) {
    publishProjectBtn.addEventListener('click', publishProject);
  }

  const encryptUploadBtn = document.getElementById('encryptUploadBtn');
  if (encryptUploadBtn) {
    encryptUploadBtn.addEventListener('click', encryptAndUploadCurrentProject);
  }

  // NEW: make the checkmark (save) button save and return editor to normal state
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  if (saveProjectBtn) {
    saveProjectBtn.addEventListener('click', async (e) => {
      try {
        // disable briefly to avoid double-click
        saveProjectBtn.disabled = true;
        await saveCurrentProject?.();
      } catch (err) {
        console.warn('Save failed:', err);
      } finally {
        saveProjectBtn.disabled = false;
        // return UI to account area and restore toolbar controls
        renderAccountArea();
      }
    });
  }

  // Handle custom events
  document.addEventListener('openEditor', (e) => {
    renderEditorArea(e.detail.project);
  });

  document.addEventListener('getFilenames', (e) => {
    rebuildSidebarForProject();
  });

  document.addEventListener('openSidebarFile', (e) => {
    const f=e.detail.filename, fs=getFilenames(), proj=(window.getCurrentProject?.()||null);
    const show=(sel)=>{const el=document.querySelector(sel); if(el){ el.closest('.code-pane').style.display=''; el.focus(); el.scrollIntoView({block:'nearest'});} };
    if(f===fs.htmlFileName) return show('#htmlEditor');
    if(f===fs.cssFileName) return show('#cssEditor');
    if(f===fs.jsFileName) return show('#jsEditor');
    const openInPane = (paneSelector, filename, content) => {
      const pane = document.querySelector(paneSelector); if(pane){ pane.style.display=''; }
      const base = (paneSelector.replace(/^[.#]/,'') || 'pane4');
      const s=document.querySelector('#'+base+'Filename'); if(s) s.textContent=filename;
      const t=document.querySelector('#'+base+'Editor'); if(t){ t.value=content||''; t.focus(); }
      // Do not override global column layout when opening sidebar files — preserve user's pane sizes
    };
    if(f==='README.md'){ return openInPane('.pane4','README.md', proj?.files?.['README.md']||''); }
    const content = proj?.files?.[f] || '';
    openInPane('.pane4', f, content);
  });

  document.addEventListener('deleteSidebarFile', (e) => {
    // Handle deleting sidebar files
    console.log('Delete sidebar file:', e.detail.filename);
  });

  document.addEventListener('saveTitleAndDescription', (e) => {
    const projectNameInput = document.getElementById('projectNameInput');
    projectNameInput.value = e.detail.name;
    updateProjectMeta(e.detail); // validates slug uniqueness and saves
  });

  document.addEventListener('restoreVersion', (e) => {
    const idx = e.detail.index;
    const current = window.currentProject || null;
    const proj = (current || getCurrentProject?.()) || null; // fallback safe
    const versions = Array.isArray(proj?.versions) ? proj.versions : [];
    const v = versions[idx];
    if (!v) return;
    loadProjectIntoEditor({ ...proj, html: v.html, css: v.css, js: v.js, html_filename: v.html_filename, css_filename: v.css_filename, js_filename: v.js_filename });
  });

  document.addEventListener('deleteVersion', (e) => {
    const idx = e.detail.index;
    if (typeof idx === 'number') deleteVersion(idx);
  });

  document.addEventListener('makeLiveVersion', (e) => {
    const idx = e.detail.index;
    if (typeof idx === 'number') setLiveVersion(idx);
  });

  // Initialize auth last so it can trigger user state changes
  initAuth((userId) => {
    if (userId) {
      projectManager.subscribeToUserProjects(userId);
    } else {
      projectManager.unsubscribe();
      // ensure only login is visible when logged out
      const accountArea = document.getElementById('account-area');
      const editorArea = document.getElementById('editor-area');
      const authUi = document.getElementById('auth-ui');
      document.getElementById('pageViewer')?.remove();
      accountArea?.classList.add('hidden');
      editorArea?.classList.add('hidden');
      authUi?.classList.remove('hidden');
      const topbarActions = document.getElementById('topbarActions');
      if (topbarActions) topbarActions.innerHTML = ''; // clear toolbar buttons (back, url, save, publish, sidebar, etc)
    }
  }, showError, clearError);

  // Auto-save generated public quantum keys to RTDB when other windows/tools place them in localStorage.
  // Listens for legacy/global keys (pq.kem.pub / pq.dsa.pub) and saves them under the signed-in user's profile.
  window.addEventListener('storage', async (e) => {
    try {
      if (!e || !(e.key === 'pq.kem.pub' || e.key === 'pq.dsa.pub')) return;
      const uid = auth.currentUser?.uid;
      if (!uid) return; // only save when a user is signed in
      const kemPub = localStorage.getItem('pq.kem.pub') || localStorage.getItem(`pq.kem.pub.${uid}`);
      const dsaPub = localStorage.getItem('pq.dsa.pub') || localStorage.getItem(`pq.dsa.pub.${uid}`);
      if (!kemPub && !dsaPub) return;
      // Save whichever public keys are present; saveQuantumKeysToDb will update timestamps/flags.
      await saveQuantumKeysToDb({ kemPub: kemPub || '', dsaPub: dsaPub || '' });
      // mark cloud-saved flag for this user
      try { localStorage.setItem(`pq.cloudSaved.${uid}`, '1'); localStorage.setItem('pq.cloudSaved','1'); } catch (_) {}
      // notify UI
      document.dispatchEvent(new CustomEvent('authUserChanged', { detail: { user: { id: uid, name: window.qnetUsername || '' } } }));
    } catch (err) {
      console.warn('Auto-save quantum keys failed:', err);
    }
  });

  // Listen for postMessage events from external keygen windows to immediately save generated public keys
  window.addEventListener('message', async (ev) => {
    try {
      const d = ev?.data || {};
      if (d?.type === 'pq:keysGenerated') {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const kemPub = d.kemPub || localStorage.getItem('pq.kem.pub') || localStorage.getItem(`pq.kem.pub.${uid}`) || '';
        const dsaPub = d.dsaPub || localStorage.getItem('pq.dsa.pub') || localStorage.getItem(`pq.dsa.pub.${uid}`) || '';
        if (!kemPub && !dsaPub) return;
        try {
          await saveQuantumKeysToDb({ kemPub, dsaPub });
          try { localStorage.setItem(`pq.cloudSaved.${uid}`, '1'); localStorage.setItem('pq.cloudSaved','1'); } catch (_) {}
          document.dispatchEvent(new CustomEvent('authUserChanged', { detail: { user: { id: uid, name: window.qnetUsername || '' } } }));
        } catch (err) {
          console.warn('Failed to save PQ keys from message:', err);
        }
      }
    } catch (e) { /* ignore malformed messages */ }
  });

  // Hide logo on scroll so it feels part of background, not foreground
  (function(){
    const logo = document.querySelector('.qnet-logo');
    const topTitle = document.querySelector('.topbar h1'); // added: target the "QNet" title
    if(!logo && !topTitle) return;
    let ticking = false;
    const onScroll = ()=> {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(()=> {
        if (window.scrollY > 40) {
          if (logo) logo.classList.add('hidden-on-scroll');
          if (topTitle) topTitle.classList.add('hidden-on-scroll'); // hide title on scroll
        }
        else {
          if (logo) logo.classList.remove('hidden-on-scroll');
          if (topTitle) topTitle.classList.remove('hidden-on-scroll'); // restore title when not scrolled
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // initialize state
    onScroll();
  })();

  // Global handler for uncaught promise rejections (e.g. Firebase PERMISSION_DENIED)
  window.addEventListener('unhandledrejection', (evt) => {
    try {
      const err = evt?.reason;
      const msg = (err && (err.message || err?.toString())) || 'An unexpected error occurred.';
      // Friendly notify to user and log concise info
      import('./ui.js').then(m => m.notify(`Error: ${msg}`, 8000)).catch(()=>{});
      console.warn('Unhandled promise rejection captured:', msg);
      // Prevent default console noisy stack if possible
      evt.preventDefault && evt.preventDefault();
    } catch (e) {
      console.error('Error in unhandledrejection handler', e);
    }
  });

  // Keep account QBitCoin balance in sync when other modules update it
  window.addEventListener('qbitBalanceChanged', (e) => {
    try{
      const uid = e.detail?.uid;
      const bal = e.detail?.balance;
      const qbitEl = document.getElementById('qbitBalance');
      if (qbitEl && typeof bal !== 'undefined' && bal !== null) qbitEl.textContent = String(bal);
      // also update rewards balance display if present
      const rewardsEl = document.getElementById('rewardsBalance');
      if (rewardsEl && typeof bal !== 'undefined' && bal !== null) rewardsEl.innerHTML = `QBitCoin Balance: <strong>${Number(bal)}</strong>`;
    }catch(_){}
  });

  // Keep Tokens Redeemed counter in sync when admin approves redemptions
  window.addEventListener('tokensRedeemedChanged', (e) => {
    try {
      const tokens = e.detail?.tokens;
      const el = document.getElementById('tokensRedeemed');
      if (el && typeof tokens !== 'undefined' && tokens !== null) el.textContent = String(tokens);
    } catch(_) {}
  });

  document.addEventListener('click',(e)=>{
    const a=e.target?.closest('a'); if(!a) return;
    const href=a.getAttribute('href')||''; if(!href || href==='#'){ e.preventDefault(); /* no 404 for hash links */ return; }
    if(/^https?:|^mailto:|^tel:/i.test(href)) return;
    // If link is a 17chan board like "/pol/" or "/b/" route to Social view instead of 404
    const boardMatch = href.match(/^\/?(b|pol|x|int|mu|fit|co|lit|tv|his|sp|sci|k|wg|gif|diy|tech|vg|fa|occ|phi|ai)\/?$/i);
    if (boardMatch) { e.preventDefault(); document.dispatchEvent(new CustomEvent('open17chan', { detail: { board: `/${boardMatch[1]}/` } })); return; }
    const target=href.split('#')[0];
    // prevent navigating back to login for dead/internal links to index or site root (except the logo)
    if ((target === 'index.html' || target === '/' || target === './') && !a.classList.contains('qnet-logo')) {
      e.preventDefault(); show404(target); return;
    }
    const allowed=new Set(['terms.html','IpResolver.txt','QuantumKeyPair.txt']);
    if(!allowed.has(target)){ e.preventDefault(); show404(target); }
  });
});