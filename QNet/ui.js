/* @tweakable brand name shown in header and document title */
const brandName = "QNet";

let errorEl, dragShield;

/* @tweakable enable drag shield overlay to capture fast drags */
const enableDragShield = true;
/* @tweakable disable iframe pointer events while dragging */
const disableIframeDuringDrag = true;

export function initUI() {
  errorEl = document.getElementById('error');
  
  document.title = `${brandName} — Login`;
  const headerH1 = document.querySelector('#auth-card h1');
  if (headerH1) headerH1.textContent = brandName;
}

export function showError(msg){
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

export function clearError(){ 
  if (!errorEl) return;
  errorEl.classList.add('hidden'); 
  errorEl.textContent = ''; 
}

export function beginDrag(cursor, previewFrame){
  if (disableIframeDuringDrag && previewFrame) previewFrame.style.pointerEvents = 'none';
  if (enableDragShield && !dragShield){
    dragShield = document.createElement('div');
    dragShield.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${cursor};`;
    document.body.appendChild(dragShield);
  }
}

export function endDrag(previewFrame){
  if (dragShield){ dragShield.remove(); dragShield = null; }
  if (disableIframeDuringDrag && previewFrame) previewFrame.style.pointerEvents = 'auto';
}

export function clamp(val, min, max){ 
  return Math.max(min, Math.min(max, val)); 
}

export function getSectionVisibilityPreference(key) {
  // Returns true if visible, false if hidden by user preference
  return localStorage.getItem(key) !== 'false';
}

export function setupVisibilityToggles() {
  const toggles = document.querySelectorAll('button[data-target-id][data-key]');

  function applyVisibility(button) {
    const targetId = button.dataset.targetId;
    const key = button.dataset.key;
    const target = document.getElementById(targetId);
    if (!target) return;

    const isVisible = getSectionVisibilityPreference(key);
    
    if (isVisible) {
      // Restore appropriate display style based on ID context
      target.style.display = targetId === 'pqGate' ? 'flex' : ''; 
      button.textContent = '👁';
    } else {
      target.style.display = 'none';
      button.textContent = '🙈';
    }
  }

  function toggleVisibility(e) {
    const button = e.currentTarget;
    const key = button.dataset.key;
    
    let isVisible = getSectionVisibilityPreference(key);
    isVisible = !isVisible;
    localStorage.setItem(key, isVisible ? 'true' : 'false');

    applyVisibility(button);
  }

  toggles.forEach(button => {
    applyVisibility(button);
    button.addEventListener('click', toggleVisibility);
  });
}

/* New: small top-right transient notifier */
export function notify(message, duration = 5000, onClick = null) {
  try {
    let wrap = document.getElementById('qnet-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'qnet-toast-wrap';
      // center top placement
      wrap.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:100020;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'qnet-toast';
    t.style.cssText = 'background:#111;color:#fff;padding:10px 12px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.45);pointer-events:auto;max-width:320px;font-size:13px;cursor:' + (onClick ? 'pointer' : 'default') + ';';
    t.textContent = message;
    if (onClick) {
      t.addEventListener('click', () => { try { onClick(); } catch(_){} });
    }
    wrap.appendChild(t);
    setTimeout(()=> {
      t.style.transition = 'opacity .28s ease, transform .28s ease';
      t.style.opacity = '0'; t.style.transform = 'translateY(-8px)';
      setTimeout(()=> t.remove(), 320);
    }, duration);
  } catch (e) { /* swallow */ }
}

/* New: full-screen overlay message with top-left close button */
export function showOverlayMessage(htmlContent, opts = {}) {
  // opts: allowHtml (bool) - if true, htmlContent treated as HTML string
  const existing = document.getElementById('qnet-global-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'qnet-global-overlay';
  overlay.className = 'global-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  if (opts.allowHtml) card.innerHTML = String(htmlContent || '');
  else card.textContent = String(htmlContent || '');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'overlay-close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = 'Close ✕';
  closeBtn.addEventListener('click', () => overlay.remove());

  // close on Escape
  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.body.appendChild(closeBtn);

  // clicking backdrop closes as well
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  return {
    close: () => { overlay.remove(); closeBtn.remove(); document.removeEventListener('keydown', onKey); }
  };
}