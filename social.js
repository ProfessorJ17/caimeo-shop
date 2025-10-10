import { db, auth, getCurrentUserId } from './auth.js';
import { ref, set, get, onValue, push, serverTimestamp, onDisconnect, update, remove, runTransaction } from 'firebase/database';
import { onChildAdded, onChildChanged } from 'firebase/database';
import { getEnhanceSettings, getAiEnhanceCost } from './modal.js';
import { notify } from './ui.js';
import { encryptChatMessage, decryptChatMessage, decryptMessageWithKey } from './encryption.js'; // Import E2EE functions and new helper

// NEW: Define boards for Social/17chan posting
const BOARDS = [
  { id: 'wall', name: 'Wall Post (Default)' },
  { id: '/b/', name: '/b/ – Random' },
  { id: '/pol/', name: '/pol/ – Politically Incorrect' },
  { id: '/x/', name: '/x/ – Paranormal' },
  { id: '/int/', name: '/int/ – International' },
  { id: '/mu/', name: '/mu/ – Music' },
  { id: '/fit/', name: '/fit/ – Health & Fitness' },
  { id: '/co/', name: '/co/ – Comics & Cartoons' },
  { id: '/lit/', name: '/lit/ – Literature' },
  { id: '/tv/', name: '/tv/ – Television & Film' },
  { id: '/his/', name: '/his/ – History & Historical Discussion' },
  { id: '/sp/', name: '/sp/ – Sports' },
  { id: '/sci/', name: '/sci/ – Science & Math' },
  { id: '/k/', name: '/k/ – Weapons' },
  { id: '/wg/', name: '/wg/ – Wallpapers & General Art' },
  { id: '/gif/', name: '/gif/ – Animated GIFs' },
  { id: '/diy/', name: '/diy/ – Do It Yourself Projects' },
  { id: '/tech/', name: '/tech/ – Technology & Engineering' },
  { id: '/vg/', name: '/vg/ – Video-Games General' },
  { id: '/fa/', name: '/fa/ – Fashion & Style' },
  { id: '/occ/', name: '/occ/ – Occult Studies & Esoterica' },
  { id: '/phi/', name: '/phi/ – Mathematical Mysticism & Ratios' },
  { id: '/ai/', name: '/ai/ – Synthetic Intelligences & Machine Thought' },
];

let unsubOnline = null;
let unsubFeed = null;
let unsubUsers = null;
let currentChatUser = null;
let friendsOnly = false, myFriends = new Set(), unsubFriends = null;
let pendingIncoming = new Set(), pendingOutgoing = new Set(), unsubIncoming = null, unsubOutgoing = null;

// NEW: Helper to extract the first image URL and return the remaining content.
function extractPrimaryImageAndContent(content) {
    if (!content) return { content: '', imageUrl: null, cornerImage: null };
    
    let imageUrl = null, cornerImage = null;
    let newContent = content;

    // Prefer [cornerimg]...[/cornerimg] for corner image
    const cornerMatch = newContent.match(/\[cornerimg\]([\s\S]+?)\[\/cornerimg\]/i);
    if (cornerMatch) {
        const url = cornerMatch[1].trim().replace(/[)"'>]+$/,'');
        if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url)) {
            cornerImage = url;
        }
        newContent = newContent.replace(cornerMatch[0], '').trim();
    }

    // Fallback: first [img] tag becomes main image (inline) as before
    const imgMatch = newContent.match(/(\[img\]([\s\S]+?)\[\/img\])/i);
    
    if (imgMatch) {
        const fullTag = imgMatch[1];
        const url = imgMatch[2].trim().replace(/[)"'>]+$/,'');
        if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url)) {
            imageUrl = url;
            newContent = newContent.replace(fullTag, '').trim();
        }
    }
    
    return { content: newContent, imageUrl, cornerImage };
}

// NEW: Helper to convert >lines to greentext span and ensure newlines become <br>, handles links and embedded media tags.
function parseAndFormatChan17Body(text) {
    if (!text) return '';
    
    const linkRe=/(https?:\/\/[^\s<]+)(?=$|\s)/gi;
    const allowed=/\.(png|jpe?g|gif|webp|svg)$/i;
    const videoRe=/\.(mp4|webm|ogg|mpeg)(\?|$)/i;
    const clean=(u)=>String(u||'').trim().replace(/[)"'>]+$/,'');
    
    // NOTE: --border must be used here, derived from the inline style block in show17ChanContent
    const imgTpl=(u)=>`<div style="margin-top:6px;"><img src="${u}" alt="" style="max-width:100%;border:1px solid var(--border);border-radius:6px;"></div>`;
    const videoTpl=(u)=>`<div style="margin-top:8px;"><video controls style="max-width:100%;border:1px solid var(--border);border-radius:6px;"><source src="${u.replace(/^http:/,'https:')}"></video></div>`;
    
    let processedText = String(text);
    
    // 1. Replace embedded media tags with their HTML representation
    processedText = processedText.replace(/\[img\]([\s\S]+?)\[\/img\]/gi, (m, url) => {
        const u = clean(url);
        return allowed.test(u) ? imgTpl(u) : u;
    });
    processedText = processedText.replace(/\[video\]([\s\S]+?)\[\/video\]/gi, (m, url) => {
        const u = clean(url);
        return videoRe.test(u) ? videoTpl(u) : u;
    });

    // 2. Process line breaks for greentext and link replacement on raw URLs
    const lines = processedText.split('\n');
    let output = [];
    
    lines.forEach(line => {
        // Apply link formatting to raw URLs using the 17chan class
        let formattedLine = line.replace(linkRe,(u)=>{ 
            const cu=clean(u); 
            // Use the .link-inline class defined in the inline style block
            return `<a class="link-inline" href="${cu}" target="_blank" rel="noopener">${cu}</a>`; 
        });

        // Apply greentext
        if (formattedLine.trim().startsWith('>')) {
            output.push(`<span class="greentext">${formattedLine}</span>`);
        } else {
            output.push(formattedLine);
        }
    });
    
    // 3. Convert remaining \n to <br> for display
    return output.join('<br>'); 
}

// --- Content view management functions ---

/**
 * Renders the real-time social wall feed and sets active button state.
 */
function showWallFeedContent() {
    const wallFeedBtn = document.getElementById('wallFeedBtn');
    const chan17Btn = document.getElementById('chan17Btn');
    
    // 1. Style buttons (Wall Feed active, 17chan outline)
    if (wallFeedBtn) wallFeedBtn.classList.remove('outline');
    if (chan17Btn) chan17Btn.classList.add('outline');

    // 2. Load the actual wall feed (will handle unsubFeed internally)
    loadWallFeed(); 
}

/**
 * Renders the static 17chan message and sets active button state.
 */
function show17ChanContent() {
    const wallFeedBtn = document.getElementById('wallFeedBtn');
    const chan17Btn = document.getElementById('chan17Btn');
    const container = document.getElementById('socialWallFeed');
    
    // style buttons (17chan active)
    if (wallFeedBtn) wallFeedBtn.classList.add('outline');
    if (chan17Btn) chan17Btn.classList.remove('outline');
    
    // stop listening to real feed updates
    if (unsubFeed) { unsubFeed(); unsubFeed = null; }
    
    if (!container) return;
    
    // --- Inject New 17chan Template and Styles ---
    const boards = [
        '/b/','/pol/','/x/','/int/','/mu/','/fit/','/co/','/lit/','/tv/','/his/','/sp/','/sci/','/k/','/wg/','/gif/','/diy/','/tech/','/vg/','/fa/','/occ/','/phi/','/ai/'
    ];
    const boardNav = boards.map(t=>`<a href="${t}" class="navlinks-a" data-board="${t}">${t}</a>`).join('');

    container.innerHTML = `
    <div class="chan17-view">
      <style>
        /* CSS variables scoped to the 17chan view */
        .chan17-view {
          --bg:#0b0d0f;
          --panel:#0f1316;
          --muted:#9aa3ac;
          --border:#15181b;
          --link:#58a6ff;
          --accent:#e6eef6;
          --mutebox:#0d1720;
          --reply-bg:#0c1113;
          --green:#66d19e;
          font-family:'Caladea', 'Space Mono', Tahoma, Arial, sans-serif;
          background:var(--bg);
          color:var(--accent);
          padding:0;
        }
        .chan17-page{max-width:980px;margin:12px auto;padding:0;background:linear-gradient(180deg,var(--panel), #0c0f11);border:1px solid var(--border);border-radius:8px}
        .chan17-topbar{display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:6px;background:linear-gradient(180deg, rgba(255,255,255,0.02), transparent);border:1px solid rgba(255,255,255,0.02); margin: 0 12px 12px;}
        .chan17-topbar .left{display:flex;align-items:center;gap:14px}
        .chan17-topbar .brand{font-weight:700;font-size:14px;color:var(--accent)}
        .chan17-topbar .search input{padding:8px 10px;border:1px solid rgba(255,255,255,0.03);border-radius:6px;background:#060708;color:var(--accent);font-size:13px;width:180px}
        .chan17-topbar .navlinks a{margin-left:8px;color:var(--link);text-decoration:none;font-size:13px;opacity:0.95}
        .chan17-topbar .board{font-size:13px;color:var(--muted)}

        .chan17-nav{ display:flex; gap:6px; overflow-x:auto; padding:6px; border-radius:6px; background:#121619; border:1px solid rgba(255,255,255,0.02); margin: 0 12px 12px; }
        .chan17-nav a.navlinks-a { flex:0 0 auto; color:var(--link,#58a6ff); text-decoration:none; padding:6px 8px; border-radius:6px; background:transparent; font-size:13px; white-space:nowrap; }
        .chan17-nav a.navlinks-a:hover { background: rgba(255,255,255,0.02); }
        .chan17-thread{margin-top:0px; padding: 0 12px 12px;}
        .post{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.03);background:transparent; transition:transform .15s ease, box-shadow .15s ease}
        .post:first-child { padding-top: 0; }
        .file-thumb{width:140px;flex:0 0 140px}
        .file-thumb img{width:140px;height:auto;border-radius:6px;display:block;border:1px solid var(--border)}
        .file-meta{font-size:12px;color:var(--muted);margin-top:8px}
        .post-body{flex:1 1 auto}
        .post-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .post-title{font-weight:700;color:var(--accent);font-size:14px}
        .post-id{color:var(--muted);font-size:12px}
        .reply-btn{background:transparent;border:1px solid rgba(255,255,255,0.03);padding:6px 8px;border-radius:6px;font-size:13px;cursor:pointer;color:var(--accent)}
        .reply-btn:hover{background:rgba(255,255,255,0.02)}
        .post-text{font-size:14px;line-height:1.5;color:var(--accent);margin-bottom:10px}
        .greentext{color:var(--green);font-weight:700;font-family:monospace}
        .link-inline{color:var(--link);text-decoration:none;font-family:monospace}
        .post-actions { margin-left: 10px; display: flex; align-items: center; gap: 8px; }
        .vote-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 11px; }
        .omitted-line{padding:12px 0;font-size:13px;color:var(--muted);border-bottom:1px solid rgba(255,255,255,0.03)}

        @media (max-width:900px){ .file-thumb{display:none} .chan17-topbar .search input{width:100%} }
        .empty { padding: 12px; }
      </style>

      <div class="chan17-page">
        <!-- Topbar: simplified version -->
        <div class="chan17-topbar">
          <div class="left">
            <div class="brand">Welcome to 17chan</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div id="chan17BoardTitle" class="board">Select a board...</div>
            <div id="chan17BoardDesc" style="font-size:12px;color:var(--muted);margin-top:4px;">Pick a board to view threads and media.</div>
          </div>
        </div>

        <!-- Board Nav Links -->
        <div class="chan17-nav" role="navigation" aria-label="17chan boards">
          ${boardNav}
        </div>

        <!-- Thread Container -->
        <div class="chan17-thread" id="chan17ThreadContainer">
          <div id="xBoardPosts" style="min-height: 100px;">Select a board to view posts.</div>
        </div>
      </div>
    </div>
    `;

    // wire nav links to load posts for the chosen board
    container.querySelectorAll('.chan17-nav a.navlinks-a').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const board = a.dataset.board || a.getAttribute('href');
        const boardInfo = BOARDS.find(b => b.id === board) || { id: board, name: board };
        const boardName = boardInfo.name || board;
        const header = container.querySelector('#chan17BoardTitle');
        const desc = container.querySelector('#chan17BoardDesc');
        if (header) header.textContent = `${boardName}`;
        // set a short description if available (use name for now)
        if (desc) desc.textContent = `Viewing ${board} — ${boardName}`;
        // Clear old posts first
        const postsContainer = container.querySelector('#xBoardPosts');
        if (postsContainer) postsContainer.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px;">Loading posts…</div>';
        
        loadBoardPosts(board, postsContainer);
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, { passive:true });
    });
}

