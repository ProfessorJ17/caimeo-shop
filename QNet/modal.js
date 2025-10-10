export function openModelSettings(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  const apiKey = localStorage.getItem('openrouter.apiKey') || '';
  
  const settings = getEnhanceSettings();

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <h3>OpenRouter Settings</h3>
    <div class="row"><label for="or-key">API key</label><input id="or-key" type="password" placeholder="Enter your OpenRouter API key" value="${apiKey}"></div>
    <div class="row" style="margin-top:8px;"><label for="or-model">Model</label>
      <select id="or-model" style="width:100%;height:34px;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:4px 8px;font-size:13px;">
        <optgroup label="Free">
          <option value="deepseek_r1_0528">DeepSeek: R1 0528 (free)</option>
          <option value="mistral_devstral_small_2505">Mistral: Devstral Small 2505 (free)</option>
          <option value="qwen_qwen2.5_coder_32b_instruct">Qwen 2.5 Coder (free)</option>
          <option value="google_gemini_2_flash_experimental">Google Gemini 2.0 Flash Experimental</option>
          <option value="meta_llama_3.1_405b_instruct">Meta Llama 3.1 405B</option>
        </optgroup>
        <optgroup label="Premium">
          <option value="anthropic_claude_3.7_sonnet">Anthropic Claude 3.7 Sonnet (premium)</option>
          <option value="openai_gpt_4o">OpenAI GPT-4o (premium)</option>
          <option value="google_gemini_2.5_pro">Google Gemini 2.5 Pro</option>
          <option value="xai_grok_code_fast_1">xAI Grok Code Fast 1</option>
          <option value="qwen_qwen3_coder_480b_a35b">Qwen 3 Coder 480B A35B</option>
        </optgroup>
      </select>
    </div>
    
    <h4 style="margin:16px 0 8px; font-size:14px; color:#fff;">AI Enhancement Tuning</h4>
    <div class="tuning">
      <label>Emojis: <span id="emojiVal">${settings.emojis}</span>
        <input id="emojiCount" type="range" min="1" max="6" step="1" value="${settings.emojis}">
      </label>
      <label>Sentences: <span id="sentenceVal">${settings.sentences}</span>
        <input id="sentenceCount" type="range" min="1" max="3" step="1" value="${settings.sentences}">
      </label>
      <label>Hashtags: <span id="tagVal">${settings.hashtags}</span>
        <input id="tagCount" type="range" min="1" max="25" step="1" value="${settings.hashtags}">
      </label>
    </div>

    <div class="actions">
      <button id="ms-cancel" class="btn outline">Cancel</button>
      <button id="ms-save" class="btn">Save</button>
    </div>`;
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  // Set default model value based on localStorage or default
  const modelSelect = wrap.querySelector('#or-model');
  const savedModel = localStorage.getItem('openrouter.model');
  if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
    modelSelect.value = savedModel;
  } else {
    modelSelect.value = 'xai_grok_code_fast_1'; // Grok 4 fast as default (as requested previously)
  }

  // Range slider event listeners for live update
  const emojiInput = wrap.querySelector('#emojiCount');
  const sentenceInput = wrap.querySelector('#sentenceCount');
  const tagInput = wrap.querySelector('#tagCount');
  const emojiVal = wrap.querySelector('#emojiVal');
  const sentenceVal = wrap.querySelector('#sentenceVal');
  const tagVal = wrap.querySelector('#tagVal');

  emojiInput?.addEventListener('input', () => emojiVal.textContent = emojiInput.value);
  sentenceInput?.addEventListener('input', () => sentenceVal.textContent = sentenceInput.value);
  tagInput?.addEventListener('input', () => tagVal.textContent = tagInput.value);

  // attempt to fetch live models to enrich the select (non-blocking)
  (async () => {
    try {
      const key = localStorage.getItem('openrouter.apiKey') || apiKey;
      if (!key) return;
      const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) return;
      const json = await res.json();
      const sel = wrap.querySelector('#or-model');
      if (!sel) return;
      const ids = (json?.data || []).filter(m=>m?.id).map(m=>({ id: m.id, name: m.name || m.id, premium: m.per_token_cost_usd > 0 }));
      
      const freeGroup = document.createElement('optgroup'); freeGroup.label = "Free";
      const premiumGroup = document.createElement('optgroup'); premiumGroup.label = "Premium";
      
      const defaultOptions = Array.from(sel.options).map(o => ({
        id: o.value,
        name: o.textContent.replace(/\s\(.*\)/, '').trim(),
        premium: o.parentNode.label === 'Premium'
      }));
      const existing = new Set(defaultOptions.map(o => o.id));

      // Clear existing options before repopulating
      sel.innerHTML = '';

      const allModels = [...defaultOptions, ...ids.filter(m => !existing.has(m.id))];
      
      // Sort models, prioritize Grok fast 1 if present
      allModels.sort((a, b) => {
          if (a.id === 'xai_grok_code_fast_1') return -1;
          if (b.id === 'xai_grok_code_fast_1') return 1;
          return a.id.localeCompare(b.id);
      });

      // Repopulate groups
      allModels.forEach(m => {
        const group = m.premium ? premiumGroup : freeGroup;
        const opt = document.createElement('option'); 
        opt.value = m.id; 
        opt.textContent = m.name;
        group.appendChild(opt);
      });

      sel.appendChild(freeGroup);
      sel.appendChild(premiumGroup);

      // Restore selected value, defaulting to Grok Code Fast 1
      const sv = localStorage.getItem('openrouter.model') || 'xai_grok_code_fast_1';
      if (sel.querySelector(`option[value="${sv}"]`)) {
        sel.value = sv;
      } else if (sel.querySelector(`option[value="xai_grok_code_fast_1"]`)) {
        sel.value = 'xai_grok_code_fast_1';
      }
      
    } catch(_) { 
      // Ensure default values are restored if API call fails
      const sv = localStorage.getItem('openrouter.model') || 'xai_grok_code_fast_1';
      if (modelSelect.querySelector(`option[value="${sv}"]`)) modelSelect.value = sv;
    }
  })();

  const keyInput = wrap.querySelector('#or-key');

  wrap.querySelector('#ms-cancel').addEventListener('click', close);
  wrap.querySelector('#ms-save').addEventListener('click', ()=> {
    const k = (keyInput.value || '').trim();
    localStorage.setItem('openrouter.apiKey', k);
    
    const settingsToSave = {
      emojis: emojiInput.value,
      sentences: sentenceInput.value,
      hashtags: tagInput.value,
    };
    saveEnhanceSettings(settingsToSave);

    const sel = wrap.querySelector('#or-model');
    if (sel) localStorage.setItem('openrouter.model', sel.value || 'xai_grok_code_fast_1');
    document.dispatchEvent(new CustomEvent('openrouterApiKeyUpdated', { detail: { hasKey: !!k } }));
    close();
  });

  function onKey(e){ if(e.key==='Escape') close(); }
  document.addEventListener('keydown', onKey);

  function close(){
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
}

function getEnhanceSettings() {
  return {
    emojis: localStorage.getItem('ai.enhance.emojis') || '2',
    sentences: localStorage.getItem('ai.enhance.sentences') || '2',
    hashtags: localStorage.getItem('ai.enhance.hashtags') || '8',
    grokModel: localStorage.getItem('openrouter.model') || 'xai_grok_code_fast_1'
  };
}

function saveEnhanceSettings(settings) {
  localStorage.setItem('ai.enhance.emojis', settings.emojis);
  localStorage.setItem('ai.enhance.sentences', settings.sentences);
  localStorage.setItem('ai.enhance.hashtags', settings.hashtags);
}

export function getAiEnhanceCost() {
  return 0; // Cost per enhancement in QBC — free now
}

export { getEnhanceSettings };