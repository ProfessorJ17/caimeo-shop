import { db, auth } from './auth.js';
import { ref, get, push, serverTimestamp, onValue, set } from 'firebase/database';
import { voteOn } from './social.js';

const nav = { 
  stack: [], 
  i: -1, 
  push(p){ 
    this.stack=this.stack.slice(0,this.i+1); 
    this.stack.push(p); 
    this.i=this.stack.length-1; 
  }, 
  back(){ 
    if(this.i>0){ 
      this.i--; 
      return this.stack[this.i]; 
    } 
  }, 
  fwd(){ 
    if(this.i<this.stack.length-1){ 
      this.i++; 
      return this.stack[this.i]; 
    } 
  }, 
  cur(){ 
    return this.stack[this.i]||null; 
  } 
};
let toolbar=null, iframe=null;
let voteListeners = {}; // New: Listener tracking

function ensurePanel(){
  if (document.getElementById('socialViewer')) return;

  const panel = document.createElement('div');
  panel.id = 'socialViewer';
  panel.className = 'page-viewer-panel';

  toolbar = document.createElement('div');
  toolbar.id = 'svToolbar';
  toolbar.className = 'page-viewer-toolbar';
  
  // Toolbar content
  const backBtn = document.createElement('button');
  backBtn.className = 'btn browser-nav icon';
  backBtn.textContent = '←'; backBtn.title = 'Back';
  backBtn.addEventListener('click', ()=> {
    const p = nav.back(); if(p) render(p); setUrl(nav.cur().url);
  });
  
  const forwardBtn = document.createElement('button');
  forwardBtn.className = 'btn browser-nav icon';
  forwardBtn.textContent = '→'; forwardBtn.title = 'Forward';
  forwardBtn.addEventListener('click', ()=> {
    const p = nav.fwd(); if(p) render(p); setUrl(nav.cur().url);
  });
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn browser-nav icon';
  closeBtn.textContent = '×'; closeBtn.title = 'Close';
  closeBtn.addEventListener('click', closeViewer);
  
  const urlInput = document.createElement('input');
  urlInput.id = 'svUrl';
  urlInput.className = 'page-viewer-url';
  urlInput.type = 'text';
  urlInput.autocomplete = 'off';
  urlInput.setAttribute('aria-label','URL');
  urlInput.style.flex = '1';
  urlInput.style.minWidth = '220px';
  
  const goBtn = document.createElement('button');
  goBtn.className = 'btn icon';
  goBtn.textContent = 'Go'; goBtn.title = 'Load URL';
  goBtn.addEventListener('click', onGo);
  
  urlInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); onGo(); } });
  
  toolbar.appendChild(backBtn);
  toolbar.appendChild(forwardBtn);
  toolbar.appendChild(closeBtn);
  toolbar.appendChild(urlInput);
  toolbar.appendChild(goBtn);

  iframe = document.createElement('iframe');
  iframe.className = 'page-viewer-iframe';

  panel.appendChild(iframe);
  
  const socialView = document.getElementById('socialView');
  const mainCard = document.querySelector('.card') || document.body;
  const topbarActions = document.getElementById('topbarActions');
  const hamb = document.getElementById('toggleUsersSidebarBtn');

  // Temporarily hide tabs/views while viewer is open
  ['tabProjects','tabQuantum','tabSocial','tabAdmin'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) { newProjectBtn.classList.add('hidden'); newProjectBtn.style.display = 'none'; }
  
  // Move Users sidebar out of social view and overlay controls on topbar
  const usersSidebar = document.getElementById('usersSidebar');
  
  if (usersSidebar && socialView) {
    document.body.appendChild(usersSidebar);
    usersSidebar.classList.remove('open');
    socialView.classList.add('hidden');
    socialView.classList.remove('sidebar-open');
    document.body.classList.remove('sidebar-open');
  } else {
    socialView?.classList.add('hidden');
  }

  // Use topbar for toolbar
  if(topbarActions) { topbarActions.appendChild(toolbar); }
  
  // Ensure hamburger button is visible but positioned differently (over topbar content)
  if (hamb) { 
    hamb.classList.remove('hidden'); 
    hamb.style.display = ''; 
    hamb.classList.add('hamb-over'); 
  }

  // Insert panel after the account/social view container
  mainCard.appendChild(panel);
}