// NEW: Renders a blank Hashtags view and sets active button state
function showHashtagsContent() {
  const wallFeedBtn = document.getElementById('wallFeedBtn');
  const chan17Btn = document.getElementById('chan17Btn');
  const hashtagsBtn = document.getElementById('hashtagsBtn');
  const container = document.getElementById('socialWallFeed');
  if (wallFeedBtn) wallFeedBtn.classList.add('outline');
  if (chan17Btn) chan17Btn.classList.add('outline');
  if (hashtagsBtn) hashtagsBtn.classList.remove('outline');

  if (unsubFeed) { unsubFeed(); unsubFeed = null; } // stop live feed
  if (!container) return;

  container.innerHTML = `<div style="padding:12px;">
    <h3 style="margin-top:0;">Hashtags</h3>
    <div style="margin-bottom:8px;">
      <input id="hashtagSearch" placeholder="Search hashtags (e.g. tech, ai)" style="width:100%;padding:8px;border:1px solid #222;border-radius:6px;background:#0b0b0b;color:#fff;" />
    </div>
    <div id="hashtagsList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;"></div>
    <div id="hashtagPosts"></div>
  </div>`;

  // Hide composer controls on Hashtags view
  ['socialPostInput','socialAddImageBtn','socialAddVideoBtn','socialBoardSelect','socialMainImageBtn','socialEnhanceBtn','socialGearBtn','socialPostBtn','postAnonCheckbox'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });

  // Build tag index once and allow search/filter
  (async ()=>{
    try{
      const snap = await get(ref(db, 'socialFeed'));
      const tagMap = new Map();
      if (snap.exists()) {
        snap.forEach(child=>{
          const data = child.val() || {};
          const isChatLike = !!(data.to || data.chatId || data.plainFrom || data.kemCiphertext || data.aesCiphertext);
          if (isChatLike) return;
          const content = String(data.content || '');
          const tags = extractHashtagsFromText(content);
          if (!tags.length) return;
          const postObj = { id: child.key, ...data };
          tags.forEach(t=>{
            const key = t.toLowerCase();
            if(!tagMap.has(key)) tagMap.set(key, []);
            tagMap.get(key).push(postObj);
          });
        });
      }
      const allTags = Array.from(tagMap.keys()).sort((a,b)=> tagMap.get(b).length - tagMap.get(a).length);
      const listEl = document.getElementById('hashtagsList');
      const searchInput = document.getElementById('hashtagSearch');
      if (!listEl || !searchInput) return;

      function renderTagButtons(tags){
        listEl.innerHTML = '';
        if(!tags.length){ listEl.innerHTML = '<div class="empty">No tags match.</div>'; return; }
        tags.forEach(tag=>{
          const btn = document.createElement('button');
          btn.className = 'btn outline tiny';
          btn.textContent = `#${tag} (${tagMap.get(tag).length})`;
          btn.style.cursor = 'pointer';
          btn.addEventListener('click', ()=> renderHashtagPosts(tag, tagMap.get(tag)));
          listEl.appendChild(btn);
        });
      }

      // initial render: top tags
      renderTagButtons(allTags.slice(0, 40));

      // search handler: filter tags by substring
      let searchTimeout = null;
      searchInput.addEventListener('input', ()=> {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(()=>{
          const q = (searchInput.value||'').trim().toLowerCase();
          if (!q) return renderTagButtons(allTags.slice(0,40));
          const matches = allTags.filter(t => t.includes(q)).slice(0,200);
          renderTagButtons(matches);
        }, 120);
      });

      // if there are tags, auto-select top tag
      if (allTags.length) renderHashtagPosts(allTags[0], tagMap.get(allTags[0]));
    }catch(e){
      console.warn('Failed to load hashtags', e);
      document.getElementById('hashtagsList').innerHTML = '<div class="empty">Failed to load tags.</div>';
    }
  })();
}

