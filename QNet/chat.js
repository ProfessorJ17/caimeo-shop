import { getFilenames, schedulePreview, getCurrentProject, refreshFilenamesUI } from './editor.js';
import { saveCurrentProject } from './projects.js';
import { rebuildSidebarForProject } from './sidebar.js';

export function getChatKey(){
  const p = getCurrentProject?.();
  return p?.id ? `chat.${p.id}` : 'chat.__global';
}

export function loadChat(){ 
  try{ return JSON.parse(localStorage.getItem(getChatKey())||'[]'); }catch(_){ return []; } 
}

export function saveChat(arr){ 
  try{ localStorage.setItem(getChatKey(), JSON.stringify(arr)); }catch(_){ /* ignore */ } 
}

export function applyUpdates(arr){
  const fs=getFilenames(); 
  const h=document.getElementById('htmlEditor'), c=document.getElementById('cssEditor'), j=document.getElementById('jsEditor');
  const proj=getCurrentProject(); 
  if(proj) proj.files=proj.files||{};
  
  arr.forEach(u=>{ 
    const n=(u.filename||u.file||'').trim(); 
    const k=u.content??''; 
    if(!n) return;
    
    if(n===fs.htmlFileName) h.value=k; 
    else if(n===fs.cssFileName) c.value=k; 
    else if(n===fs.jsFileName) j.value=k; 
    else if(proj){ proj.files[n]=k; }
  });
  
  refreshFilenamesUI(); 
  schedulePreview(); 
  saveCurrentProject?.(); 
  rebuildSidebarForProject();
}