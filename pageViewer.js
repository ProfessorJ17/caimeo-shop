import { combineSrcDoc } from './editor.js';

export const navState = {
  stack: [],
  index: -1,
  push(srcdoc, label){
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ srcdoc, label });
    this.index = this.stack.length - 1;
  },
  back(){
    if(this.index > 0){ this.index--; if(typeof this.onchange === 'function') this.onchange(); }
  },
  forward(){
    if(this.index < this.stack.length - 1){ this.index++; if(typeof this.onchange === 'function') this.onchange(); }
  },
  current(){ return this.stack[this.index] || null; }
};

export function make404(label) {
  return `<div style="font-family:Noto Sans,system-ui;padding:24px"><h1>404 — Page Not Found</h1><p>The requested page "${label}" does not exist.</p><button onclick="parent.postMessage({type:'qnet:viewerClose'},'*')" style="margin-top:10px;padding:8px 10px;border:1px solid #222;border-radius:6px;background:#fff;cursor:pointer">Back</button></div>`;
}

export function extractQuantumSlug(input){
  try{
    const s = String(input||'').trim(); 
    if(!s) return '';
    if (/^https?:/i.test(s)) { 
      const u = new URL(s); 
      const h = u.hostname.toLowerCase(); 
      return /\.(clos|dafy|taur|cele|life|end)$/i.test(h) ? h : ''; 
    }
    if (/^QTTPS:\/\//i.test(s)) { 
      const h = s.replace(/^QTTPS:\/\//i,'').split(/[/?#]/)[0].toLowerCase(); 
      return /\.(clos|dafy|taur|cele|life|end)$/i.test(h) ? h : ''; 
    }
    const base = s.replace(/^\.\/_/,'').split(/[?#]/)[0].split('/')[0].toLowerCase();
    return /\.(clos|dafy|taur|cele|life|end)$/i.test(base) ? base : '';
  }catch{ 
    return ''; 
  }
}

export async function leetIPv6FromText(t){
  const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)));
  const hex=[...h].map(x=>x.toString(16).padStart(2,"0")).join("");
  const parts=[]; 
  for(let i=0;i<6;i++){ 
    const s=(i*3)%hex.length; 
    parts.push(hex.slice(s,s+4)); 
  }
  const W=["h4x","pwn","r00","n1x","b1n","h3x","sec"]; 
  const w1=W[h[0]%W.length], w2=W[h[5]%W.length];
  return `${parts[0]}:${parts[1]}:${w1}::${w2}:${parts[4]}:${parts[5]}`;
}

export async function leetFromText(t){
  const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)));
  const hex=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  const words=["1337","h4x0r","r00t","tls13","ipv6","b00t","s3rv","c0d3"];
  const g=[];
  for(let i=0;i<16;i++) g.push(i%2===0 ? words[b[i%b.length]%words.length] : hex.slice(i*4,(i+1)*4));
  return g.join(":");
}