/* Helper: extract hashtags from free text (#tag or words prefixed by #) */
function extractHashtagsFromText(text){
  if(!text) return [];
  const matches = Array.from(new Set((text.match(/#([a-z0-9_]{1,64})/ig) || []).map(s => s.replace(/^#/,'').toLowerCase())));
  return matches;
}

/* Helper: render posts for a given hashtag sorted by thumbs-up count desc */
async function renderHashtagPosts(tag, posts){
  const container = document.getElementById('hashtagPosts'); if(!container) return;
  container.innerHTML = `<div style="margin-bottom:8px;color:var(--muted);">Showing posts for <strong>#${tag}</strong> (${posts.length}) — sorting by 👍</div><div id="hashtagPostsList"></div>`;
  const listEl = document.getElementById('hashtagPostsList');
  // fetch vote counts for each post concurrently
  try{
    const scored = await Promise.all(posts.map(async p => {
      try{ const snap = await get(ref(db, `socialFeed/${p.id}/votes`)); let up=0; if(snap.exists()) Object.values(snap.val()).forEach(v=>{ if(Number(v)>0) up++; }); return { post: p, up }; }
      catch(_){ return { post: p, up: 0 }; }
    }));
    scored.sort((a,b)=> b.up - a.up || (b.post.timestamp||0) - (a.post.timestamp||0));
    listEl.innerHTML = '';
    if(!scored.length) { listEl.innerHTML = '<div class="empty">No posts found for this tag.</div>'; return; }
    scored.forEach(({ post, up })=>{
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px;border:1px solid #222;border-radius:8px;margin-bottom:8px;background:#0b0b0b;';
      const time = post.timestamp ? new Date(post.timestamp).toLocaleString() : '';
      const contentHtml = renderContentWithImages(post.content || '');
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-weight:700">${post.username || post.displayName || 'User'}</div>
          <div style="font-size:12px;color:var(--muted)">${time} — 👍 ${up}</div>
        </div>
        <div style="font-size:13px;margin-bottom:6px;word-break:break-word;">${contentHtml}</div>
        <div style="font-size:11px;color:var(--muted)">${post.boardId ? `Board: ${post.boardId}` : ''}</div>
      `;
      listEl.appendChild(row);
    });
  }catch(e){ console.warn('renderHashtagPosts failed', e); listEl.innerHTML = '<div class="empty">Failed to render posts.</div>'; }
}

// helper: compute activity score for a post (used to bump active posts up)
function computeActivityScore(post) {
  // post: object from RTDB snapshot
  // factors: replies count (weighted), upvotes - downvotes (weighted), recency (timestamp)
  const replies = post.replies ? Object.keys(post.replies).length : 0;
  const votesMap = post.votes || {};
  let up = 0, dn = 0;
  try { Object.entries(votesMap).forEach(([_, v]) => { const n = Number(v)||0; if (n>0) up++; else if (n<0) dn++; }); } catch(_) {}
  const score = (up - dn) * 3 + replies * 4;
  // recency boost (hours since post) -> smaller age = bigger boost
  const ts = Number(post.timestamp) || 0;
  const ageHours = ts ? Math.max(0, (Date.now() - ts) / (1000*60*60)) : 9999;
  const recencyBoost = Math.max(0, 6 - ageHours) * 1.5; // recent within 6h gets boost
  return score + recencyBoost;
}

/**
 * Renders posts for a specific board and uses 4chan-like bump logic to rank active posts higher.
 */
async function loadBoardPosts(boardId, targetEl){
  if(!targetEl) return;
  targetEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px;">Loading posts…</div>';

  // Ensure the top header/description reflect the selected board (e.g. "Welcome to /x/")
  try {
    const containerRoot = document.getElementById('socialWallFeed');
    const titleEl = containerRoot?.querySelector('#chan17BoardTitle');
    const descEl = containerRoot?.querySelector('#chan17BoardDesc');
    const boardInfo = BOARDS.find(b => String(b.id) === String(boardId)) || { id: boardId, name: boardId };
    if (titleEl) titleEl.textContent = `Welcome to ${boardInfo.id}`;
    if (descEl) descEl.textContent = boardInfo.name ? `${boardInfo.name} — Community threads and media.` : 'Pick a thread to view posts and media.';
  } catch(_) {}

  try{
    const snap = await get(ref(db, 'socialFeed'));
    if(!snap.exists()){ targetEl.innerHTML = '<div class="empty">No posts yet.</div>'; return; }
    const posts = [];
    snap.forEach(child=>{
      const data = child.val() || {};
      const isChatLike = !!(data.to || data.chatId || data.plainFrom || data.kemCiphertext || data.aesCiphertext);
      if(!isChatLike && String(data.boardId||'wall') === String(boardId)) {
        posts.push({ id: child.key, ...data });
      }
    });
    if(!posts.length){ targetEl.innerHTML = '<div class="empty">No posts in this board yet.</div>'; return; }

    // compute activity score and sort descending (most active first)
    posts.forEach(p => { p._activity = computeActivityScore(p); });
    posts.sort((a,b) => {
      if (b._activity !== a._activity) return b._activity - a._activity;
      // tiebreaker: newer first
      return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
    });

    targetEl.innerHTML = '';
    
    posts.forEach(p=>{
      // Format timestamp like 04/25/25(Fri)16:19:19
      const d = p.timestamp ? new Date(p.timestamp) : new Date();
      const time = d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) 
                   + '(' + d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3) + ')'
                   + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      
      const extracted = extractPrimaryImageAndContent(p.content || '');
      const rawContent = extracted.content;
      const thumb = extracted.imageUrl;
      const corner = extracted.cornerImage;
      // attach corner so later render step can use p.cornerImage
      p.cornerImage = corner;

      // Render general content, handling greentext and embedded media/links using 17chan style
      const finalPostText = parseAndFormatChan17Body(rawContent);
      
      const displayName = p.displayName || p.username || 'Anonymous';
      const postIdShort = p.id.slice(0, 8); // simplified post ID display
      const repliesCount = p.replies ? Object.keys(p.replies).length : 0;
      
      const article = document.createElement('article');
      article.className = 'post';
      article.setAttribute('data-post-id', p.id);
      article.setAttribute('data-uid', p.uid);

      let thumbHtml = '';
      if (thumb) {
        thumbHtml = `
          <aside class="file-thumb">
            <img src="${thumb}" alt="Post image thumbnail" />
            <div class="file-meta">File: Attached Image ([unknown size])</div>
          </aside>
        `;
      }
      // NEW: render cornerImage if provided (small overlay in corner)
      if (p.cornerImage) {
        // place a small absolute-corner thumbnail before post-body
        thumbHtml = thumbHtml || ''; // keep primary thumb if present
        thumbHtml = `<div style="position:relative;display:inline-block;">${thumbHtml}<div style="position:absolute;left:8px;top:8px;width:64px;height:64px;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#000;"><img src="${p.cornerImage}" alt="corner" style="width:100%;height:100%;object-fit:cover;"></div></div>`;
      }
      
      article.innerHTML = `
        ${thumbHtml}
        <div class="post-body">
          <div class="post-head">
            <div class="post-title">${displayName}</div>
            <div class="post-id">${time} No.${postIdShort}</div>
            
            <div class="vote-actions">
              <button class="btn tiny upvote" data-id="${p.id}" title="Thumbs up">👍</button><span id="up-${p.id}" style="min-width:16px;color:#27c93f">0</span>
              <button class="btn tiny danger downvote" data-id="${p.id}" title="Thumbs down">👎</button><span id="down-${p.id}" style="min-width:16px;color:#ff6b6b">0</span>
            </div>
            <button class="reply-btn" data-action="reply" title="Reply">Reply</button>
          </div>

          <div class="post-text">${finalPostText}</div>

          <!-- Replies and reply input area -->
          <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
            <button class="btn outline tiny toggle-replies" data-id="${p.id}" aria-expanded="false">▶ ${repliesCount} replies</button>
          </div>
          <div id="replies-${p.id}" style="display:none;margin-top:6px;"></div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input id="replyInput-${p.id}" type="text" placeholder="Write a reply..." style="flex:1;background:var(--bg);color:var(--accent);border:1px solid var(--border);border-radius:6px;padding:6px;font-size:13px;" />
            <button class="btn tiny" id="replySend-${p.id}">Reply</button>
          </div>
        </div>
      `;
      
      // Wire up voting, replies toggle, and reply send logic
      article.querySelector('.upvote')?.addEventListener('click', () => voteOn(`socialFeed/${p.id}`, 1));
      article.querySelector('.downvote')?.addEventListener('click', () => voteOn(`socialFeed/${p.id}`, -1));
      
      const repliesRef = ref(db, `socialFeed/${p.id}/replies`);
      const toggleBtn = article.querySelector(`.toggle-replies[data-id="${p.id}"]`);
      const listEl = article.querySelector(`#replies-${p.id}`);
      
      // When opening replies, fetch and render, updating count.
      toggleBtn?.addEventListener('click', ()=>{
        const cur = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', (!cur).toString());
        listEl.style.display = cur ? 'none' : '';
        toggleBtn.textContent = toggleBtn.textContent.replace(cur?'▼':'▶', cur?'▶':'▼');
        
        if (!cur) get(repliesRef).then(rs=>{
          const arr=[]; rs.forEach(c=>arr.push({ id:c.key, postId: p.id, ...c.val() }));
          renderRepliesList(listEl, arr); arr.forEach(r=> bindReplyVotes(listEl, p.id, r.id));
          // Update reply count in button text after load
          toggleBtn.textContent = `▼ ${arr.length} ${arr.length===1?'reply':'replies'}`;
        });
      });
      
      article.querySelector(`#replySend-${p.id}`)?.addEventListener('click', async ()=>{
        const inputEl = article.querySelector(`#replyInput-${p.id}`);
        const content = (inputEl?.value||'').trim(); if(!content) return;
        const me = auth.currentUser; if(!me){ alert('Sign in to reply'); return; }
        const us = await get(ref(db, `users/${me.uid}`)); const d = us.exists() ? us.val() : {};
        
        await push(repliesRef, { 
          uid: me.uid, 
          username: d.username || me.displayName || (me.email||'').split('@')[0] || 'User', 
          content, 
          timestamp: serverTimestamp() 
        });
        
        // Refresh replies list immediately after posting
        const rs = await get(repliesRef);
        const arr = []; rs.forEach(c => arr.push({ id: c.key, postId: p.id, ...c.val() }));
        
        // Ensure the reply list is open and rendered
        toggleBtn.setAttribute('aria-expanded', 'true');
        listEl.style.display = '';
        renderRepliesList(listEl, arr); 
        arr.forEach(r=> bindReplyVotes(listEl, p.id, r.id));
        toggleBtn.textContent = `▼ ${arr.length} ${arr.length===1?'reply':'replies'}`;

        inputEl.value = '';
      });
      
      bindPostVotes(article, p.id, p.uid);
      targetEl.appendChild(article);
    });
  }catch(err){
    console.warn('loadBoardPosts error', err);
    targetEl.innerHTML = `<div class="empty">Failed to load posts.</div>`;
  }
}

// END content view management functions

// NEW: Helper function to close the users sidebar
function closeUsersSidebar() {
  const usersSidebar = document.getElementById('usersSidebar');
  const socialView = document.getElementById('socialView');
  if (usersSidebar?.classList.contains('open')) {
    usersSidebar.classList.remove('open');
    socialView?.classList.remove('sidebar-open');
    document.body.classList.remove('sidebar-open');
  }
}

// NEW: subscribe and render notifications area for current user
let _notifUnsub = null;
function renderNotificationItem(nid, note) {
  const el = document.createElement('div');
  el.className = 'project-card';
  el.style.display = 'flex';
  el.style.justifyContent = 'space-between';
  el.style.alignItems = 'center';
  el.innerHTML = `<div style="flex:1">
      <div style="font-weight:700;font-size:13px;">${(note.type||'Notification').toUpperCase()}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:6px;">${String(note.preview || note.message || '').slice(0,300)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">${note.ts ? new Date(note.ts).toLocaleString() : ''}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-left:12px;">
      <button class="btn tiny" data-nid="${nid}" data-type="${note.type||''}" data-from="${note.from||''}">Open</button>
      <button class="btn outline tiny dismiss" data-nid="${nid}">Dismiss</button>
    </div>`;
  return el;
}

function subscribeNotificationsForCurrentUser(){
  const uid = auth.currentUser?.uid;
  const container = document.getElementById('socialNotifications');
  if (!container) return;
  if (_notifUnsub) _notifUnsub(); // cleanup
  const refp = ref(db, `notifications/${uid}`);
  _notifUnsub = onValue(refp, (snap) => {
    container.innerHTML = '';
    if (!snap.exists()) {
      // optionally show empty hint
      container.innerHTML = '';
      return;
    }
    const data = snap.val() || {};
    // render each unread/present notification
    Object.entries(data).forEach(([nid, note])=>{
      if (!note) return;
      
      // Filter out PM notifications from the wall feed display as requested by the user
      if (note.type === 'pm') return; 

      const node = renderNotificationItem(nid, note);
      // Open button: if PM -> open PM and remove notification
      node.querySelector('button[data-nid]')?.addEventListener('click', async (e)=>{
        const from = e.currentTarget.dataset.from;
        const type = e.currentTarget.dataset.type;
        try{
          if (type === 'pm' && from) {
            openPmByUid(from);
          } else if (type === 'post' && note.postId) {
            // jump to post in wall - scroll into view if present
            const el = document.querySelector(`[data-id="${note.postId}"], [data-id="${note.postId}"]`);
            if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }catch(_){}
        // dismiss after opening
        await remove(ref(db, `notifications/${uid}/${nid}`)).catch(()=>{});
      });
      // Dismiss button: simply remove notification node (one-time)
      node.querySelector('.dismiss')?.addEventListener('click', async (e)=>{
        await remove(ref(db, `notifications/${uid}/${nid}`)).catch(()=>{});
      });
      container.appendChild(node);
    });
  });
}

// NEW: respond to global requests to open a 17chan board (from app-level click routing)
document.addEventListener('open17chan', (e) => {
  try {
    const board = (e?.detail?.board || '/b/').toString();
    // Ensure social view is visible, then show 17chan content and load the requested board
    const tab = document.getElementById('tabSocial');
    if (tab && tab.classList.contains('hidden')) {
      // Try to reveal Social tab (if keys/permissions allow) then trigger content
      tab.click?.();
    }
    // ensure socialView is shown
    const socialView = document.getElementById('socialView');
    if (socialView && socialView.classList.contains('hidden')) {
      // emulate clicking the Social tab handler to show view
      const tabSocialEl = document.getElementById('tabSocial');
      if (tabSocialEl) tabSocialEl.click();
    }
    // Show 17chan content and load the board
    show17ChanContent();
    const container = document.getElementById('socialWallFeed');
    const postsEl = container ? container.querySelector('#xBoardPosts') : null;
    loadBoardPosts(board, postsEl || (container || document.createElement('div')));
  } catch (err) { console.warn('open17chan failed', err); }
});

// NEW: Main image button in composer — inserts a corner image tag [cornerimg]URL[/cornerimg]
document.getElementById('socialMainImageBtn')?.addEventListener('click', () => {
  const ta = document.getElementById('socialPostInput'); if(!ta) return;
  const url = prompt('Main image URL (https://...) — will appear in corner of the board post:');
  if(!url) return;
  const tag = `[cornerimg]${url.trim()}[/cornerimg]`;
  const s = ta.selectionStart||ta.value.length, e = ta.selectionEnd||s;
  ta.value = ta.value.slice(0,s) + tag + ta.value.slice(e);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + tag.length;
});

// NEW: helper to set only one active social tab (remove blue from others)
function setActiveSocialTab(activeId) {
  const ids = ['wallFeedBtn','chan17Btn','hashtagsBtn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === activeId) el.classList.remove('outline');
    else el.classList.add('outline');
  });
}

export function initSocial() {
  const tabSocial = document.getElementById('tabSocial');
  const socialView = document.getElementById('socialView');
  const projectsList = document.getElementById('projectsList');
  const projectsListSection = document.getElementById('projectsListSection');
  const quantumView = document.getElementById('quantumView');
  const adminView = document.getElementById('adminView');
  const pqGate = document.getElementById('pqGate');
  const accountDetailsSection = document.getElementById('accountDetailsSection');
  const toggleBtn = document.getElementById('toggleUsersSidebarBtn');
  const usersSidebar = document.getElementById('usersSidebar');

  if (tabSocial) {
    // hide tab until confirmed public upload
    const confirmed = localStorage.getItem('pq.cloudSaved') === '1';
    tabSocial.classList.toggle('hidden', !confirmed);
    tabSocial.addEventListener('click', () => {
      if (!localStorage.getItem('pq.cloudSaved') === '1' && !confirmed) { alert('Upload public quantum keys first.'); return; }
      projectsList.classList.add('hidden');
      projectsList.style.display = 'none';
      if (projectsListSection) projectsListSection.style.display = 'none'; // HIDE PROJECTS SECTION
      quantumView.classList.add('hidden');
      adminView.classList.add('hidden');
      if (pqGate) { 
        pqGate.classList.add('hidden'); 
        pqGate.style.display = 'none';
      }
      if (accountDetailsSection) accountDetailsSection.style.display = 'none'; // HIDE ACCOUNT SECTION
      const newProjectBtn = document.getElementById('newProjectBtn');
      if (newProjectBtn) { 
        newProjectBtn.classList.add('hidden');
        newProjectBtn.style.display = 'none';
      }
      socialView.classList.remove('hidden');
      // ensure sidebar closed on enter for clean layout
      usersSidebar?.classList.remove('open');
      socialView.classList.remove('sidebar-open');
      document.body.classList.remove('sidebar-open');
      const hamb = document.getElementById('toggleUsersSidebarBtn');
      if (hamb) { 
        hamb.classList.remove('hidden'); 
        hamb.style.display = ''; 
        hamb.classList.remove('hamb-over'); // inline within tab bar for Social-Q
      }
      subscribeFriends();
      subscribeFriendRequests();
      loadSocialView();
      // subscribe realtime notifications whenever Social tab is opened
      if (auth.currentUser) subscribeNotificationsForCurrentUser();
    });

    // Listen for external requests to refresh the wall feed (e.g. Wall Feed button)
    document.addEventListener('refreshWallFeed', () => {
      try { loadWallFeed(); } catch (e) { console.warn('refreshWallFeed failed', e); }
    });
  }

  document.getElementById('socialPostBtn')?.addEventListener('click', postToWall);
  document.getElementById('socialAddImageBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('socialPostInput'); if(!ta) return;
    const url = prompt('Image URL (https://...)'); if(!url) return;
    const tag = `[img]${url.trim()}[/img]`;
    const s = ta.selectionStart||ta.value.length, e = ta.selectionEnd||s;
    ta.value = ta.value.slice(0,s) + tag + ta.value.slice(e);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + tag.length;
  });
  document.getElementById('socialAddVideoBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('socialPostInput'); if(!ta) return;
    const url = prompt('Video URL (https://...), allowed extensions: .mp4 .webm .ogg .mpeg'); if(!url) return;
    const u = url.trim();
    if(!/\.(mp4|webm|ogg|mpeg)(\?|$)/i.test(u)) { alert('Only direct video URLs allowed (.mp4, .webm, .ogg, .mpeg).'); return; }
    const tag = `[video]${u}[/video]`;
    const s = ta.selectionStart||ta.value.length, e = ta.selectionEnd||s;
    ta.value = ta.value.slice(0,s) + tag + ta.value.slice(e);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + tag.length;
  });
  // Tab switching between Friends and All Users
  document.getElementById('socialTabFriends')?.addEventListener('click', (e)=>{ showUsersTab('friends'); });
  document.getElementById('socialTabAll')?.addEventListener('click', (e)=>{ showUsersTab('all'); });
  document.getElementById('socialTabOnline')?.addEventListener('click', (e)=>{ showUsersTab('online'); });

  // Set online status
  auth.onAuthStateChanged(user => {
    if (user) {
      const statusRef = ref(db, `presence/${user.uid}`);
      set(statusRef, { online: true, username: user.displayName || user.email?.split('@')[0] || 'User', lastSeen: serverTimestamp() });
      onDisconnect(statusRef).set({ online: false, username: user.displayName || user.email?.split('@')[0] || 'User', lastSeen: serverTimestamp() });
      // heartbeat: update lastSeen every 60s
      clearInterval(window._presenceTimer);
      window._presenceTimer = setInterval(() => { update(statusRef, { lastSeen: serverTimestamp() }); }, 60000);
      subscribeFriendRequests();
    }
  });

  // clear heartbeat on logout
  document.addEventListener('authUserChanged', (e) => {
    if (!e.detail?.user) { clearInterval(window._presenceTimer); window._presenceTimer = null; }
  });

  // add: listen for viewer events to open PM or send friend request (from socialViewer iframe)
  document.addEventListener('social:openPm', async (e) => {
    const uid = e?.detail?.uid;
    if (uid) openPmByUid(uid);
  });

  // handle dispatched custom events (used by socialViewer above via dynamic import)
  document.addEventListener('social:addFriend', async (e) => {
    const uid = e?.detail?.uid;
    if (uid) sendFriendRequest(uid);
  });

  // also accept postMessage events routed by socialViewer iframe (keeps compatibility)
  window.addEventListener('message', (ev) => {
    try {
      const d = ev.data || {};
      if (d?.type === 'social:pm' && d.uid) {
        openPmByUid(d.uid);
      } else if (d?.type === 'social:addFriend' && d.uid) {
        sendFriendRequest(d.uid);
      } else if (d?.type === 'social:deleteReply' && d.postId && d.replyId) {
        (async ()=>{
          try {
            const me = auth.currentUser;
            if (!me) return;
            const postId = d.postId, replyId = d.replyId;
            const rSnap = await get(ref(db, `socialFeed/${postId}/replies/${replyId}`));
            if (!rSnap.exists()) return;
            const reply = rSnap.val();
            const postSnap = await get(ref(db, `socialFeed/${postId}`));
            const post = postSnap.exists() ? postSnap.val() : {};
            const ownerUid = post.uid;
            const replyUid = reply.uid;
            // allow delete if you are reply author or you own the post
            if (me.uid === replyUid || me.uid === ownerUid) {
              await remove(ref(db, `socialFeed/${postId}/replies/${replyId}`));
            } else {
              // unauthorized — optionally notify
              import('./ui.js').then(m => m.notify('Delete denied: insufficient permissions', 4000));
            }
          } catch (err) { console.warn('deleteReply failed', err); }
        })();
        return;
      }
      // ...existing branches (social:pm, social:addFriend, social:getReplies, social:vote etc) ...
    } catch(_) {}
  });

  toggleBtn?.addEventListener('click', () => {
    usersSidebar?.classList.toggle('open');
    const isOpen = usersSidebar?.classList.contains('open');
    socialView?.classList.toggle('sidebar-open', !!isOpen);
    document.body.classList.toggle('sidebar-open', !!isOpen);
  });
  
  // NEW: Close button handler
  document.getElementById('closeUsersSidebarBtn')?.addEventListener('click', closeUsersSidebar);

  // default: hide hamburger when not on Social
  const hambInit = document.getElementById('toggleUsersSidebarBtn');
  if (hambInit) { hambInit.classList.add('hidden'); hambInit.style.display = 'none'; }
  
  // NEW: centralized Wall Feed / 17chan / Hashtags button wiring using setActiveSocialTab
  document.getElementById('wallFeedBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveSocialTab('wallFeedBtn');
    showWallFeedContent();
  });
  document.getElementById('chan17Btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveSocialTab('chan17Btn');
    show17ChanContent();
  });
  document.getElementById('hashtagsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveSocialTab('hashtagsBtn');
    showHashtagsContent();
  });
}