export async function openSocialProfileViewer(uid){
  const uSnap = await get(ref(db, `users/${uid}`)).catch(()=>null);
  const u = uSnap && uSnap.exists() ? uSnap.val() : {};
  const name = (u.username || (u.email ? u.email.split('@')[0] : 'user')).toLowerCase();
  openSocialViewer(`${name}.social`);
  
  // Fetch posts now to prepare for subscription
  const feedSnap = await get(ref(db, 'socialFeed')).catch(()=>null);
  const posts = [];
  if (feedSnap && feedSnap.exists()) feedSnap.forEach(c=>{ const v=c.val(); if(v.uid===uid) posts.push({ id: c.key, ...v }); });
  
  const html = await renderProfileHtml(uid, u, posts).catch(()=>'<div class="wrap"><div class="card"><h2 style="margin:0 0 6px;">Profile</h2><div style="color:#bfbfbf">Unable to load profile.</div></div></div>');
  pushAndRender({ url: `${name}.social`, html });
  
  // Subscribe to votes after rendering
  subscribeToVotes(posts);
}

export function openSocialViewer(url='home.social'){
  ensurePanel();
  setUrl(url);
  if (url === 'home.social') { 
    pushAndRender({ url, html: renderHomeHtml() }); 
  }
  // If navigating to a non-profile page, unsubscribe old listeners
  if (url !== 'home.social' && !url.match(/\.social$/i)) {
    unsubscribeFromAllVotes();
  }
}

function closeViewer(){
  unsubscribeFromAllVotes(); // Clean up listeners on close
  document.getElementById('socialViewer')?.remove();
  toolbar?.remove(); toolbar=null; iframe=null;
  document.getElementById('socialView')?.classList.remove('hidden');
  ['tabProjects','tabQuantum','tabSocial','tabAdmin'].forEach(id=>document.getElementById(id)?.classList.remove('hidden'));
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) { newProjectBtn.classList.add('hidden'); newProjectBtn.style.display = 'none'; }
  const hamb = document.getElementById('toggleUsersSidebarBtn');
  if (hamb) { hamb.classList.remove('hidden'); hamb.style.display = ''; hamb.classList.remove('hamb-over'); }

  // restore Users Sidebar back into Social-Q view and close it
  const usersSidebar = document.getElementById('usersSidebar');
  const socialView = document.getElementById('socialView');
  if (usersSidebar && socialView) { socialView.appendChild(usersSidebar); usersSidebar.classList.remove('open'); document.body.classList.remove('sidebar-open'); }

  const pqGate = document.getElementById('pqGate');
  const projectsList = document.getElementById('projectsList');
  // Don't automatically show these when closing - let tab handlers control visibility
}

function unsubscribeFromAllVotes() {
  Object.values(voteListeners).forEach(unsub => unsub());
  voteListeners = {};
}

function subscribeToVotes(posts) {
  unsubscribeFromAllVotes(); // Clear old listeners first
  const meUid = auth.currentUser?.uid;

  posts.forEach(p => {
    const postId = p.id;
    const votesRef = ref(db, `socialFeed/${postId}/votes`);
    
    // Set up listener for post votes
    const unsubscribe = onValue(votesRef, (snap) => {
      let up = 0, dn = 0;
      let myVote = 0;
      
      if (snap.exists()) {
        Object.entries(snap.val()).forEach(([uid, val]) => {
          const n = Number(val) || 0;
          if (n > 0) up++; else if (n < 0) dn++;
          if (uid === meUid) myVote = n;
        });
      }

      // Post message to the iframe
      const msg = { type: 'social:votesData', postId, up, down: dn, myVote };
      iframe?.contentWindow?.postMessage(msg, '*');

      // Notify the owner (if me) when someone else votes
      try {
        if (meUid && p.uid === meUid) {
          // persist previous totals across subscriptions and avoid notifying on initial fetch
          window._svVoteTotals = window._svVoteTotals || {};
          const prev = window._svVoteTotals[postId];
          if (prev) {
            if (up > prev.up) import('./ui.js').then(m=>m.notify('Someone liked your post (👍)', 5000));
            else if (dn > prev.down) import('./ui.js').then(m=>m.notify('Someone disliked your post (👎)', 5000));
          }
          // always update stored totals after comparison
          window._svVoteTotals[postId] = { up, down: dn };
        }
      } catch (_) {}
    });
    
    voteListeners[postId] = unsubscribe;
  });
}

