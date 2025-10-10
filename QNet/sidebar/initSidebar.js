import { beginDrag, endDrag, clamp } from '../ui.js';
import { sidebarWidthPx, sidebarDefaultOpen, sidebarSide, sidebarHiddenPeekPx, sidebarHiddenBorder, sidebarHiddenPointerEvents, sidebarMinWidth, sidebarMaxWidth } from './constants.js';

/* manage sidebar element and resizer */
let editorSidebar, _resizer;

export function getEditorSidebar(){ return editorSidebar; }

export function initSidebar() {
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  editorSidebar = document.getElementById('editorSidebar');
  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', toggleSidebar);
  if (!sidebarDefaultOpen) applySidebarClosedStyles(); else ensureResizer();
}

function toggleSidebar() {
  const curVal = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-current').trim();
  const curPx = parseFloat(curVal) || 0;
  const next = curPx <= sidebarHiddenPeekPx ? `${sidebarWidthPx}px` : `${sidebarHiddenPeekPx}px`;
  document.documentElement.style.setProperty('--sidebar-current', next);
  if (parseFloat(next) <= sidebarHiddenPeekPx) applySidebarClosedStyles();
  else {
    if (sidebarSide === 'right') {
      document.documentElement.style.setProperty('--sidebar-border-left', '1px solid #222');
      document.documentElement.style.setProperty('--sidebar-border-right', '0');
      document.documentElement.style.setProperty('--main-margin-right', `${sidebarWidthPx}px`);
    } else {
      document.documentElement.style.setProperty('--sidebar-border-right', '1px solid #222');
      document.documentElement.style.setProperty('--sidebar-border-left', '0');
      document.documentElement.style.setProperty('--main-margin-left', `${sidebarWidthPx}px`);
    }
    document.documentElement.style.setProperty('--sidebar-pointer-events', 'auto');
    document.documentElement.style.setProperty('--sidebar-padding', '10px');
    document.documentElement.style.setProperty('--sidebar-min-width', `${sidebarWidthPx}px`);
    ensureResizer(true);
  }
}

function applySidebarClosedStyles(){
  document.documentElement.style.setProperty('--sidebar-current', '0px');
  document.documentElement.style.setProperty('--sidebar-border-left', sidebarHiddenBorder);
  document.documentElement.style.setProperty('--sidebar-border-right', sidebarHiddenBorder);
  document.documentElement.style.setProperty('--sidebar-pointer-events', sidebarHiddenPointerEvents);
  document.documentElement.style.setProperty('--sidebar-padding', '0px');
  document.documentElement.style.setProperty('--sidebar-min-width', `${sidebarHiddenPeekPx}px`);
  document.documentElement.style.setProperty('--main-margin-left', '0px');
  document.documentElement.style.setProperty('--main-margin-right', '0px');
  if (_resizer) _resizer.style.display = 'none';
}

export function ensureResizer(forceShow=false){
  if (!editorSidebar) editorSidebar = document.getElementById('editorSidebar');
  if (!editorSidebar) return;
  if (!_resizer){
    _resizer = document.createElement('div');
    _resizer.className = 'sidebar-resizer';
    editorSidebar.appendChild(_resizer);
    wireResizer(_resizer);
  } else if (!_resizer.isConnected){
    editorSidebar.appendChild(_resizer);
  }
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-current'))||0;
  _resizer.style.display = (forceShow || cur > 0) ? 'block' : 'none';
}

function wireResizer(handle){
  let startX=0, startW=0;
  const onDown = (e)=>{
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;
    startX = ev.clientX;
    startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-current'))||0;
    beginDrag('col-resize');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  };
  const onMove = (e)=>{
    const ev = e.touches ? e.touches[0] : e;
    const dx = ev.clientX - startX;
    const nextW = clamp(startW - dx, sidebarMinWidth, sidebarMaxWidth);
    document.documentElement.style.setProperty('--sidebar-current', `${nextW}px`);
    if (sidebarSide === 'right') {
      document.documentElement.style.setProperty('--main-margin-right', `${nextW}px`);
      document.documentElement.style.setProperty('--main-margin-left', `0px`);
    } else {
      document.documentElement.style.setProperty('--main-margin-left', `${nextW}px`);
      document.documentElement.style.setProperty('--main-margin-right', `0px`);
    }
    document.documentElement.style.setProperty('--sidebar-min-width', `${nextW}px`);
  };
  const onUp = ()=>{
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    endDrag();
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}