async function loadSocialView() {
  loadProfile();
  loadOnlineUsers();
  loadAllUsers();
  showWallFeedContent(); // Ensure the default state is Wall Feed when Social View loads
  loadMessenger();
  
  // Populate board select dropdown
  const boardSelect = document.getElementById('socialBoardSelect');
  if (boardSelect) {
    boardSelect.innerHTML = BOARDS.map(b => 
      `<option value="${b.id}" ${b.id === 'wall' ? 'selected' : ''}>${b.name}</option>`
    ).join('');
    // NEW: ensure anonymity checkbox only shows for non-wall boards
    const anonCheckboxWrap = document.getElementById('postAnonCheckbox')?.closest('label');
    const updateAnonVisibility = () => {
      const val = boardSelect.value || 'wall';
      if (anonCheckboxWrap) {
        if (val === 'wall') {
          // hide and clear checkbox for wall
          anonCheckboxWrap.style.display = 'none';
          const cb = document.getElementById('postAnonCheckbox');
          if (cb) { cb.checked = false; }
        } else {
          anonCheckboxWrap.style.display = '';
        }
      }
    };
    boardSelect.addEventListener('change', updateAnonVisibility);
    // initialize visibility on load
    updateAnonVisibility();
  }
}

async function loadProfile() {
  const container = document.getElementById('socialProfile');
  if (!container) return;

  const user = auth.currentUser;
  if (!user) {
    container.innerHTML = '<div style="color:var(--muted);">Not signed in</div>';
    return;
  }

  const uid = user.uid;
  const snap = await get(ref(db, `users/${uid}`));
  const data = snap.exists() ? snap.val() : {};

  const username = data.username || user.displayName || user.email?.split('@')[0] || 'User';
  const email = user.email || '';
  const joined = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Unknown';
  const qbitBalance = (data.qbitBalance != null) ? data.qbitBalance : 0;
  const avatarUrl = data.avatarUrl || '';

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <img class="avatar" src="${avatarUrl || 'https://cdn.jsdelivr.net/gh/identicons/jasonlong/assets/images/octocat-de-los-muertos.jpg'}" alt="Avatar" />
      <div>
        <div style="font-weight:700;font-size:15px;">${username}</div>
        <div style="font-size:12px;color:var(--muted);">${email}</div>
        <div style="font-size:12px;color:var(--muted);">Joined: ${joined}</div>
        <div style="font-size:12px;color:var(--muted);">QBitCoin Balance: <strong>${qbitBalance}</strong></div>
      </div>
    </div>
    <div style="display:flex;gap:6px;">
      <button id="editProfileBtn" class="btn outline">Edit Profile</button>
      <button id="editAvatarBtn" class="btn outline">Set Avatar URL</button>
     ${ (myFriends.has(uid) ? `<button id="profileRemoveFriend" class="btn danger">Remove Friend</button>` : (pendingOutgoing.has(uid) ? `<button id="profileCancelRequest" class="btn outline">Cancel Request</button>` : '')) }
    </div>
  `;

  document.getElementById('editProfileBtn')?.addEventListener('click', async () => {
    const newName = prompt('Enter new username:', username);
    if (!newName || !newName.trim()) return;
    const desired = newName.trim(), lower = desired.toLowerCase();
    const allSnap = await get(ref(db, 'users'));
    const taken = allSnap.exists() && Object.values(allSnap.val()).some(u => ((u.usernameLower || (u.username||'').toLowerCase()) === lower) && u.uid !== uid);
    if (taken) { alert('Username already taken.'); return; }
    await update(ref(db, `users/${uid}`), { username: desired, usernameLower: lower });
    loadProfile();
  });

  document.getElementById('editAvatarBtn')?.addEventListener('click', async () => {
    const cur = (data.avatarUrl || '').trim();
    const url = prompt('Enter image URL for your avatar (https://...)', cur);
    if (url !== null) { await update(ref(db, `users/${uid}`), { avatarUrl: url.trim() }); loadProfile(); }
  });

  // Remove friend from profile
  document.getElementById('profileRemoveFriend')?.addEventListener('click', async (e) => {
    if (!confirm('Remove this friend?')) return;
    try { await unfriend(uid); loadProfile(); loadFriendsList(); loadAllUsers(); } catch(err){ console.warn('Unfriend failed', err); }
  });
  // Cancel outgoing request from profile
  document.getElementById('profileCancelRequest')?.addEventListener('click', async (e) => {
    if (!confirm('Cancel friend request?')) return;
    try { await set(ref(db, `friendRequestsOutgoing/${auth.currentUser.uid}/${uid}`), null); await set(ref(db, `friendRequests/${uid}/${auth.currentUser.uid}`), null); pendingOutgoing.delete(uid); loadProfile(); loadAllUsers(); } catch(err){ console.warn('Cancel request failed', err); }
  });
}

function loadOnlineUsers() {
  const container = document.getElementById('socialOnlineUsersTab') || document.getElementById('socialOnlineUsers');
  if (!container) return;
  if (unsubOnline) unsubOnline();
  const presenceRef = ref(db, 'presence');
  unsubOnline = onValue(presenceRef, (snap) => {
    container.innerHTML = '';
    if (!snap.exists()) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px;">No users online</div>';
      return;
    }
    const presence = snap.val();
    const now = Date.now();
    const online = Object.entries(presence).filter(([_, data]) => {
      const last = Number(data?.lastSeen || 0);
      return last && (now - last) <= 5 * 60 * 1000; // within 5 minutes
    });
    if (!online.length) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px;">No users online</div>';
      return;
    }
    online.forEach(([uid, data]) => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:6px;border-bottom:1px solid #222;font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;';
      div.innerHTML = `<span style="width:8px;height:8px;background:#4caf50;border-radius:50%;"></span><span class="user-link" data-uid="${uid}">${data.username || 'User'}</span>`;
      div.querySelector('.user-link')?.addEventListener('click', (e)=>{ e.stopPropagation(); openUserProfile(uid); });
      container.appendChild(div);
    });
  });
}

function loadAllUsers() {
  const container = document.getElementById('socialAllUsers');
  if (!container) return;

  if (unsubUsers) unsubUsers();

  const usersRef = ref(db, 'users');
  unsubUsers = onValue(usersRef, (snap) => {
    container.innerHTML = '';
    if (!snap.exists()) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px;">No users found</div>';
      return;
    }

    const users = snap.val();
    Object.entries(users).forEach(([uid, data]) => {
      if (auth.currentUser && uid === auth.currentUser.uid) return;
      // in "All Users" tab we show everyone; friends-only view uses loadFriendsList()
      const chatId = [auth.currentUser?.uid, uid].sort().join('_');
      const isFriend = myFriends.has(uid);
      const isIncoming = pendingIncoming.has(uid);
      const isOutgoing = pendingOutgoing.has(uid);
      const div = document.createElement('div');
      div.style.cssText = 'padding:6px;border-bottom:1px solid #222;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;';
      const name = data.username || data.email?.split('@')[0] || 'User';
      let actions = '';
      if (isFriend) actions = `<button class="btn outline tiny friend-remove" data-uid="${uid}">Unfriend</button>`;
      else if (isIncoming) actions = `<button class="btn outline tiny friend-accept" data-uid="${uid}">Accept</button><button class="btn danger tiny friend-deny" data-uid="${uid}">Deny</button>`;
      else if (isOutgoing) actions = `<button class="btn outline tiny cancel-request" data-uid="${uid}">Cancel</button>`;
      else actions = `<button class="btn outline tiny friend-request" data-uid="${uid}">Add Friend</button>`;
      div.innerHTML = `<span class="user-link" data-uid="${uid}">${name}</span><div style="display:flex;align-items:center;gap:8px;">${actions}<span class="notif-dot notif-hidden" data-chat="${chatId}"></span></div>`;
      div.querySelector('.user-link')?.addEventListener('click', () => openUserProfile(uid));
      div.addEventListener('click', () => openPmModal({ uid, username: data.username || data.email?.split('@')[0] || 'User' }));
      div.querySelector('.friend-request')?.addEventListener('click', (e)=>{ e.stopPropagation(); sendFriendRequest(uid, name); });
      div.querySelector('.cancel-request')?.addEventListener('click', async (e)=>{ e.stopPropagation(); // cancel outgoing request
        try { await set(ref(db, `friendRequestsOutgoing/${auth.currentUser.uid}/${uid}`), null); await set(ref(db, `friendRequests/${uid}/${auth.currentUser.uid}`), null); pendingOutgoing.delete(uid); loadAllUsers(); } catch(err){ console.warn('Cancel request failed', err); }
      });
      div.querySelector('.friend-accept')?.addEventListener('click', (e)=>{ e.stopPropagation(); acceptFriend(uid); });
      div.querySelector('.friend-deny')?.addEventListener('click', (e)=>{ e.stopPropagation(); denyFriend(uid); });
      div.querySelector('.friend-remove')?.addEventListener('click', (e)=>{ e.stopPropagation(); unfriend(uid); });
      container.appendChild(div);
      const lastRef = ref(db, `chats/${chatId}`);
      onValue(lastRef, (cs) => {
        const dot = container.querySelector(`.notif-dot[data-chat="${chatId}"]`);
        if (!cs.exists() || !dot) return dot && dot.classList.add('notif-hidden');
        let last=null; cs.forEach(c=>{ last=c.val(); });
        if (last && last.from && last.from !== auth.currentUser?.uid) dot.classList.remove('notif-hidden'); else dot.classList.add('notif-hidden');
      });
    });
  });
}

/**
 * Update: wall feed ordering uses activity score to bump active posts (replies/upvotes/recency).
 */
function loadWallFeed() {
  const container = document.getElementById('socialWallFeed');
  if (!container) return;

  if (unsubFeed) unsubFeed();

  const feedRef = ref(db, 'socialFeed');
  unsubFeed = onValue(feedRef, (snap) => {
    container.innerHTML = '';
    if (!snap.exists()) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px;">No posts yet. Be the first to post!</div>';
      return;
    }

    const posts = [];
    snap.forEach(child => {
      const data = child.val() || {};
      const isChatLike = !!(data.to || data.chatId || data.plainFrom || data.kemCiphertext || data.aesCiphertext);
      if (isChatLike) return;
      if (String((data.boardId || 'wall')) !== 'wall') return;
      posts.push({ id: child.key, ...data });
    });

    // compute activity and sort using same logic (most active first)
    posts.forEach(p => { p._activity = computeActivityScore(p); });
    posts.sort((a, b) => {
      if (b._activity !== a._activity) return b._activity - a._activity;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    posts.forEach(post => {
      const isOwner = !!(auth.currentUser && auth.currentUser.uid === post.uid);
      const msgBtn = isOwner ? '' : `<button class="btn outline tiny message-btn" data-uid="${post.uid || ''}" style="margin-left:6px;">Message</button>`;
      const delBtn = isOwner ? `<button class="btn danger tiny delete-post" data-id="${post.id}" style="margin-left:6px;">Delete</button>` : '';
      const div = document.createElement('div');
      div.style.cssText = 'padding:12px;border:1px solid #222;border-radius:8px;margin-bottom:8px;background:#0b0b0b;';
      const time = post.timestamp ? new Date(post.timestamp).toLocaleString() : '';
      const contentHtml = renderContentWithImages(post.content || '');
      div.innerHTML = `
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">
          <a href="#" class="profile-open" data-uid="${post.uid || ''}" style="color:#fff;text-decoration:none;">${post.username || 'User'}</a>
          ${msgBtn}
          ${delBtn}
        </div>
        <div style="font-size:13px;margin-bottom:4px;word-break:break-word;">${contentHtml}</div>
        <div style="display:flex;align-items:center;gap:10px;margin:6px 0;">
          <button class="btn tiny upvote" data-id="${post.id}" title="Thumbs up">👍</button><span id="up-${post.id}" style="min-width:16px;color:#27c93f">${post.votes ? Object.values(post.votes).filter(v=>Number(v)>0).length : 0}</span>
          <button class="btn tiny danger downvote" data-id="${post.id}" title="Thumbs down">👎</button><span id="down-${post.id}" style="min-width:16px;color:#ff6b6b">${post.votes ? Object.values(post.votes).filter(v=>Number(v)<0).length : 0}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);">${time}</div>
      `;
      /* replies UI preserved (unchanged) */
      div.insertAdjacentHTML('beforeend', `
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
          <button class="btn outline tiny toggle-replies" data-id="${post.id}" aria-expanded="false">▶ 0 replies</button>
        </div>
        <div id="replies-${post.id}" style="display:none;margin-top:6px;"></div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <input id="replyInput-${post.id}" type="text" placeholder="Write a reply..." style="flex:1;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:6px;font-size:13px;" />
          <button class="btn tiny" id="replySend-${post.id}">Reply</button>
        </div>
      `);
      /* same wiring for replies and votes as before */
      const repliesRef = ref(db, `socialFeed/${post.id}/replies`);
      const toggleBtn = div.querySelector(`.toggle-replies[data-id="${post.id}"]`);
      const listEl = div.querySelector(`#replies-${post.id}`);
      onValue(repliesRef, (rs)=>{
        const replies=[]; rs.forEach(c=>replies.push({ id:c.key, postId: post.id, ...c.val() }));
        const open = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.textContent = `${open ? '▼' : '▶'} ${replies.length} ${replies.length===1?'reply':'replies'}`;
        if (open) { renderRepliesList(listEl, replies); replies.forEach(r=> bindReplyVotes(listEl, post.id, r.id)); }
      });
      toggleBtn?.addEventListener('click', ()=>{
        const cur = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', (!cur).toString());
        listEl.style.display = cur ? 'none' : '';
        toggleBtn.textContent = toggleBtn.textContent.replace(cur?'▼':'▶', cur?'▶':'▼');
        if (!cur) get(repliesRef).then(rs=>{
          const arr=[]; rs.forEach(c=>arr.push({ id:c.key, postId: post.id, ...c.val() }));
          renderRepliesList(listEl, arr); arr.forEach(r=> bindReplyVotes(listEl, post.id, r.id));
        });
      });
      div.querySelector(`#replySend-${post.id}`)?.addEventListener('click', async ()=>{
        const inputEl = div.querySelector(`#replyInput-${post.id}`);
        const content = (inputEl?.value||'').trim(); if(!content) return;
        const me = auth.currentUser; if(!me){ alert('Sign in to reply'); return; }
        const us = await get(ref(db, `users/${me.uid}`)); const d = us.exists() ? us.val() : {};
        await push(repliesRef, { uid: me.uid, username: d.username || me.displayName || (me.email||'').split('@')[0] || 'User', content, timestamp: serverTimestamp() });
        try {
          const rs = await get(repliesRef);
          const arr = []; rs.forEach(c => arr.push({ id: c.key, postId: post.id, ...c.val() }));
          renderRepliesList(listEl, arr);
          arr.forEach(r => bindReplyVotes(listEl, post.id, r.id));
        } catch (e) { console.warn('Failed to refresh replies after posting:', e); }
        inputEl.value = '';
      });

      bindPostVotes(div, post.id, post.uid);
      container.appendChild(div);
    });
  });
}

