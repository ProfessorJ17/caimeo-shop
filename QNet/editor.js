import { setupVerticalGutter, setupHorizontalGutter, redistributeColumns } from './gutters.js';

/* @tweakable debounce ms before updating preview after edits */
const previewDebounceMs = 300;
/* @tweakable default HTML template */
const defaultHTML = "<!doctype html>\n<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>New Project</title></head><body><h1>Hello</h1></body></html>";
/* @tweakable default CSS template */
const defaultCSS = "body{font-family: Noto Sans, system-ui; margin:20px;}";
/* @tweakable default JS template */
const defaultJS = "console.log('Ready');";

/* @tweakable default HTML filename shown and saved */
const defaultHtmlFilename = "index.html";
/* @tweakable default CSS filename shown and saved */
const defaultCssFilename = "styles.css";
/* @tweakable default JS filename shown and saved */
const defaultJsFilename = "script.js";

/* @tweakable allow renaming via prompt dialog (true) or ignore clicks (false) */
const enablePromptRename = false;
/* @tweakable save inline rename when pressing Enter */
const inlineRenameSaveOnEnter = true;
/* @tweakable save inline rename when the input loses focus */
const inlineRenameSaveOnBlur = true;
/* @tweakable width of the inline rename input in pixels */
const inlineRenameInputWidthPx = 140;
/* @tweakable max length for the sidebar file name */
const filenameMaxLength = 64;
/* @tweakable enable safe DOM replacement during inline rename to avoid replaceWith errors (true = use safe replacement) */
const inlineRenameSafeReplace = true;
/* @tweakable whether closing a code pane hides it (true) or does nothing (false) */
const enablePaneClose = true;

let htmlFileName = defaultHtmlFilename;
let cssFileName = defaultCssFilename;
let jsFileName = defaultJsFilename;
let currentProject = null;
let previewTimer = null;

const htmlEditor = document.getElementById('htmlEditor');
const cssEditor = document.getElementById('cssEditor');
const jsEditor = document.getElementById('jsEditor');
const previewFrame = document.getElementById('previewFrame');
const htmlFilenameSpan = document.getElementById('htmlFilename');
const cssFilenameSpan = document.getElementById('cssFilename');
const jsFilenameSpan = document.getElementById('jsFilename');
const editHtmlBtn = document.getElementById('editHtmlFilename');
const editCssBtn = document.getElementById('editCssFilename');
const editJsBtn = document.getElementById('editJsFilename');

/* add gutter elements refs */
const gutter1 = document.getElementById('gutter1');
const gutter2 = document.getElementById('gutter2');
const gutter3 = document.getElementById('gutter3');
const gutter4 = document.getElementById('gutter4');
const gutterH = document.getElementById('gutterH');
const panesEl = document.querySelector('.panes');
const gridEl = document.querySelector('.editor-grid');

// Map to associate kind with its UI elements for easy lookup
// Format: [span element, setter function, getter function, editor element]
const fileRenameMap = {
  html:[htmlFilenameSpan,v=>htmlFileName=v,()=>htmlFileName, htmlEditor],
  css:[cssFilenameSpan,v=>cssFileName=v,()=>cssFileName, cssEditor],
  js:[jsFilenameSpan,v=>jsFileName=v,()=>jsFileName, jsEditor]
};

export function getCurrentProject() {
  return currentProject;
}

export function setCurrentProject(project) {
  currentProject = project;
}

export function getFilenames() {
  return { htmlFileName, cssFileName, jsFileName };
}

export function setFilenames(html, css, js) {
  htmlFileName = html || defaultHtmlFilename;
  cssFileName = css || defaultCssFilename;
  jsFileName = js || defaultJsFilename;
}

