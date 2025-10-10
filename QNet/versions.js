import { createThumbnailFromSource } from './thumbnails.js';
import { getCurrentProject } from './editor.js';

export function renderVersions(versionsEl) {
  const currentProject = getCurrentProject();
  const versions = Array.isArray(currentProject?.versions) ? currentProject.versions : [];
  const currentIndex = Number.isInteger(currentProject?.current_version_index) ? currentProject.current_version_index : (versions.length - 1);
  
  document.getElementById('versionsSummary').textContent = `Versions (${versions.length})`;
  versionsEl.innerHTML = '';
  
  versions.forEach((v, idx)=>{
    const isCurrent = idx === currentIndex;
    const vn = v.version_number || (idx + 1);
    const item = document.createElement('div');
    item.className = 'version-item';
    item.tabIndex = 0;
    item.dataset.index = String(idx);
    item.innerHTML = `
      <button class="version-delete btn danger tiny" title="Delete version">✖</button>
      <div class="version-thumb-wrap">
        <img class="version-thumb" src="/assets/preview-placeholder.png" alt="Preview v${vn}" />
        <div class="version-badge${isCurrent ? ' is-current' : ''}">v${vn}</div>
      </div>
      <div class="version-texts">
        <div class="version-title">${v.name || 'Untitled'}</div>
        <div class="version-sub">${new Date(v.created_at||Date.now()).toLocaleString()}</div>
      </div>
    `;
    
    const badge = item.querySelector('.version-badge');
    const imgEl = item.querySelector('.version-thumb');
    
    badge?.addEventListener('mouseenter', ()=>{ badge.dataset.orig = badge.textContent; badge.textContent = `${badge.dataset.orig || `v${vn}`}📌`; });
    badge?.addEventListener('mouseleave', ()=>{ badge.textContent = badge.dataset.orig || `v${vn}`; });
    badge?.addEventListener('click', (e)=>{
      e.stopPropagation();
      document.querySelectorAll('.version-badge.is-current').forEach(b=>b.classList.remove('is-current'));
      badge.classList.add('is-current');
      const ev1 = new CustomEvent('restoreVersion', { detail: { index: idx } });
      document.dispatchEvent(ev1);
      const ev2 = new CustomEvent('makeLiveVersion', { detail: { index: idx } });
      document.dispatchEvent(ev2);
    });
    
    item.addEventListener('click', ()=> {
      const ev = new CustomEvent('restoreVersion', { detail: { index: idx } });
      document.dispatchEvent(ev);
    });
    
    item.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); item.click(); }});
    
    item.querySelector('.version-delete')?.addEventListener('click', (e)=>{
      e.stopPropagation();
      const ev = new CustomEvent('deleteVersion', { detail: { index: idx } });
      document.dispatchEvent(ev);
    });
    
    if (isCurrent) item.classList.add('is-active');
    versionsEl.appendChild(item);
    
    if (imgEl) {
      createThumbnailFromSource({ html: v.html || '', css: v.css || '', js: v.js || '' }, { width: 224, height: 160 })
        .then(url => { imgEl.src = url; })
        .catch(()=>{ /* ignore, keep placeholder */ });
    }
  });
}