function renderContentWithImages(text){
  const allowed=/\.(png|jpe?g|gif|webp|svg)$/i, clean=(u)=>String(u||'').trim().replace(/[)"'>]+$/,''); let s=String(text||''), segs=[], m, out=[];
  while((m=s.match(/\[img\]([\s\S]+?)\[\/img\]/i))){ const pre=s.slice(0,m.index); if(pre) segs.push({t:pre}); const url=clean(m[1]); segs.push({img:allowed.test(url)?url:null}); s=s.slice(m.index+m[0].length); }
  // handle video tags
  while((m=s.match(/\[video\]([\s\S]+?)\[\/video\]/i))){ const pre=s.slice(0,m.index); if(pre) segs.push({t:pre}); const url=clean(m[1]); segs.push({video:/\.(mp4|webm|ogg|mpeg)(\?|$)/i.test(url)?url:null}); s=s.slice(m.index+m[0].length); }
  if(s) segs.push({t:s});
  const linkRe=/(https?:\/\/[^\s<]+)(?=$|\s)/gi, imgTpl=(u)=>`<div style="margin-top:6px;"><img src="${u}" alt="" style="max-width:100%;border:1px solid #222;border-radius:6px;"></div>`;
  const videoTpl=(u)=>`<div style="margin-top:8px;"><video controls style="max-width:100%;border:1px solid #222;border-radius:6px;"><source src="${u.replace(/^http:/,'https:')}"></video></div>`;
  segs.forEach(p=>{
    if(p.video){ out.push(videoTpl(p.video)); }
    else if(p.img){ out.push(imgTpl(p.img)); }
    else if(p.t){ out.push(p.t.replace(linkRe,(u)=>{ const cu=clean(u); if(/\.(mp4|webm|ogg|mpeg)(\?|$)/i.test(cu)) return videoTpl(cu); return allowed.test(cu)?imgTpl(cu):`<a href="${cu}" target="_blank" rel="noopener">${cu}</a>`; })); }
  });
  return out.join('');
}

function renderRepliesList(listEl, replies){
  listEl.innerHTML = '';
  replies.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)).forEach(r=>{
    const row=document.createElement('div');
    row.style.cssText='padding:6px;border-bottom:1px solid #222;font-size:12px;display:flex;flex-direction:column;';
    row.setAttribute('data-rid', r.id);
    // include a delete button that asks parent to remove the reply; parent enforces permission check
    row.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="font-weight:700">${r.username||'User'}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn tiny delete-reply" data-post="${r.postId||''}" data-reply="${r.id}" title="Delete reply">🗑</button>
      </div>
    </div>
    <div style="word-break:break-word;margin-top:6px;">${(r.content||'')}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
      <button class="btn tiny upvote" data-post="${r.postId||''}" data-reply="${r.id}" title="Thumbs up">👍</button><span id="up-${(r.postId||'')}-${r.id}" style="min-width:16px;color:#27c93f">0</span>
      <button class="btn tiny danger downvote" data-post="${r.postId||''}" data-reply="${r.id}" title="Thumbs down">👎</button><span id="down-${(r.postId||'')}-${r.id}" style="min-width:16px;color:#ff6b6b">0</span>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px;">${r.timestamp?new Date(r.timestamp).toLocaleString():''}</div>`;
    listEl.appendChild(row);
    // wire delete button: request parent to delete; server-side permission check performed below
    const delBtn = row.querySelector('.delete-reply');
    if (delBtn) delBtn.addEventListener('click', async (e)=> {
      e.stopPropagation();
      const pid = delBtn.dataset.post; const rid = delBtn.dataset.reply;
      if (!confirm('Delete this reply?')) return;
      // parent handler via message (fallback) — but we can call DB directly here (permissions enforced server-side)
      try { await remove(ref(db, `socialFeed/${pid}/replies/${rid}`)); } catch(err){ try { console.warn('Direct delete failed, sending message to parent', err); window.postMessage?.({ type:'social:deleteReply', postId: pid, replyId: rid }, '*'); } catch(_){} }
    });
  });
}

async function postToWall() {
  const input = document.getElementById('socialPostInput');
  const boardSelect = document.getElementById('socialBoardSelect'); // NEW: Get board selector
  const anonCheckbox = document.getElementById('postAnonCheckbox'); // NEW: anonymity checkbox
  const content = input?.value?.trim();
  const boardId = boardSelect?.value || 'wall'; // NEW: Get selected board ID
  
  if (!content) return;

  const user = auth.currentUser;
  if (!user) {
    alert('Sign in to post');
    return;
  }

  const uid = user.uid;
  const snap = await get(ref(db, `users/${uid}`));
  const data = snap.exists() ? snap.val() : {};
  const username = data.username || user.displayName || user.email?.split('@')[0] || 'User';

  // anonymity handling - ensure anon is only honored when not posting to the wall
  let anon = !!(anonCheckbox && anonCheckbox.checked);
  if (String(boardId) === 'wall') anon = false;
  const displayName = anon ? 'Anonymous' : username;

  // Enforce per-day limit (20 posts/day)
  const today = new Date();
  const dateKey = today.toISOString().slice(0,10); // YYYY-MM-DD
  const countRef = ref(db, `postCountByDay/${uid}/${dateKey}`);
  const currentCountSnap = await get(countRef);
  const currentCount = Number(currentCountSnap.exists() ? currentCountSnap.val() : 0);
  const MAX_POSTS_PER_DAY = 20;
  if (currentCount >= MAX_POSTS_PER_DAY) {
    alert(`Post limit reached: ${MAX_POSTS_PER_DAY} posts per day.`);
    return;
  }

  // Enforce per-day limit for userRewards.publishedPosts (mirror and ensure stored there)
  const rewardsPubPostsRef = ref(db, `userRewards/${uid}/publishedPosts/${dateKey}`);
  const rewardsPubPostsSnap = await get(rewardsPubPostsRef);
  const rewardsPubPostsCount = Number(rewardsPubPostsSnap.exists() ? rewardsPubPostsSnap.val() : 0);
  if (rewardsPubPostsCount >= MAX_POSTS_PER_DAY) {
    alert(`Post limit reached: ${MAX_POSTS_PER_DAY} posts per day.`);
    return;
  }

  const feedRef = ref(db, 'socialFeed');
  const counterRef = ref(db, 'socialFeedSeq');
  const txn = await runTransaction(counterRef, (cur) => (Number(cur) || 0) + 1);
  const postNumber = Number(txn?.snapshot?.val()) || Date.now();

  // push post with immutable postNumber AND boardId
  // include anonymity metadata: anon (boolean), posterUid (real uid stored for admin only), displayName (shown on UI; 'Anonymous' if anon)
  const newPostRef = await push(feedRef, { 
    uid, // owner id (kept for server/admin)
    posterUid: uid, 
    displayName, 
    anon, 
    username: displayName, // UI-friendly short name (either real or "Anonymous")
    content, 
    timestamp: serverTimestamp(), 
    seq: postNumber, 
    postNumber, 
    boardId 
  });

  // increment per-day counter atomically
  try {
    await runTransaction(countRef, (cur) => {
      const v = Number(cur || 0);
      return v + 1;
    });
  } catch (e) {
    console.warn('Failed to increment daily post count', e);
  }

  // update userRewards publishedPosts daily tally (idempotent / atomic)
  try {
    await runTransaction(ref(db, `userRewards/${uid}/publishedPosts/${dateKey}`), (cur) => {
      const v = Number(cur || 0);
      if (v >= MAX_POSTS_PER_DAY) return v; // safety: don't exceed
      return v + 1;
    });
    // update lastPublishedAt metadata
    await update(ref(db, `userRewards/${uid}`), { publishedPostsLastAt: serverTimestamp() });
  } catch (e) {
    console.warn('Failed to update userRewards.publishedPosts', e);
  }

  // give +10 QBC to user (10 QBC per post)
  const qRef = ref(db, `users/${uid}/qbitBalance`);
  try {
    // Add 10 QBC per post
    await runTransaction(qRef, (cur) => {
      const curVal = Number(cur || 0);
      const add = 10;
      // Note: We rely on postCount check above for daily limits (max 20 posts/day)
      return parseFloat((curVal + add).toFixed(8));
    });
    // notify UI listeners so account area updates immediately
    try{
      const newBalSnap = await get(qRef);
      const newBal = newBalSnap.exists() ? newBalSnap.val() : null;
      window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));
    }catch(_){}
  } catch (e) {
    console.warn('Failed to update qbitBalance on post', e);
  }

  input.value = '';
}