export function combineSrcDoc(html, css, js){
  const files = currentProject?.files || {};
  const inlined = (html || '')
    .replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (m, href) => (files[href] ? `<style>${files[href]}</style>` : m))
    .replace(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src) => (files[src] ? `<script>${files[src]}</script>` : m));
  const nav = `<script>(function(){document.addEventListener('click',function(e){var a=e.target&&e.target.closest('a');if(!a)return;var href=a.getAttribute('href')||'';if(!href||href.startsWith('#'))return;var cleaned=href.replace(/^[a-z]+:\\/\\//i,'');var isQuantumPage=/\\.(clos|dafy|taur|cele)$/i.test(cleaned)||/^QTTPS:\\/\\//i.test(href);if(/^https?:/i.test(href)&&!isQuantumPage)return;e.preventDefault();parent.postMessage({type:'qnet:navigate',href:href},'*');});})();<\/script>`;
  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${inlined}${nav}</body><script>${js}</script></html>`;
}

export function schedulePreview(){
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const srcdoc = combineSrcDoc(htmlEditor.value, cssEditor.value, jsEditor.value);
    previewFrame.srcdoc = srcdoc;
  }, previewDebounceMs);
}

export function initEditor() {
  [htmlEditor, cssEditor, jsEditor].forEach(el => el.addEventListener('input', schedulePreview));

  setupVerticalGutter(gutter1, '--c1', '--c2', panesEl, previewFrame);
  setupVerticalGutter(gutter2, '--c2', '--c3', panesEl, previewFrame);
  if (gutter3) setupVerticalGutter(gutter3, '--c3', '--c4', panesEl, previewFrame);
  if (gutter4) setupVerticalGutter(gutter4, '--c4', '--c5', panesEl, previewFrame);
  if (gutterH) setupHorizontalGutter(gutterH, gridEl, previewFrame);

  wirePaneCloseButtons();
  wirePaneSaveButtons();
  wireRenameButtons();
}

export function loadProjectIntoEditor(project) {
  currentProject = project ? { ...project, files: (project.files || {}) } : null;
  htmlFileName = project?.html_filename || defaultHtmlFilename;
  cssFileName = project?.css_filename || defaultCssFilename;
  jsFileName = project?.js_filename || defaultJsFilename;

  htmlEditor.value = project?.html || defaultHTML;
  cssEditor.value = project?.css || defaultCSS;
  jsEditor.value = project?.js || defaultJS;

  schedulePreview();
  refreshFilenamesUI();
}

export function getEditorContent() {
  return {
    html: htmlEditor.value,
    css: cssEditor.value,
    js: jsEditor.value,
    html_filename: htmlFileName,
    css_filename: cssFileName,
    js_filename: jsFileName
  };
}

function setPaneVisible(i, visible){
  const pane = document.querySelector('.pane'+i);
  if(!pane) return;
  pane.style.display = visible ? '' : 'none';
  redistributeColumns();
}

function wirePaneCloseButtons(){
  const closeHtml = document.getElementById('closeHtmlPane');
  const closeCss = document.getElementById('closeCssPane');
  const closeJs = document.getElementById('closeJsPane');
  const close4 = document.getElementById('closePane4');
  const close5 = document.getElementById('closePane5');
  if (closeHtml) closeHtml.addEventListener('click', ()=> setPaneVisible(1,false));
  if (closeCss) closeCss.addEventListener('click', ()=> setPaneVisible(2,false));
  if (closeJs) closeJs.addEventListener('click', ()=> setPaneVisible(3,false));
  if (close4) close4.addEventListener('click', ()=> setPaneVisible(4,false));
  if (close5) close5.addEventListener('click', ()=> setPaneVisible(5,false));
}

function wirePaneSaveButtons(){
  const sH=document.getElementById('saveHtmlPane');
  const sC=document.getElementById('saveCssPane');
  const sJ=document.getElementById('saveJsPane');
  const s4=document.getElementById('savePane4');
  const s5=document.getElementById('savePane5');
  if(sH) sH.onclick=()=>{ const newN=htmlFilenameSpan.textContent.trim(); saveEditedFile(htmlFileName,newN,htmlEditor.value); };
  if(sC) sC.onclick=()=>{ const newN=cssFilenameSpan.textContent.trim(); saveEditedFile(cssFileName,newN,cssEditor.value); };
  if(sJ) sJ.onclick=()=>{ 
    const lbl = jsFilenameSpan?.parentElement; 
    const inp = lbl?.querySelector('.inline-rename-input'); 
    if (inp) { saveEditedFile(jsFileName, inp.value.trim()||jsFileName, jsEditor.value); refreshFilenamesUI(); try{ inp.replaceWith(jsFilenameSpan); }catch(_){} jsEditor.focus({preventScroll:true}); return; }
    const newN=jsFilenameSpan.textContent.trim(); saveEditedFile(jsFileName,newN,jsEditor.value); 
  };
  const saveExtra=(i)=>{ currentProject=currentProject||{}; currentProject.files=currentProject.files||{};
    const span = document.getElementById(`pane${i}Filename`);
    const name = span.textContent.trim();
    const original = span.dataset.original || name;
    const val = document.getElementById(`pane${i}Editor`).value;
    if (original && original !== name && currentProject.files[original]) delete currentProject.files[original];
    if (name === htmlFileName) { htmlEditor.value = val; }
    else if (name === cssFileName) { cssEditor.value = val; }
    else if (name === jsFileName) { jsEditor.value = val; }
    else { currentProject.files[name] = val; }
    span.dataset.original = name;
    refreshFilenamesUI(); schedulePreview();
  };
  if(s4) s4.onclick=()=>saveExtra(4);
  if(s5) s5.onclick=()=>saveExtra(5);
}

function wireRenameButtons(){
  const e4=document.getElementById('editPane4Filename');
  const e5=document.getElementById('editPane5Filename');
  if(e4) e4.onclick=()=>startInlineRenamePane(4);
  if(e5) e5.onclick=()=>startInlineRenamePane(5);
  if(editHtmlBtn) editHtmlBtn.onclick=()=>startInlineRename('html');
  if(editCssBtn) editCssBtn.onclick=()=>startInlineRename('css');
  if(editJsBtn) editJsBtn.onclick=()=>startInlineRename('js');
}

function startInlineRenamePane(i){
  const span=document.getElementById(`pane${i}Filename`); if(!span) return;
  const old=span.textContent.trim(); const input=document.createElement('input');
  input.className='inline-rename-input'; input.value=old; input.maxLength=filenameMaxLength; input.style.width=inlineRenameInputWidthPx+'px';
  
  // Get the editor for the pane
  const editorEl = document.getElementById(`pane${i}Editor`);

  span.replaceWith(input); input.focus();
  const done=()=>{
    const v=input.value.trim(); 
    if(!v||v===old) { 
      try{ if (input.isConnected) input.replaceWith(span); }catch(_){}
      refreshFilenamesUI(); 
      editorEl?.focus({ preventScroll: true }); // Restore focus
      return; 
    }
    const content=document.getElementById(`pane${i}Editor`).value; 
    
    // saveEditedFile handles renaming and content update for files in currentProject.files
    saveEditedFile(old, v, content); 
    
    span.textContent=v; 
    input.replaceWith(span);
    
    editorEl?.focus({ preventScroll: true }); // Restore focus after successful rename/save
  };
  
  const cancel=()=>{ 
    try{ if (input.isConnected) input.replaceWith(span); }catch(_){}
    refreshFilenamesUI(); 
    editorEl?.focus({ preventScroll: true });
  };

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter') { 
      e.preventDefault(); e.stopPropagation();
      done(); 
    } 
    if(e.key==='Escape') {
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener('blur',done);
}

function startInlineRename(kind){
  // Retrieve elements using the map structure
  const [span,setter,curGetter, editorEl]=fileRenameMap[kind]||[]; 
  if(!span) return;
  
  const oldName = curGetter();
  const input=document.createElement('input'); 
  input.className='inline-rename-input'; 
  input.value=oldName; 
  input.maxLength=filenameMaxLength; 
  input.style.width=inlineRenameInputWidthPx+'px';
  
  // Define safeReplace locally or ensure it is accessible if needed
  const safeReplace = (oldNode, newNode) => {
    try{
      if (inlineRenameSafeReplace) {
        if (oldNode.parentNode) {
          if (typeof oldNode.replaceWith === 'function') {
            oldNode.replaceWith(newNode);
          } else {
            oldNode.parentNode.replaceChild(newNode, oldNode);
          }
        } else {
          const container = document.querySelector('.code-pane') || document.body;
          container.appendChild(newNode);
        }
      } else {
        oldNode.replaceWith(newNode);
      }
    }catch(e){
      if (oldNode.parentNode) {
        try{ oldNode.parentNode.replaceChild(newNode, oldNode); }catch(_){}
      } else {
        try{ (document.querySelector('.code-pane')||document.body).appendChild(newNode); }catch(_){}
      }
    }
  };
  
  const parent = span.parentNode;
  if (parent) { parent.insertBefore(input, span.nextSibling); span.style.display = 'none'; }
  input.focus();

  const done=()=>{
    const v=input.value.trim(); 
    
    if(v && v !== oldName){
      // If name changed, update the name variable via setter, and call saveEditedFile 
      // saveEditedFile handles updates to internal variables (htmlFileName, cssFileName, jsFileName)
      const editorContent = editorEl.value; 
      saveEditedFile(oldName, v, editorContent);
    } 
    
    try{ if (input.isConnected) input.remove(); }catch(_){}
    span.style.display = '';
    refreshFilenamesUI();
    // Restore focus to the editor element to prevent view jumping
    editorEl?.focus({ preventScroll: true });
  };
  
  const cancel=()=>{ 
    try{ if (input.isConnected) input.remove(); }catch(_){}
    span.style.display = '';
    editorEl?.focus({ preventScroll: true }); 
  };

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&inlineRenameSaveOnEnter) { 
      e.preventDefault(); e.stopPropagation(); 
      done(); 
    } 
    if(e.key==='Escape') { e.stopPropagation(); cancel(); }
  });
  if(inlineRenameSaveOnBlur) input.addEventListener('blur',done);
}

function saveEditedFile(oldName, newName, content){
  if (oldName === htmlFileName) {
    htmlFileName = newName;
    htmlEditor.value = content;
  } else if (oldName === cssFileName) {
    cssFileName = newName;
    cssEditor.value = content;
  } else if (oldName === jsFileName) {
    jsFileName = newName;
    jsEditor.value = content;
  } else {
    currentProject = currentProject || {};
    currentProject.files = currentProject.files || {};
    if (oldName && oldName !== newName && currentProject.files[oldName]) delete currentProject.files[oldName];
    if (newName === htmlFileName) { htmlEditor.value = content; }
    else if (newName === cssFileName) { cssEditor.value = content; }
    else if (newName === jsFileName) { jsEditor.value = content; }
    else { currentProject.files[newName] = content; }
  }
  refreshFilenamesUI();
  schedulePreview();

  // Ensure any inline rename input is removed and filename spans restored, then focus the editor pane
  try {
    document.querySelectorAll('.inline-rename-input').forEach(inp => {
      const span = document.createElement('span');
      span.className = inp.dataset.replaceClass || '';
      span.textContent = (newName && newName.length) ? newName : inp.value;
      // Safely replace input with a filename span (avoid remove errors)
      if (inp.parentNode) inp.parentNode.replaceChild(span, inp);
    });
  } catch(_) {}
  // Focus appropriate editor and keep pane visible (prevent UI jump)
  if (newName === htmlFileName) { htmlEditor.focus({ preventScroll: true }); setPaneVisible(1, true); }
  else if (newName === cssFileName) { cssEditor.focus({ preventScroll: true }); setPaneVisible(2, true); }
  else if (newName === jsFileName) { jsEditor.focus({ preventScroll: true }); setPaneVisible(3, true); }
}

export function refreshFilenamesUI(){
  if (htmlFilenameSpan) htmlFilenameSpan.textContent = htmlFileName || defaultHtmlFilename;
  if (cssFilenameSpan) cssFilenameSpan.textContent = cssFileName || defaultCssFilename;
  if (jsFilenameSpan) jsFilenameSpan.textContent = jsFileName || defaultJsFilename;
  wireRenameButtons();
}

window.addEventListener('message', (e)=>{
  const d = e.data || {};
  if (d.type === 'qnet:navigate') {
    const fname=String(d.href||'').replace(/^\.\//,'').split('#')[0].split('?')[0]; const files=currentProject?.files||{}; const isMain=fname===(htmlFileName||'index.html');
    const html=isMain?htmlEditor.value:(files[fname]||'');
    if(html){ previewFrame.srcdoc=combineSrcDoc(html, cssEditor.value, jsEditor.value); }
    else {
      const nf=`<div style="font-family:Noto Sans,system-ui;padding:24px"><h1>404 — Page Not Found</h1><p>No page named "${fname}".</p><p><a href="${htmlFileName}">Back to main page</a></p></div>`;
      previewFrame.srcdoc=combineSrcDoc(nf,'body{background:#fff;color:#111}','');
    }
  }
});