function setUrl(u){ toolbar?.querySelector('#svUrl') && (toolbar.querySelector('#svUrl').value = u); }

function render(page){ setUrl(page.url); iframe.srcdoc = wrapDoc(page.html); }

function pushAndRender(p){ nav.push(p); render(p); }

function onGo(){
  const v = (toolbar.querySelector('#svUrl').value||'').trim().toLowerCase();
  if (!v) return;
  if (v === 'home.social') { pushAndRender({ url: v, html: renderHomeHtml() }); return; }
  const m = v.match(/^([a-z0-9_-]+)\.social$/i);
  if (m) return openProfileByHandle(m[1]);
  pushAndRender({ url: v, html: renderNotFound(v) });
}

async function openProfileByHandle(handle){
  const usersSnap = await get(ref(db, 'users'));
  const all = usersSnap.exists() ? usersSnap.val() : {};
  let targetUid=null, data=null;
  for (const [id, u] of Object.entries(all)) {
    const uname = (u.username || (u.email ? u.email.split('@')[0] : '')).toLowerCase();
    if (uname === handle.toLowerCase()) { targetUid=id; data=u; break; }
  }
  if (!targetUid) return pushAndRender({ url: `${handle}.social`, html: renderNotFound(`${handle}.social`) });
  
  // Refetch posts to subscribe to votes
  const feedSnap = await get(ref(db, 'socialFeed')).catch(()=>null);
  const posts = [];
  if (feedSnap && feedSnap.exists()) feedSnap.forEach(c=>{ const v=c.val(); if(v.uid===targetUid) posts.push({ id: c.key, ...v }); });
  
  const html = await renderProfileHtml(targetUid, data||{}, posts);
  pushAndRender({ url: `${handle}.social`, html });
  subscribeToVotes(posts); // Subscribe here too
}