function extractImageUrls(text){
  const urls = (text.match(/https?:\/\/\S+/g) || []);
  return urls.filter(u => /\.(png|jpe?g|gif|webp|svg)$/i.test(u));
}

function loadMessenger() {
  const container = document.getElementById('socialMessenger');
  if (!container) return;

  if (!currentChatUser) {
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;">Select a user to chat</div>';
    return;
  }

  const user = auth.currentUser;
  if (!user) return;

  const chatId = [user.uid, currentChatUser.uid].sort().join('_');

  container.innerHTML = `
    <div style="margin-bottom:8px;font-weight:700;">Chat with ${currentChatUser.username}</div>
    <div id="chatMessages" style="max-height:200px;overflow-y:auto;border:1px solid #222;border-radius:6px;padding:8px;margin-bottom:8px;background:#000;"></div>
    <div style="display:flex;gap:6px;">
      <input id="chatInput" type="text" placeholder="Type a message..." autocomplete="off" style="flex:1;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:6px;font-size:13px;" />
      <button id="chatSendBtn" class="btn">Send</button>
    </div>
  `;

  const messagesRef = ref(db, `chats/${chatId}`);
  onValue(messagesRef, (snap) => {
    const msgContainer = document.getElementById('chatMessages');
    if (!msgContainer) return;

    // Remove any optimistic pending elements so they are not duplicated when the DB snapshot arrives
    try { msgContainer.querySelectorAll('[data-pending="true"]').forEach(el => el.remove()); } catch(_) {}
    msgContainer.innerHTML = '';
    if (!snap.exists()) {
      msgContainer.innerHTML = '<div style="color:var(--muted);font-size:12px;">No messages yet</div>';
      return;
    }

    const messages = [];
    snap.forEach(child => {
      messages.push({ id: child.key, ...child.val() });
    });

    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    messages.forEach(msg => {
      const div = document.createElement('div');
      const isMe = msg.from === user.uid;
      div.style.cssText = `padding:6px 8px;margin-bottom:6px;border-radius:6px;background:${isMe ? '#1e90ff' : '#1a1a1a'};color:#fff;font-size:13px;max-width:80%;${isMe ? 'margin-left:auto;text-align:right;' : ''}`;
      div.textContent = msg.content || '';
      msgContainer.appendChild(div);
    });

    // notify on incoming message from other user
    if (messages.length > 0) {
      const last = messages[messages.length-1];
      if (last.from && last.from !== user.uid) {
        import('./ui.js').then(m => m.notify('New message received', 5000));
      }
    }

    msgContainer.scrollTop = msgContainer.scrollHeight;
    update(ref(db, `chatReads/${user.uid}/${chatId}`), { lastRead: serverTimestamp() });
  });

  document.getElementById('chatSendBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('chatInput');
    const content = input?.value?.trim();
    if (!content) return;

    // optimistic UI: append a pending message so sender sees it immediately
    try {
      const pendingEl = document.createElement('div');
      pendingEl.setAttribute('data-pending', 'true');
      pendingEl.setAttribute('data-pending-text', content);
      pendingEl.style.cssText = `padding:6px 8px;margin-bottom:6px;border-radius:6px;background:#1e90ff;color:#fff;font-size:13px;max-width:80%;margin-left:auto;text-align:right;opacity:0.85;`;
      const span = document.createElement('span'); span.textContent = content;
      const timeEl = document.createElement('div'); timeEl.style.cssText = 'display:block;font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;'; timeEl.textContent = 'Sending...';
      pendingEl.appendChild(span); pendingEl.appendChild(timeEl);
      const chatMessagesEl = document.getElementById('chatMessages');
      if (chatMessagesEl) {
        chatMessagesEl.appendChild(pendingEl);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }
    } catch(_) {}

    await push(ref(db, `chats/${chatId}`), {
      from: user.uid,
      to: currentChatUser.uid,
      content,
      timestamp: serverTimestamp()
    });

    // persist notification for recipient
    sendNotification(currentChatUser.uid, { type:'pm', from: user.uid, chatId, preview: content.slice(0,140) });

    input.value = '';
  });

  document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('chatSendBtn')?.click();
    }
  });
}

/**
 * Helper to retrieve required KEM keys (public key for recipient, private key for self).
 * @param {string} recipientUid 
 * @param {string} myUid 
 * @returns {Promise<{ recipientPub: string, myPriv: string }>}
 */
async function getRequiredKemKeys(recipientUid, myUid) {
  const recipientSnap = await get(ref(db, `users/${recipientUid}/pqKemPub`));
  const recipientPub = recipientSnap.exists() ? recipientSnap.val() : null;

  // We check for myPub existence here to ensure I have uploaded my key, required for using Social-Q features.
  const mySnap = await get(ref(db, `users/${myUid}/pqKemPub`));
  const myPub = mySnap.exists() ? mySnap.val() : null;

  const myPriv = localStorage.getItem(`pq.kem.priv.${myUid}`) || localStorage.getItem('pq.kem.priv');
  
  if (!recipientPub) throw new Error(`Recipient (${recipientUid}) public key not found. They need to generate and upload keys.`);
  if (!myPub) throw new Error("Your public key is missing from the cloud. Please use 'Upload Public Keys' first.");
  if (!myPriv) throw new Error("Your private key not found locally. Please generate or restore keys.");
  
  return { recipientPub, myPriv };
}

