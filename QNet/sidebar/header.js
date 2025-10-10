import { getCurrentProject, getFilenames, refreshFilenamesUI } from '../editor.js';
import { openModelSettings } from '../modal.js';
import { loadChat, saveChat, applyUpdates } from '../chat.js';
import { renderVersions } from '../versions.js';
import { ensureResizer } from './initSidebar.js';
import { filenameMaxLength, descriptionMaxLength, descriptionPlaceholder, sidebarFiles } from './constants.js';

export function buildSidebarHeader(selectedFile, filesList){
  const editorSidebar = document.getElementById('editorSidebar'); if (!editorSidebar) return;
  const currentProject = getCurrentProject();

  editorSidebar.innerHTML = `
    <div class="sidebar-header">
      <details id="metaDropdown" open>
        <summary>Meta</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          <input id="domainTitleInput" type="text" maxlength="${filenameMaxLength}" placeholder="Title (e.g. z)" value="${(currentProject?.page_slug||'').split('.')[0] || (currentProject?.name||'').toLowerCase().replace(/\\s+/g,'').replace(/[^a-z0-9-]/g,'').slice(0, filenameMaxLength) }" style="width:100%;height:28px;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:0 8px;font-size:12px;" />
          <select id="domainTldSelect" style="width:100%;height:28px;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:0 8px;font-size:12px;">
              ${['clos','dafy','taur','cele'].map(t=>`<option value="${t}" ${(currentProject?.page_slug||'').endsWith('.'+t)?'selected':''}>.${t}</option>`).join('')}
          </select>
          <textarea id="fileDescInput" maxlength="${descriptionMaxLength}" placeholder="${descriptionPlaceholder}" style="resize:none;width:100%;min-height:80px;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:8px;font-size:12px;">${currentProject?.description || ''}</textarea>
          <div style="display:flex;justify-content:flex-end;">
            <button id="sidebarSaveMetaBtn" class="btn">Save Title & Description</button>
          </div>
        </div>
      </details>
      <details id="filesDropdown" open style="margin-top:8px;">
        <summary>Files (${(filesList || sidebarFiles).length})</summary>
        <div id="sidebarFilesContainer" class="file-list scrollable" style="margin-top:8px;"></div>
      </details>
      <details id="versionsDropdown" open style="margin-top:8px;">
        <summary id="versionsSummary">Versions</summary>
        <div id="versionsContainer" class="chat-versions scrollable" style="display:flex;flex-direction:column;gap:8px;"></div>
      </details>
      <div class="sidebar-chat" style="margin-top:10px;">
        <div class="bot-area" id="botArea" aria-live="polite"></div>
        <div class="user-chat">
          <div class="user-chat-row">
            <textarea id="userChatInput" placeholder="Message..." rows="3" autocomplete="off"></textarea>
            <button id="sendChatBtn" class="btn send-chat" title="Send">➤</button>
          </div>
          <div class="chat-controls">
            <div class="dropup" title="Model selector">
              <select id="modelSelect" class="model-select" aria-label="Select model">
                <optgroup label="Free">
                  <option value="deepseek_r1_0528">DeepSeek: R1 0528</option>
                  <option value="mistral_devstral_small_2505">Mistral: Devstral Small 2505</option>
                  <option value="qwen_qwen2.5_coder_32b_instruct">Qwen: Qwen2.5 Coder 32B Instruct</option>
                  <option value="google_gemini_2_flash_experimental">Google: Gemini 2.0 Flash Experimental</option>
                  <option value="meta_llama_3.1_405b_instruct">Meta: Llama 3.1 405B Instruct</option>
                </optgroup>
                <optgroup label="Premium">
                  <option value="anthropic_claude_3.7_sonnet">Anthropic: Claude 3.7 Sonnet</option>
                  <option value="openai_gpt_4o">OpenAI: GPT-4o</option>
                  <option value="google_gemini_2.5_pro">Google: Gemini 2.5 Pro</option>
                  <option value="xai_grok_code_fast_1" selected>xAI: Grok Code Fast 1</option>
                  <option value="qwen_qwen3_coder_480b_a35b">Qwen: Qwen3 Coder 480B A35B</option>
                </optgroup>
              </select>
            </div>
            <button id="modelSettingsBtn" class="settings-cog" title="Model settings">⚙</button>
          </div>
        </div>
      </div>
    </div>
  `;

  ensureResizer();

  // Files list
  const listEl = document.getElementById('sidebarFilesContainer');
  const filesToShow = filesList || sidebarFiles;
  filesToShow.forEach(f=>{
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<div class="name">${f}</div><div class="actions"><button class="btn outline tiny edit-file" data-file="${f}" title="Edit file">✎</button><button class="btn danger tiny delete-file" data-file="${f}" title="Delete file">🗑</button></div>`;
    listEl.appendChild(item);
  });
  listEl.querySelectorAll('.edit-file').forEach(btn=>{
    btn.addEventListener('click',()=> {
      const event = new CustomEvent('openSidebarFile', { detail: { filename: btn.dataset.file } });
      document.dispatchEvent(event);
    });
  });
  listEl.querySelectorAll('.delete-file').forEach(btn=>{
    btn.addEventListener('click',()=> {
      const event = new CustomEvent('deleteSidebarFile', { detail: { filename: btn.dataset.file } });
      document.dispatchEvent(event);
    });
  });

  document.getElementById('sidebarSaveMetaBtn')?.addEventListener('click', saveTitleAndDescription);

  // Chat wiring
  const sendBtn = document.getElementById('sendChatBtn');
  const input = document.getElementById('userChatInput');
  const botArea = document.getElementById('botArea');
  let chatHistory = loadChat();
  chatHistory.forEach(m => {
    const role = (m.role === 'user') ? 'user' : 'bot';
    const txt = m.content || m.text || '';
    if (txt) {
      const d = document.createElement('div');
      d.className = 'chat-msg ' + (role === 'user' ? 'chat-user' : 'chat-bot');
      d.textContent = txt;
      botArea.appendChild(d);
    }
  });
  botArea.scrollTop = botArea.scrollHeight;

  const versionsEl = document.getElementById('versionsContainer');
  renderVersions(versionsEl);

  function appendMessage(who, text){
    const m = document.createElement('div');
    m.className = 'chat-msg ' + (who === 'user' ? 'chat-user' : 'chat-bot');
    m.textContent = text;
    botArea.appendChild(m);
    botArea.scrollTop = botArea.scrollHeight;
    return m;
  }

  sendBtn?.addEventListener('click', async ()=> {
    const txt = (input.value||'').trim(); if(!txt) return;
    appendMessage('user', txt); input.value = '';
    chatHistory.push({ role:'user', content: txt }); saveChat(chatHistory);
    const apiKey = localStorage.getItem('openrouter.apiKey') || '';
    if(!apiKey){ appendMessage('bot','Set your OpenRouter API key (⚙).'); document.getElementById('modelSettingsBtn')?.click(); return; }
    const modelSelect = document.getElementById('modelSelect'); const model = (localStorage.getItem('openrouter.model') || modelSelect?.value || 'xai_grok_code_fast_1');
    localStorage.setItem('openrouter.model', model);
    const placeholder = appendMessage('bot','…');
    try{
      const fs = getFilenames(); const h=document.getElementById('htmlEditor'), c=document.getElementById('cssEditor'), j=document.getElementById('jsEditor');
      const sys = "You are a code editor assistant. Edit the user's project files. Respond with a single JSON object: {\"updates\":[{\"filename\":\"...\",\"content\":\"(full new file content)\"}]} — no prose, no code fences unless using ```json with only that JSON.";
      const ctx = `FILES:\n${fs.htmlFileName}:\n${h.value}\n---\n${fs.cssFileName}:\n${c.value}\n---\n${fs.jsFileName}:\n${j.value}\n---`;
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions',{ method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'HTTP-Referer': location.origin,'X-Title':'QNet' }, body: JSON.stringify({ model, messages: [{role:'system',content:sys}, ...chatHistory, {role:'user', content:`Instruction:\n${txt}\n\nProject context:\n${ctx}`}] }) });
      if(!resp.ok) throw new Error((await resp.text())||'Request failed');
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '';
      placeholder.textContent = content || '(no output)';
      const m = content.match(/```json\\s*([\\s\\S]*?)```/i); const js = m ? m[1] : content;
      let upd=null; try{ upd = JSON.parse(js); }catch(_){}
      if(upd && Array.isArray(upd.updates) && upd.updates.length){ applyUpdates(upd.updates); placeholder.textContent = `Applied updates: ${upd.updates.map(u=>u.filename||u.file).join(', ')}`; chatHistory.push({ role:'assistant', content: placeholder.textContent }); saveChat(chatHistory); }
      else { chatHistory.push({ role:'assistant', content: content }); saveChat(chatHistory); }
    }catch(e){
      placeholder.textContent = `Error: ${e.message||e}`;
      chatHistory.push({ role:'assistant', content: placeholder.textContent }); saveChat(chatHistory);
    }
  });

  input?.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); sendBtn.click(); } if(e.key === 'Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); sendBtn.click(); } });

  const modelSelect = document.getElementById('modelSelect');
  const modelSettingsBtn = document.getElementById('modelSettingsBtn');
  if (modelSelect) {
    const saved = localStorage.getItem('openrouter.model'); if(saved) modelSelect.value = saved; else modelSelect.value = 'xai_grok_code_fast_1';
    modelSelect.addEventListener('change', ()=> {
      const sel = modelSelect.value; localStorage.setItem('openrouter.model', sel);
      const note = document.createElement('div');
      note.className = 'chat-msg chat-bot';
      note.textContent = `Model set to: ${sel}`;
      botArea.appendChild(note);
      botArea.scrollTop = botArea.scrollHeight;
    });
    (async ()=>{ try{ const res = await fetch('https://openrouter.ai/api/v1/models'); const json = await res.json(); const models = (json?.data||[]).filter(m=>m?.id); if(models.length){ modelSelect.innerHTML = models.map(m=>`<option value="${m.id}">${m.name||m.id}</option>`).join(''); const sv = localStorage.getItem('openrouter.model') || 'xai_grok_code_fast_1'; modelSelect.value = sv; } }catch(_){ /* keep defaults on failure */ } })();
  }
  if (modelSettingsBtn) modelSettingsBtn.addEventListener('click', ()=> openModelSettings());

  document.addEventListener('restoreVersion', (e) => {
    const idx = String(e?.detail?.index);
    if (typeof idx === 'undefined') return;
    document.querySelectorAll('.version-item.is-active').forEach(el => el.classList.remove('is-active'));
    const sel = document.querySelector(`.version-item[data-index="${idx}"]`);
    if (sel) sel.classList.add('is-active');
  });
}

function saveTitleAndDescription(){
  const projectNameInput = document.getElementById('projectNameInput');
  const name = (projectNameInput.value || '').trim().slice(0, 86);
  projectNameInput.value = name;
  const description = (document.getElementById('fileDescInput')?.value || '').slice(0, descriptionMaxLength);
  const title = (document.getElementById('domainTitleInput')?.value || '').toLowerCase().trim().replace(/\\s+/g,'').replace(/[^a-z0-9-]/g,'');
  const tld = (document.getElementById('domainTldSelect')?.value || 'clos').trim();
  const slug = title ? `${title}.${tld}` : '';
  const event = new CustomEvent('saveTitleAndDescription', { detail: { name, description, slug } });
  document.dispatchEvent(event);
}

export function rebuildSidebarForProject() {
  const currentProject = getCurrentProject();
  const { htmlFileName, cssFileName, jsFileName } = getFilenames?.() || {};
  const base = [htmlFileName, cssFileName, jsFileName, "README.md"].filter(Boolean);
  const extras = Object.keys(currentProject?.files || {});
  const all = Array.from(new Set([...base, ...extras]));
  buildSidebarHeader(null, all);
  refreshFilenamesUI();
}