function wrapDoc(body){ return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Noto Sans,system-ui;background:#0f0f0f;color:#fff;margin:0}a{color:#1e90ff;text-decoration:none} .wrap{max-width:900px;margin:0 auto;padding:16px} .card{background:#0b0b0b;border:1px solid #222;border-radius:10px;padding:12px;margin-bottom:12px}
.vote-up, .vote-down { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:6px 8px; border-radius:8px; border:1px solid rgba(30,144,255,0.12); background: #1e90ff; color: #fff; font-weight:700; cursor:pointer; min-width:40px; }
.vote-up.active { border: 2px solid #27c93f; box-shadow: 0 0 8px rgba(39,201,63,0.5); }
.vote-down { background: transparent; color: #1e90ff; border:1px solid rgba(30,144,255,0.18); }
.vote-down.active { background: #ff6b6b; color: #fff; border: 2px solid #ff6b6b; box-shadow: 0 0 8px rgba(255,107,107,0.5); }
.vote-up:hover { filter:brightness(0.95); }
.vote-down:hover { background: rgba(30,144,255,0.06); }
</style></head><body>${body}</body></html>`; }

function renderHomeHtml(){
  return `<div class="wrap"><div class="card"><h2 style="margin:0 0 6px;">Home</h2><div style="color:#bfbfbf">Type a username like "j17.social" above to open their profile.</div></div></div>`;
}

function renderNotFound(u){
  return `<div class="wrap"><div class="card"><h2 style="margin:0 0 6px;">Not found</h2><div style="color:#bfbfbf">No page for ${u}</div></div></div>`;
}

function renderContentWithImages(text){
  const allowed=/\.(png|jpe?g|gif|webp|svg)$/i;
  const clean=(u)=>String(u||'').trim().replace(/[)"'>]+$/,'');
  let s=String(text||''), segs=[], m, out=[];
  while((m=s.match(/\[img\]([\s\S]+?)\[\/img\]/i))){ const pre=s.slice(0,m.index); if(pre) segs.push({t:pre}); const url=clean(m[1]); segs.push({img:allowed.test(url)?url:null}); s=s.slice(m.index+m[0].length); }
  if(s) segs.push({t:s});
  const linkRe=/(https?:\/\/[^\s<]+)(?=$|\s)/gi, imgTpl=(u)=>`<div style="margin-top:6px;"><img src="${u}" alt="" style="max-width:100%;border:1px solid #222;border-radius:6px;"></div>`;
  segs.forEach(p=>{
    if(p.img){ out.push(imgTpl(p.img)); }
    else if(p.t){ out.push(p.t.replace(linkRe,(u)=>{ const cu=clean(u); return allowed.test(cu)?imgTpl(cu):`<a href="${cu}" target="_blank" rel="noopener">${cu}</a>`; })); }
  });
  return out.join('');
}

async function renderProfileHtml(uid, u, posts){
  const name = u.username || (u.email ? u.email.split('@')[0] : 'User');
  const email = u.email || '';
  const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown';
  const avatar = u.avatarUrl || 'https://unavatar.io/github/' + encodeURIComponent(name);

  // add: check presence for online indicator
  const presSnap = await get(ref(db, `presence/${uid}`)).catch(()=>null);
  const pres = presSnap && presSnap.exists() ? presSnap.val() : {};
  const isOnline = !!pres?.online;

  // posts array is passed in now
  posts.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
  const postsHtml = posts.map(p=>{
    const replyCount = p.replies ? Object.keys(p.replies).length : 0;
    return `<div class="card" data-post="${p.id}">
      <div style="font-size:13px;word-break:break-word;">${renderContentWithImages(p.content||'')}</div>
      <div style="margin:6px 0;display:flex;align-items:center;gap:10px;">
        <button class="vote-up" data-post="${p.id}" title="Thumbs up">👍</button><span id="up-${p.id}" style="min-width:16px;color:#27c93f">0</span>
        <button class="vote-down" data-post="${p.id}" title="Thumbs down">👎</button><span id="down-${p.id}" style="min-width:16px;color:#ff6b6b">0</span>
      </div>
      <!-- Enhance / Gear controls intentionally omitted from .social profile view -->
      <div style="font-size:11px;color:#bfbfbf;margin-top:2px;">${p.timestamp?new Date(p.timestamp).toLocaleString():''}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
        <button class="toggle-replies" data-post="${p.id}" aria-expanded="false" style="padding:6px 10px;border:1px solid #222;border-radius:8px;background:#0b0b0b;color:#1e90ff;cursor:pointer">▶ ${replyCount} ${replyCount===1?'reply':'replies'}</button>
      </div>
      <div id="replies-${p.id}" style="display:none;margin-top:6px;"></div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <input id="replyInput-${p.id}" type="text" placeholder="Write a reply..." style="flex:1;background:#0b0b0b;color:#fff;border:1px solid #222;border-radius:6px;padding:6px;font-size:13px;" />
        <button class="send-reply" data-post="${p.id}" style="padding:6px 10px;border:1px solid #222;border-radius:8px;background:#1a1a1a;color:#fff;cursor:pointer">Reply</button>
      </div>
    </div>`;
  }).join('') || `<div class="card" style="color:#bfbfbf">No posts yet.</div>`;
  return `
  <div class="wrap">
    <div class="card">
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="${avatar}" alt="Avatar" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:1px solid #222" />
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-weight:800;font-size:18px;">${name}</div>
            ${isOnline ? '<span style="display:inline-flex;align-items:center;gap:6px;color:#4caf50;font-size:13px;"><span style="width:8px;height:8px;background:#4caf50;border-radius:50%;display:inline-block;"></span>Online now</span>' : ''}
          </div>
          <div style="font-size:12px;color:#bfbfbf">${email}</div>
          <div style="font-size:12px;color:#bfbfbf">Joined: ${joined}</div>
          <div style="font-size:12px;color:#bfbfbf">QBitCoin Balance: <strong>${(u.qbitBalance != null) ? String(u.qbitBalance) : '0'}</strong></div>
          <div style="margin-top:8px;display:flex;gap:6px;">
            <button onclick="parent.postMessage({type:'social:pm',uid:'${uid}'},'*')" style="padding:6px 10px;border:1px solid #222;border-radius:8px;background:#1a1a1a;color:#fff;cursor:pointer">Message</button>
            <button onclick="parent.postMessage({type:'social:addFriend',uid:'${uid}', username:'${encodeURIComponent(name)}'},'*')" style="padding:6px 10px;border:1px solid #222;border-radius:8px;background:#0b0b0b;color:#1e90ff;cursor:pointer">Add Friend</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card"><h3 style="margin:0 0 6px;">Posts</h3></div>
    ${postsHtml}
   <script>
     function renderReplies(listEl, replies){
       replies.sort(function(a,b){ return (a.timestamp||0)-(b.timestamp||0); });
       listEl.innerHTML = replies.map(function(r){
         var t = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
         // include a delete button that asks parent to remove the reply; parent enforces permission check
         return '<div style="padding:6px;border-bottom:1px solid #222;font-size:12px;display:flex;flex-direction:column;" data-rid="'+r.id+'">'
           + '<div style="display:flex;justify-content:space-between;"><div style="font-weight:700">'+(r.username||'User')+'</div>'
           + '<div><button class="delete-reply" data-post="'+(r.postId||'')+'" data-reply="'+r.id+'" style="padding:4px 8px;border-radius:6px;border:1px solid #222;background:#1a1a1a;color:#fff;cursor:pointer">🗑</button></div></div>'
           + '<div style="word-break:break-word;margin-top:6px;">'+(r.content||'')+'</div>'
           + '<div style="font-size:11px;color:#bfbfbf;margin-top:6px;">'+t+'</div></div>';
       }).join('');
       // wire delete buttons in iframe to ask parent to delete; parent will enforce permission check and remove
       listEl.querySelectorAll('.delete-reply').forEach(function(btn){
         btn.addEventListener('click', function(ev){
           ev.stopPropagation();
           if(!confirm('Delete this reply?')) return;
           window.parent.postMessage({ type: 'social:deleteReply', postId: btn.dataset.post, replyId: btn.dataset.reply }, '*');
         });
       });
     }
     document.addEventListener('click', function(e){
       var t = e.target;
       if(t && t.classList.contains('vote-up')){ parent.postMessage({ type:'social:vote', postId: t.dataset.post, value: 1 }, '*'); }
       if(t && t.classList.contains('vote-down')){ parent.postMessage({ type:'social:vote', postId: t.dataset.post, value: -1 }, '*'); }
       if(t && t.classList.contains('toggle-replies')){
         var pid = t.getAttribute('data-post'); var listEl = document.getElementById('replies-'+pid);
         var open = t.getAttribute('aria-expanded') === 'true';
         t.setAttribute('aria-expanded', (!open).toString());
         listEl.style.display = open ? 'none' : '';
         t.textContent = (open ? t.textContent.replace('▼','▶') : t.textContent.replace('▶','▼'));
         if(!open){ parent.postMessage({ type: 'social:getReplies', postId: pid }, '*'); }
       }
       if(t && t.classList.contains('send-reply')){
         var pid2 = t.getAttribute('data-post');
         var input = document.getElementById('replyInput-'+pid2);
         var content = (input && input.value || '').trim();
         if(!content) return;
         parent.postMessage({ type: 'social:addReply', postId: pid2, content: content }, '*');
         input.value = '';
       }
     });
     window.addEventListener('message', function(ev){
       var d = ev.data||{}; 
       if(d.type==='social:votesData' && d.postId){
         var up=document.getElementById('up-'+d.postId), dn=document.getElementById('down-'+d.postId);
         var upBtn = document.querySelector('.vote-up[data-post="'+d.postId+'"]');
         var dnBtn = document.querySelector('.vote-down[data-post="'+d.postId+'"]');
         if(up) { up.textContent=String(d.up||0); up.style.color='#27c93f'; }
         if(dn) { dn.textContent=String(d.down||0); dn.style.color='#ff6b6b'; }
         if(upBtn) upBtn.classList.toggle('active', (d.myVote||0)>0);
         if(dnBtn) dnBtn.classList.toggle('active', (d.myVote||0)<0);
       }
       if(d.type==='social:repliesData' && d.postId){
         var listEl = document.getElementById('replies-'+d.postId);
         if(listEl) renderReplies(listEl, d.replies||[]);
         var btn = document.querySelector('.toggle-replies[data-post="'+d.postId+'"]');
         if(btn){
           var count = (d.replies||[]).length;
           btn.textContent = (btn.getAttribute('aria-expanded')==='true'?'▼ ':'▶ ') + count + ' ' + (count===1?'reply':'replies');
         }
       }
     });
   </script>
  </div>
  `;
}

// handle PM clicks from iframe
window.addEventListener('message', (e)=>{
  if (e?.data?.type === 'social:pm' && e.data.uid) {
    import('./social.js').then(m=> m.default || m).then(mod=>{
      document.dispatchEvent(new CustomEvent('social:openPm', { detail: { uid: e.data.uid } }));
    });
  } else if (e?.data?.type === 'social:addFriend' && e.data.uid) {
    import('./social.js').then(m=> m.default || m).then(mod=>{
      // dispatch a custom event so social.js can react
      document.dispatchEvent(new CustomEvent('social:addFriend', { detail: { uid: e.data.uid } }));
    });
  } else if (e?.data?.type === 'social:getReplies' && e.data.postId) {
    (async ()=>{
      try{
        const rs = await get(ref(db, `socialFeed/${e.data.postId}/replies`));
        const arr=[]; if(rs.exists()) rs.forEach(c=>arr.push({ id:c.key, ...c.val() }));
        iframe?.contentWindow?.postMessage({ type:'social:repliesData', postId: e.data.postId, replies: arr }, '*');
      }catch(_){
        iframe?.contentWindow?.postMessage({ type:'social:repliesData', postId: e.data.postId, replies: [] }, '*');
      }
    })();
  } else if (e?.data?.type === 'social:addReply' && e.data.postId) {
    (async ()=>{
      try{
        const me = auth.currentUser; if(!me) return;
        const uSnap = await get(ref(db, `users/${me.uid}`));
        const d = uSnap.exists()? uSnap.val() : {};
        await push(ref(db, `socialFeed/${e.data.postId}/replies`), {
          uid: me.uid,
          username: d.username || me.displayName || (me.email||'').split('@')[0] || 'User',
          content: String(e.data.content||''),
          timestamp: serverTimestamp()
        });
        const rs = await get(ref(db, `socialFeed/${e.data.postId}/replies`));
        const arr=[]; if(rs.exists()) rs.forEach(c=>arr.push({ id:c.key, ...c.val() }));
        iframe?.contentWindow?.postMessage({ type:'social:repliesData', postId: e.data.postId, replies: arr }, '*');
      }catch(_){}
    })();
  } else if (e?.data?.type === 'social:getVotes' && e.data.postId) {
    // If persistent listeners failed or if this is needed as a fallback, ensure myVote is included
    (async ()=>{ try{
      const v = await get(ref(db, `socialFeed/${e.data.postId}/votes`));
      let up=0,dn=0, myVote=0; 
      const meUid = auth.currentUser?.uid;
      if(v.exists()) Object.entries(v.val()).forEach(([uid, val]) => { 
        const m=Number(val)||0; 
        if(m>0) up++; else if(m<0) dn++; 
        if(uid === meUid) myVote = m;
      });
      iframe?.contentWindow?.postMessage({ type:'social:votesData', postId: e.data.postId, up, down: dn, myVote }, '*');
    }catch(_){ iframe?.contentWindow?.postMessage({ type:'social:votesData', postId: e.data.postId, up:0, down:0, myVote:0 }, '*'); }})();
  } else if (e?.data?.type === 'social:vote' && e.data.postId && typeof e.data.value==='number') {
    (async ()=>{ try{
      // Use imported voteOn function to perform the RTDB update
      await voteOn(`socialFeed/${e.data.postId}`, e.data.value);
      // Persistent listener handles sending updates back to iframe
    }catch(_){}})();
  } else if (e?.data?.type === 'social:deleteReply' && e.data.postId && e.data.replyId) {
    // parent will handle deletion; ignore in iframe (this message path exists for symmetry)
  }
});