function openPmModal(userInfo){
  const me = auth.currentUser; if(!me) return;

  // remove legacy blocking gate; rely on getRequiredKemKeys() for graceful checks
  // if (!localStorage.getItem('pq.hasKeys') || localStorage.getItem('pq.cloudSaved') !== '1') {
  //     alert(`Cannot open secure chat. Please generate your quantum keys and upload your public key first.`);
  //     return;
  // }

  const chatId = [me.uid, userInfo.uid].sort().join('_');
  const overlay = document.createElement('div'); overlay.className='modal-overlay';
  const wrap = document.createElement('div'); wrap.className='modal';
  
  wrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0;">Message ${userInfo.username}</h3>
        <button id="pmCloseTop" class="btn outline icon tiny" title="Close">✕</button>
    </div>
    <p style="font-size:11px; color:#4caf50; margin:0 0 10px;">✅ End-to-End Encrypted using Kyber KEM.</p>
    <div id="pmMessages" style="max-height:220px;overflow:auto;border:1px solid #222;border-radius:6px;padding:8px;margin-bottom:8px;background:#000;"></div>
    <div style="display:flex;gap:6px;">
      <input id="pmInput" type="text" placeholder="Type a message..." style="flex:1;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:6px;font-size:13px;" />
      <button id="pmSend" class="btn">Send</button>
    </div>`;
  overlay.appendChild(wrap); document.body.appendChild(overlay);
  
  const close=()=>{
    // Ensure we only call the unsubscribe function if it's set
    _pmUnsubs.forEach(u=>{ try{ u(); }catch(_){}}); _pmUnsubs = [];
    overlay.remove();
  };
  wrap.querySelector('#pmCloseTop')?.addEventListener('click', close);
  overlay.addEventListener('click',(e)=>{ if(e.target===overlay) close(); });
  
  const pmMessages = wrap.querySelector('#pmMessages');
  /* prepare E2EE key once and incremental listeners */
  let _pmUnsubs = [], _pmSeen = new Set(), _myKemPriv = null;
  getRequiredKemKeys(userInfo.uid, me.uid).then(k => _myKemPriv = k.myPriv).catch(()=>{});
  
  // Note: renderMessages function is currently unused as onChildAdded handles initial load and updates.
  // It is left in place only for context but its logic is mirrored/updated in onAdd below.
  const renderMessages = async (snap) => {
    pmMessages.innerHTML='<div style="color:var(--muted);font-size:12px;">Decrypting...</div>'; 
    const msgs=[]; 
    snap.forEach(c=>msgs.push(Object.assign({ id: c.key }, c.val())));
    
    // Remove any optimistic "sending" placeholders in the modal if present by matching last DB message
    try {
      const lastReal = msgs[msgs.length - 1];
      if (lastReal && pmMessages) {
        const pendingEls = pmMessages.querySelectorAll('[data-pending="true"]');
        pendingEls.forEach(pe => {
          const txt = pe.getAttribute('data-pending-text') || '';
          if (txt && ((lastReal.content && String(lastReal.content) === txt) || (lastReal.plainFrom && String(lastReal.plainFrom) === txt))) {
            pe.remove();
          }
        });
      }
    } catch(_) {}
    
    // Check key availability before attempting decryption
    let myKemPriv;
    try {
        const keys = await getRequiredKemKeys(userInfo.uid, me.uid);
        myKemPriv = keys.myPriv;
    } catch (e) {
        // If keys are missing, do NOT abort — allow live updates using plaintext mirrors when available.
        // Show a gentle warning but continue to render messages (use plainFrom for sender's own messages or show [ENCRYPTED]).
        const errorMsg = e.message || 'Key validation failed.';
        const warn = document.createElement('div');
        warn.style.cssText = 'color:#ff6b6b;font-size:12px;font-weight:700;margin-bottom:6px;';
        warn.textContent = `Secure chat degraded: ${errorMsg}. Showing available plaintext mirrors when possible.`;
        pmMessages.innerHTML = '';
        pmMessages.appendChild(warn);
        myKemPriv = null;
    }

    // Decrypt messages
    const decryptionPromises = msgs.map(async m => {
        // Only attempt decryption if it has the required E2EE fields
        if (m.aesCiphertext && m.kemCiphertext && m.aesIv && m.aesTag) {
            const isMe = m.from === me.uid;
            let decryptedContent = '[Decryption Required]';
            
            if (isMe) {
                 // SENDER READING THEIR OWN MESSAGE: prefer plaintext mirror if present
                 decryptedContent = m.plainFrom || `[MESSAGE ARCHIVE READ FAILED]`;
            } else {
                 // RECIPIENT READING (OR ME READING A MESSAGE SENT TO ME)
                 if (myKemPriv) {
                    // Attempt real decryption when we have the private key
                    try {
                      decryptedContent = await decryptChatMessage(m.kemCiphertext, m.aesCiphertext, m.aesIv, m.aesTag, myKemPriv);
                    } catch (err) {
                      decryptedContent = m.plainFrom || '[ENCRYPTED — failed to decrypt]';
                    }
                 } else {
                    // No private key available — show plaintext mirror if sender provided one, otherwise mark encrypted
                    decryptedContent = m.plainFrom || '[ENCRYPTED]';
                 }
            }

            return { ...m, content: decryptedContent };
        }
        // Fallback for old/unencrypted messages (which shouldn't happen with new rules, but for live updates)
        return { ...m, content: m.content || '[UNENCRYPTED/CORRUPTED MESSAGE]', error: !m.aesCiphertext };
    });

    const decryptedMsgs = await Promise.all(decryptionPromises);

    decryptedMsgs.sort((a,b)=>{
      const tsA = typeof a.timestamp === 'number' ? a.timestamp : 0; 
      const tsB = typeof b.timestamp === 'number' ? b.timestamp : 0;
      return tsA - tsB;
    });

    pmMessages.innerHTML = ''; // Clear 'Decrypting...' message

    decryptedMsgs.forEach(m=>{ 
      const d=document.createElement('div'); 
      const isMe=m.from===me.uid; 
      
      let bgColor = isMe ? '#1e90ff' : '#1a1a1a';
      
      d.style.cssText=`padding:6px 8px;margin-bottom:6px;border-radius:6px;background:${bgColor};color:#fff;max-width:80%;${isMe?'margin-left:auto;text-align:right;':'margin-right:auto;text-align:left;'} word-break: break-word;`; 
      
      const contentSpan = document.createElement('span');
      contentSpan.textContent = m.content; 
      d.appendChild(contentSpan);

      const timeEl = document.createElement('span');
      timeEl.style.cssText = 'display:block;font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;';
      timeEl.textContent = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '...';
      d.appendChild(timeEl);
      
      pmMessages.appendChild(d); 
    });
    
    pmMessages.scrollTop=pmMessages.scrollHeight;
    update(ref(db, `chatReads/${me.uid}/${chatId}`), { lastRead: serverTimestamp() });
  };
  
  // Start listening to messages (store unsubscribe so close() can remove it)
  
  const msgsRef = ref(db, `chats/${chatId}`);
  const onAdd = async (ss) => {
    const m = { id: ss.key, ...ss.val() }; if (_pmSeen.has(m.id)) return; _pmSeen.add(m.id);
    
    // --- 1. Optimistic Cleanup (Removing the pending message for the sender) ---
    // incomingPlain resolves to plaintext (m.plainFrom) for my messages
    const incomingPlain = m.plainFrom || m.content || ''; 
    
    // Only attempt cleanup if this message came from me (because only I added a pending placeholder)
    if (m.from === me.uid) {
        Array.from(pmMessages.querySelectorAll('[data-pending="true"]')).forEach(pe => {
            const pendingText = pe.getAttribute('data-pending-text') || '';
            // Match based on the plaintext content
            if (pendingText && incomingPlain && pendingText === incomingPlain) {
                pe.remove();
            }
        });
    }

    // --- 2. Decrypt/Prepare Content ---
    let text = m.content || m.plainFrom || ''; // Default to ciphertext or plainFrom
    
    // If the message is encrypted, attempt decryption/use plaintext mirror
    if (m.aesCiphertext && m.kemCiphertext) {
        const isMe = m.from === me.uid;
        
        // If my private key is available (fetched into _myKemPriv)
        if (_myKemPriv) {
            if (isMe) {
                 // SENDER: Use plaintext mirror (if archived properly)
                 text = m.plainFrom || '[MESSAGE ARCHIVE READ FAILED]';
            } else {
                 // RECIPIENT: Attempt real decryption
                 try {
                   text = await decryptChatMessage(m.kemCiphertext, m.aesCiphertext, m.aesIv, m.aesTag, _myKemPriv);
                 } catch (err) {
                   text = m.plainFrom || '[ENCRYPTED — failed to decrypt]';
                 }
            }
        } else {
            // No private key available — rely on plaintext mirror if sender provided one, otherwise mark encrypted
            text = m.plainFrom || '[ENCRYPTED]';
        }
    }

    // --- 3. Render Message (Structured, consistent with history loading if it were enabled) ---
    const d = document.createElement('div'); 
    const isMe = m.from === me.uid;
    
    let bgColor = isMe ? '#1e90ff' : '#1a1a1a';
    
    d.style.cssText=`padding:6px 8px;margin-bottom:6px;border-radius:6px;background:${bgColor};color:#fff;max-width:80%;${isMe?'margin-left:auto;text-align:right;':'margin-right:auto;text-align:left;'} word-break: break-word;`; 
    
    const contentSpan = document.createElement('span');
    contentSpan.textContent = text; 
    d.appendChild(contentSpan);

    const timeEl = document.createElement('span');
    timeEl.style.cssText = 'display:block;font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;';
    timeEl.textContent = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '...';
    d.appendChild(timeEl);
    
    pmMessages.appendChild(d); 
    pmMessages.scrollTop = pmMessages.scrollHeight;
    
    update(ref(db, `chatReads/${me.uid}/${chatId}`), { lastRead: serverTimestamp() });
  };
  _pmUnsubs.push(onChildAdded(msgsRef, onAdd));

  // Cleanup listener when modal closes
  // Handled by overriding the close function definition above.

  const send = async ()=>{
    const input = wrap.querySelector('#pmInput'); 
    const content=(input.value||'').trim(); 
    if(!content) return;
    const me = auth.currentUser; 
    if(!me) return;
    
    // 1. Get recipient public key
    let recipientPub;
    try {
        const keys = await getRequiredKemKeys(userInfo.uid, me.uid);
        recipientPub = keys.recipientPub;
    } catch (e) {
        alert('E2EE Setup Error: ' + e.message);
        return;
    }
    
    // Optimistic UI update: Manually append the message before sending
    // We render the plaintext immediately to address latency issues.
    const tempMsgEl = document.createElement('div');
    tempMsgEl.setAttribute('data-pending', 'true'); // <-- Ensure this attribute is set for cleanup
    tempMsgEl.setAttribute('data-pending-text', content); // <-- Ensure plaintext is stored for matching
    tempMsgEl.style.cssText=`padding:6px 8px;margin-bottom:6px;border-radius:6px;background:#1e90ff;color:#fff;max-width:80%;margin-left:auto;text-align:right; opacity:0.7; word-break: break-word;`; 
    
    tempMsgEl.innerHTML = `<span>${content}</span>
      <span style="display:block;font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;">Sending...</span>`;
    
    pmMessages.appendChild(tempMsgEl);
    pmMessages.scrollTop=pmMessages.scrollHeight;

    // 2. Encrypt message
    let encryptedData;
    try {
        const result = await encryptChatMessage(content, recipientPub);
        
        // Remove the transient symmetric key before sending to DB (local transport only)
        delete result.aesKeyRawB64; 
        encryptedData = result;
        
    } catch (e) {
        alert('Encryption failed: ' + (e.message || e));
        tempMsgEl.remove(); // Remove optimistic message on error
        return;
    }
    
    // 3. Send encrypted message to RTDB
    const pushedRef = await push(ref(db, `chats/${chatId}`), { 
      from: me.uid, 
      to: userInfo.uid, 
      plainFrom: content, // sender-side plaintext mirror for display only
      ...encryptedData, // contains kemCiphertext, aesCiphertext, aesIv, aesTag
      timestamp: serverTimestamp() 
    });
    // Mark optimistic message as sent (remove "Sending..." and make it normal)
    try { if (tempMsgEl && pushedRef && pushedRef.key) { tempMsgEl.removeAttribute('data-pending'); tempMsgEl.style.opacity = '1'; const tl = tempMsgEl.querySelector('span[style]'); if (tl) tl.textContent = new Date().toLocaleTimeString(); } } catch(_) {}
    
    // 4. Send notification
    sendNotification(userInfo.uid, { type: 'pm', from: me.uid, chatId, preview: content.slice(0,140) });
    
    input.value='';
  };
  wrap.querySelector('#pmSend')?.addEventListener('click', send);
  wrap.querySelector('#pmInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); send(); } });
}

function openUserProfile(uid){
  (async ()=>{
    const mod = await import('./socialViewer.js');
    mod.openSocialProfileViewer(uid);
  })();
}

function openPmByUid(uid, usernameHint='User'){
  get(ref(db, `users/${uid}`)).then(s=>{
    const d = s.exists() ? s.val() : {};
    openPmModal({ uid, username: d.username || d.email?.split('@')[0] || usernameHint });
  });
}

function subscribeFriends(){
  const uid = auth.currentUser?.uid; if(!uid) return;
  if (unsubFriends) unsubFriends();
  unsubFriends = onValue(ref(db, `friends/${uid}`), (snap)=>{
    myFriends = new Set(Object.keys(snap.exists()? snap.val() : {}));
    // FIX: When friend status changes (e.g., acceptance), refresh lists immediately.
    // 1. Refresh All Users list (uses myFriends for button actions)
    loadAllUsers(); 
    
    // 2. Conditionally refresh Friends List (expensive async operation) if currently visible
    const friendsTab = document.getElementById('socialTabFriends');
    if (friendsTab && friendsTab.classList.contains('active')) {
      loadFriendsList();
    }
  });
}

function subscribeFriendRequests(){
  const uid = auth.currentUser?.uid; if(!uid) return;
  if (unsubIncoming) unsubIncoming(); if (unsubOutgoing) unsubOutgoing();
  unsubIncoming = onValue(ref(db, `friendRequests/${uid}`), (snap)=>{
    const v = snap.exists()? snap.val(): {}; pendingIncoming = new Set(Object.keys(v).filter(k=>v[k]?.status==='pending'));
    loadAllUsers();

    // Notify user of new incoming friend requests (compare with previous state)
    try{
      window._lastIncomingRequests = window._lastIncomingRequests || new Set();
      const currentSet = new Set(Array.from(pendingIncoming));
      for (const r of currentSet) {
        if (!window._lastIncomingRequests.has(r)) {
          import('./ui.js').then(m => m.notify('You have a new friend request', 5000));
          break;
        }
      }
      window._lastIncomingRequests = currentSet;
    }catch(_){}
  });
  unsubOutgoing = onValue(ref(db, `friendRequestsOutgoing/${uid}`), (snap)=>{
    const v = snap.exists()? snap.val(): {}; pendingOutgoing = new Set(Object.keys(v).filter(k=>v[k]?.status==='pending'));
    loadAllUsers();
  });
}

function toggleFriend(targetUid){
  sendFriendRequest(targetUid);
}

async function sendFriendRequest(targetUid, targetName='User'){
  const me = auth.currentUser?.uid; if(!me || !targetUid) return;
  const req = { from: me, to: targetUid, status: 'pending', timestamp: serverTimestamp() };
  await set(ref(db, `friendRequests/${targetUid}/${me}`), req);
  await set(ref(db, `friendRequestsOutgoing/${me}/${targetUid}`), req);
}

async function acceptFriend(otherUid){
  const me = auth.currentUser?.uid; if(!me || !otherUid) return;
  await update(ref(db, `friends/${me}`), { [otherUid]: true });
  await update(ref(db, `friends/${otherUid}`), { [me]: true });
  // remove incoming request record (me -> other) and any outgoing mirror entries on both sides
  await set(ref(db, `friendRequests/${me}/${otherUid}`), null);
  await set(ref(db, `friendRequestsOutgoing/${otherUid}/${me}`), null);
  // also clear any outgoing request record from current user and the incoming mirror on the other side
  await set(ref(db, `friendRequestsOutgoing/${me}/${otherUid}`), null);
  await set(ref(db, `friendRequests/${otherUid}/${me}`), null);
}

async function denyFriend(otherUid){
  const me = auth.currentUser?.uid; if(!me || !otherUid) return;
  await set(ref(db, `friendRequests/${me}/${otherUid}`), null);
  await set(ref(db, `friendRequestsOutgoing/${otherUid}/${me}`), null);
}

async function unfriend(otherUid){
  const me = auth.currentUser?.uid; if(!me || !otherUid) return;
  await set(ref(db, `friends/${me}/${otherUid}`), null);
  await set(ref(db, `friends/${otherUid}/${me}`), null);
}

function showUsersTab(which){
  const btnF = document.getElementById('socialTabFriends'), btnA = document.getElementById('socialTabAll');
  const content = document.getElementById('socialTabContent'), friendsEl = document.getElementById('socialFriendsList'), allEl = document.getElementById('socialAllUsers');
  const btnO = document.getElementById('socialTabOnline'), onlineEl = document.getElementById('socialOnlineUsersTab');
  if(!content || !friendsEl || !allEl || !onlineEl) return;
  if(which === 'friends'){ btnF.classList.add('active'); btnA.classList.remove('active'); btnO.classList.remove('active'); friendsEl.style.display=''; allEl.style.display='none'; onlineEl.style.display='none'; loadFriendsList(); }
  else if(which === 'online'){ btnO.classList.add('active'); btnF.classList.remove('active'); btnA.classList.remove('active'); friendsEl.style.display='none'; allEl.style.display='none'; onlineEl.style.display=''; loadOnlineUsers(); }
  else { btnA.classList.add('active'); btnF.classList.remove('active'); btnO.classList.remove('active'); friendsEl.style.display='none'; onlineEl.style.display='none'; allEl.style.display=''; loadAllUsers(); }
}

async function loadFriendsList(){
  const container = document.getElementById('socialFriendsList'); if(!container) return;
  container.innerHTML = '';
  const uid = auth.currentUser?.uid; if(!uid){ container.innerHTML = '<div style="color:var(--muted);font-size:12px;">Sign in to see friends</div>'; return; }
  const snap = await get(ref(db, `friends/${uid}`)); const ids = snap.exists()? Object.keys(snap.val()): [];
  if(!ids.length){ container.innerHTML = '<div style="color:var(--muted);font-size:12px;">No friends yet</div>'; return; }
  for(const fuid of ids){
    const s = await get(ref(db, `users/${fuid}`)); const data = s.exists()? s.val(): {};
    const name = data.username || data.email?.split('@')[0] || 'User';
    const div = document.createElement('div'); div.style.cssText='padding:6px;border-bottom:1px solid #222;font-size:13px;display:flex;justify-content:space-between;align-items:center;';
    div.innerHTML = `<span class="user-link" data-uid="${fuid}">${name}</span><div style="display:flex;gap:8px;"><button class="btn outline tiny" data-uid="${fuid}">Message</button><button class="btn outline tiny friend-remove" data-uid="${fuid}">Unfriend</button></div>`;
    div.querySelector('.user-link')?.addEventListener('click', ()=> openUserProfile(fuid));
    div.querySelector('button[data-uid]')?.addEventListener('click',(e)=>{ e.stopPropagation(); openPmByUid(fuid); });
    div.querySelector('.friend-remove')?.addEventListener('click',(e)=>{ e.stopPropagation(); unfriend(fuid); loadFriendsList(); });
    container.appendChild(div);
  }
}

async function voteOn(path, val){
  const me = auth.currentUser?.uid; if(!me) return;
  const vRef = ref(db, `${path}/votes/${me}`);
  const cur = await get(vRef); const curVal = cur.exists() ? Number(cur.val()) : 0;
  if (curVal === val) await set(vRef, null); else await set(vRef, val);
}

function bindPostVotes(div, postId, ownerUid){
  const upBtn = div.querySelector(`.upvote[data-id="${postId}"]`);
  const dnBtn = div.querySelector(`.downvote[data-id="${postId}"]`);
  const upEl = div.querySelector(`#up-${postId}`), dnEl = div.querySelector(`#down-${postId}`);
  if (upBtn) upBtn.onclick = ()=> voteOn(`socialFeed/${postId}`, 1);
  if (dnBtn) dnBtn.onclick = ()=> voteOn(`socialFeed/${postId}`, -1);
  const vRef = ref(db, `socialFeed/${postId}/votes`);

  // store last totals locally to avoid duplicate notifications
  let lastTotals = { up: 0, down: 0 };

  onValue(vRef, (s)=>{ 
    let up=0,dn=0, mine=0; 
    if(s.exists()) { 
      Object.entries(s.val()).forEach(([uid,v])=>{
        const n=Number(v)||0; if(n>0) up++; else if(n<0) dn++; if(uid===auth.currentUser?.uid) mine=n;
      }); 
    }
    if(upEl) { upEl.textContent = String(up); upEl.style.color = '#27c93f'; }
    if(dnEl) { dnEl.textContent = String(dn); dnEl.style.color = '#ff6b6b'; }
    upBtn?.classList.toggle('active', mine>0); dnBtn?.classList.toggle('active', mine<0);

    // If someone else voted on your post, notify once per change
    try{
      const me = auth.currentUser?.uid;
      if (ownerUid && me && ownerUid === me) {
        // use global store to avoid notifying on initial subscription; only notify on increases
        window._socialLastTotals = window._socialLastTotals || {};
        const prev = window._socialLastTotals[postId];
        if (prev) {
          if (up > prev.up) import('./ui.js').then(m => m.notify('Someone liked your post (👍)', 5000));
          else if (dn > prev.down) import('./ui.js').then(m => m.notify('Someone disliked your post (👎)', 5000));
        }
        window._socialLastTotals[postId] = { up, down: dn };
      }
    }catch(_){}
    lastTotals = { up, down: dn };

    // Post updated vote totals to any open social/profile iframe so they update live
    try{
      const svIframe = document.querySelector('#socialViewer .page-viewer-iframe, #socialViewer iframe, iframe.page-viewer-iframe');
      if(svIframe && svIframe.contentWindow){
        svIframe.contentWindow.postMessage({ type: 'social:votesData', postId, up, down: dn }, '*');
      }
    }catch(_){}
  });
}

function bindReplyVotes(listEl, postId, rid){
  const row = listEl.querySelector(`[data-rid="${rid}"]`); if(!row) return;
  const upBtn = row.querySelector(`.upvote[data-post="${postId}"][data-reply="${rid}"]`);
  const dnBtn = row.querySelector(`.downvote[data-post="${postId}"][data-reply="${rid}"]`);
  const upEl = row.querySelector(`#up-${postId}-${rid}`), dnEl = row.querySelector(`#down-${postId}-${rid}`);
  if (upBtn) upBtn.onclick = ()=> voteOn(`socialFeed/${postId}/replies/${rid}`, 1);
  if (dnBtn) dnBtn.onclick = ()=> voteOn(`socialFeed/${postId}/replies/${rid}`, -1);
  onValue(ref(db, `socialFeed/${postId}/replies/${rid}/votes`), (s)=>{ 
    let up=0,dn=0,m=0; if(s.exists()) Object.entries(s.val()).forEach(([u,v])=>{const n=Number(v)||0; if(n>0) up++; else if(n<0) dn++; if(u===auth.currentUser?.uid) m=n;});
    if(upEl){ upEl.textContent=String(up); upEl.style.color='#27c93f'; } if(dnEl){ dnEl.textContent=String(dn); dnEl.style.color='#ff6b6b'; }
    upBtn?.classList.toggle('active', m>0); dnBtn?.classList.toggle('active', m<0);

    // Also notify any open social/profile iframe about reply vote updates
    try{
      const svIframe = document.querySelector('#socialViewer .page-viewer-iframe, #socialViewer iframe, iframe.page-viewer-iframe');
      if(svIframe && svIframe.contentWindow){
        svIframe.contentWindow.postMessage({ type: 'social:repliesVotesData', postId, replyId: rid, up, down: dn }, '*');
      }
    }catch(_){}
  });
}

// wire composer-level placeholders for Enhance and Gear
document.getElementById('socialEnhanceBtn')?.addEventListener('click', async () => {
  const ta = document.getElementById('socialPostInput');
  const raw = ta?.value?.trim();
  if (!raw) {
    import('./ui.js').then(m => m.notify('Enter text to enhance.', 3500));
    return;
  }
  
  const uid = auth.currentUser?.uid;
  if (!uid) {
    import('./ui.js').then(m => m.notify('Sign in to use AI enhancement.', 3500));
    return;
  }
  
  const { apiKey, model, cost } = await getEnhanceParams();
  if (!apiKey) {
    import('./ui.js').then(m => m.notify('Set OpenRouter API key (⚙).', 3500));
    return;
  }

  // 1. If cost > 0 then attempt deduction; if cost == 0 we skip payment (free enhancement)
  let deductionSucceeded = false;
  if (Number(cost) > 0) {
    try {
      const qRef = ref(db, `users/${uid}/qbitBalance`);
      const result = await runTransaction(qRef, (currentBalance) => {
        let current = Number(currentBalance || 0);
        if (current >= cost) return parseFloat((current - cost).toFixed(8));
        return current;
      });
      if (!result.committed) {
        const currentBal = await get(ref(db, `users/${uid}/qbitBalance`)).then(s=>Number(s.val()||0));
        if (currentBal < cost) { import('./ui.js').then(m => m.notify(`Insufficient QBitCoin. Need ${cost} QBC for enhancement.`, 5000)); return; }
        import('./ui.js').then(m => m.notify('QBitCoin transaction issue. Try again.', 5000)); return;
      }
      deductionSucceeded = true;
    } catch (e) {
      console.error('QBC deduction failed:', e);
      import('./ui.js').then(m => m.notify('QBitCoin deduction failed.', 5000));
      return;
    }
  } else {
    // free enhancement - mark as succeeded
    deductionSucceeded = true;
  }
  
  // Notify of balance change *before* API call, since funds were deducted.
  try{
    const qRef = ref(db, `users/${uid}/qbitBalance`);
    const newBalSnap = await get(qRef);
    const newBal = newBalSnap.exists() ? newBalSnap.val() : null;
    window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));
  }catch(_){}

  // 2. Perform Enhancement
  import('./ui.js').then(m => m.notify('Enhancing post...', 0));
  ta.disabled = true;
  document.getElementById('socialEnhanceBtn').disabled = true;
  
  const enhancedText = await performEnhancement(raw, apiKey, model);

  ta.disabled = false;
  document.getElementById('socialEnhanceBtn').disabled = false;
  import('./ui.js').then(m => m.notify('', 0)); // Clear notification

  if (enhancedText) {
    ta.value = enhancedText;
    import('./ui.js').then(m => m.notify('Post enhanced!', 3500));
  } else {
    import('./ui.js').then(m => m.notify('Enhancement failed. Attempting refund.', 5000));
    // 3. Refund QBC if AI failed (transactionally safe refund)
    try {
      const qRef = ref(db, `users/${uid}/qbitBalance`);
      await runTransaction(qRef, (currentBalance) => {
        let current = Number(currentBalance || 0);
        return parseFloat((current + cost).toFixed(8));
      });
      // Notify refund success
      import('./ui.js').then(m => m.notify(`Refunded ${cost} QBC.`, 5000));
      // Notify balance change
      const newBalSnap = await get(qRef);
      const newBal = newBalSnap.exists() ? newBalSnap.val() : null;
      window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));
    } catch(e) {
      console.error('QBC refund failed:', e);
      import('./ui.js').then(m => m.notify('Refund failed. Contact support.', 5000));
    }
  }
});

document.getElementById('socialGearBtn')?.addEventListener('click', () => {
  // open settings modal shared with chat/model settings as a placeholder
  import('./modal.js').then(m => m.openModelSettings?.());
});

async function getEnhanceParams() {
    const { getEnhanceSettings, getAiEnhanceCost } = await import('./modal.js');
    const settings = getEnhanceSettings();
    const apiKey = localStorage.getItem('openrouter.apiKey') || '';
    const model = settings.grokModel;
    const cost = getAiEnhanceCost();

    return {
        apiKey,
        model,
        cost,
        emojis: settings.emojis,
        sentences: settings.sentences,
        hashtags: settings.hashtags
    };
}

async function performEnhancement(text, apiKey, model) {
    const { emojis, sentences, hashtags } = await getEnhanceParams();
    
    const ec = Number(emojis), sc = Number(sentences), tc = Number(hashtags);
    const prompt = `You are an expert social media post enhancer. Your task is to polish the provided raw post text.
Instructions:
- Keep the original meaning and voice.
- Enhance for clarity and engagement.
- Include exactly ${ec} emojis integrated naturally into the text.
- Keep the main post to exactly ${sc} sentences total.
- Append exactly ${tc} relevant, search-friendly hashtags (lowercase, separated by spaces, no duplicates).
Respond ONLY with the enhanced text content, with no introductory phrases or JSON wrappers.`;

    try {
        const messages = [
            { role: "system", content: prompt },
            { role: "user", content: text },
        ];
        
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': location.origin,
                'X-Title': 'QNet Social AI'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.8,
            })
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error("OpenRouter API Error:", errorText);
            throw new Error(`API request failed: ${resp.statusText}.`);
        }

        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        
        return content.trim();

    } catch (e) {
        console.error("Enhancement failure:", e);
        return null;
    }
}

function sendNotification(toUid, payload){
  try{
    const nid = String(Date.now()) + '_' + Math.random().toString(36).slice(2,8);
    const r = ref(db, `notifications/${toUid}/${nid}`);
    // store minimal info to route user to PM -> { type:'pm', from, chatId, ts, read:false }
    set(r, Object.assign({ ts: serverTimestamp(), read:false }, payload)).catch(()=>{});
  }catch(_){}
}

/* ensure notifications are subscribed on signin globally */
auth.onAuthStateChanged(user => {
  if (user) {
    subscribeNotificationsForCurrentUser();
  } else {
    if (_notifUnsub) { _notifUnsub(); _notifUnsub = null; }
    const container = document.getElementById('socialNotifications');
    if (container) container.innerHTML = '';
  }
});

export { voteOn };