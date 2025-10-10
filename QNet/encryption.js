import { getEditorContent, getCurrentProject } from './editor.js';
import { db } from './auth.js';
import { getCurrentUserId } from './auth.js';
import { ref, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';
import { ml_kem768 } from 'https://esm.sh/@noble/post-quantum@0.5.1/ml-kem.js?bundle';

/**
 * Converts Uint8Array to Base64 string.
 * @param {Uint8Array} bytes
 */
export function bytesToB64(bytes){
  let s='',C=0x8000;
  for(let i=0;i<bytes.length;i+=C) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+C));
  return btoa(s);
}

/**
 * Converts Base64 string to Uint8Array.
 * @param {string} b64
 */
export function b64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function encryptAndUploadCurrentProject(){
  const { getEditorContent, getCurrentProject } = await import('./editor.js');
  const { db } = await import('./auth.js');
  const { getCurrentUserId } = await import('./auth.js');
  const { ref, set, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js');

  const uid = getCurrentUserId?.(); if(!uid){ alert('Sign in first.'); return; }
  
  // Validate slug if project has one
  const proj = getCurrentProject?.() || {};
  if (proj.page_slug) {
    try {
      const { ref: dbRef, get } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js');
      const { db } = await import('./auth.js');
      const safe = String(proj.page_slug).replace(/[.#$\[\]]/g, '_');
      const slugRef = dbRef(db, `projectSlugs/${safe}`);
      const snap = await get(slugRef);
      const owner = snap.exists() ? snap.val() : null;
      if (owner && owner !== proj.id) {
        alert(`The domain "${proj.page_slug}" is already taken. Save with a different title first.`);
        return;
      }
    } catch(e) {
      alert('Failed to validate domain: ' + (e?.message || ''));
      return;
    }
  }
  
  const pass = prompt('Passphrase for AES-256 (PBKDF2-derived):'); if(!pass) return;
  const salt = prompt('Salt (recommended):') || '';
  const iters = Number(prompt('PBKDF2 iterations', '120000') || '120000');

  const enc = new TextEncoder(), dec = new TextDecoder();
  const rawKeyBits = await crypto.subtle.importKey('raw', enc.encode(pass), {name:'PBKDF2'}, false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey({ name:'PBKDF2', salt: enc.encode(salt), iterations: iters, hash:'SHA-256' }, rawKeyBits, { name:'AES-GCM', length:256 }, false, ['encrypt']);

  const sanitizeKey = (k) => String(k||'').replace(/[.#$/\[\]]/g, '_');

  const content = getEditorContent?.() || {};
  const files = { [content.html_filename]: content.html, [content.css_filename]: content.css, [content.js_filename]: content.js, ...(proj.files||{}) };

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = {};
  for (const [name, text] of Object.entries(files)) {
    const data = enc.encode(String(text||''));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, aesKey, data));
    const safeName = sanitizeKey(name);
    out[safeName] = { original_name: name, iv: bytesToB64(iv), cipherText: bytesToB64(ct) };
  }

  const folderId = String(Date.now());
  const payload = {
    meta: {
      project_id: proj.id || null,
      name: proj.name || 'Untitled',
      html_filename: content.html_filename,
      css_filename: content.css_filename,
      js_filename: content.js_filename,
      created_at: serverTimestamp(),
      algorithm: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256',
      iterations: iters
    },
    files: out
  };

  await set(ref(db, `userFiles/${uid}/aes256/${folderId}`), payload);
  alert('Encrypted upload complete to userFiles/<uid>/aes256/' + folderId);
}


/**
 * Encrypts content for a single recipient using Kyber KEM hybrid encryption.
 * @param {string} content The plaintext message.
 * @param {string} recipientKemPubB64 The recipient's Kyber public key (base64).
 * @returns {Promise<{kemCiphertext: string, aesCiphertext: string, aesIv: string, aesTag: string, aesKeyRawB64: string}>}
 */
export async function encryptChatMessage(content, recipientKemPubB64) {
  const enc = new TextEncoder();

  // We need to fetch the recipient's KEM public key, convert it from B64 to bytes.
  const recipientKemPub = b64ToBytes(recipientKemPubB64);
  
  // Encapsulation: Generates the ciphertext (kemCiphertextRaw) and the symmetric shared key (aesKeyRaw).
  const { cipherText: kemCiphertextRaw, sharedSecret: aesKeyRaw } = ml_kem768.encapsulate(recipientKemPub);
  
  // 2. Import the derived AES key for AES-256 GCM operations
  const aesKey = await crypto.subtle.importKey(
    'raw', 
    aesKeyRaw, 
    { name: 'AES-GCM', length: 256 }, 
    false, 
    ['encrypt']
  );

  // 3. Encrypt the message content using AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV recommended for AES-GCM
  const contentData = enc.encode(content);
  
  const buffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, 
    aesKey, 
    contentData
  );

  // The result buffer contains the ciphertext followed by the authentication tag (16 bytes for GCM default)
  const fullCiphertext = new Uint8Array(buffer);
  
  // GCM tag is usually the last 16 bytes.
  const tagLength = 16;
  if (fullCiphertext.length < tagLength) {
     throw new Error("Ciphertext too short, GCM tag calculation error.");
  }
  
  const aesCiphertextRaw = fullCiphertext.slice(0, fullCiphertext.length - tagLength);
  const aesTagRaw = fullCiphertext.slice(fullCiphertext.length - tagLength);

  return {
    kemCiphertext: bytesToB64(kemCiphertextRaw),
    aesCiphertext: bytesToB64(aesCiphertextRaw),
    aesIv: bytesToB64(iv),
    aesTag: bytesToB64(aesTagRaw),
    aesKeyRawB64: bytesToB64(aesKeyRaw) // Symmetric key K, for local display only
  };
}


/**
 * Decrypts a message using the user's private Kyber key and the encrypted symmetric key.
 * @param {string} senderKemCiphertextB64 The encrypted symmetric key from the sender (base64).
 * @param {string} aesCiphertextB64 The encrypted message content (base64).
 * @param {string} aesIvB64 The IV used for AES-GCM (base64).
 * @param {string} aesTagB64 The authentication tag used for AES-GCM (base64).
 * @param {string} myKemPrivB64 The recipient's Kyber private key (base64).
 * @returns {Promise<string>} The decrypted plaintext message.
 */
export async function decryptChatMessage(senderKemCiphertextB64, aesCiphertextB64, aesIvB64, aesTagB64, myKemPrivB64) {
  const dec = new TextDecoder();
  
  try {
    const kemCiphertext = b64ToBytes(senderKemCiphertextB64);
    const myKemPriv = b64ToBytes(myKemPrivB64);
    
    // 1. Decapsulate the AES key
    const aesKeyRaw = ml_kem768.decapsulate(kemCiphertext, myKemPriv);
    
    // 2. Import the recovered AES key
    const aesKey = await crypto.subtle.importKey(
      'raw', 
      aesKeyRaw, 
      { name: 'AES-GCM', length: 256 }, 
      false, 
      ['decrypt']
    );

    // 3. Decrypt the message content
    const aesCiphertext = b64ToBytes(aesCiphertextB64);
    const iv = b64ToBytes(aesIvB64);
    const aesTag = b64ToBytes(aesTagB64);

    // Concatenate ciphertext and tag back into a single buffer for decryption
    const fullCiphertext = new Uint8Array(aesCiphertext.length + aesTag.length);
    fullCiphertext.set(aesCiphertext, 0);
    fullCiphertext.set(aesTag, aesCiphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, 
      aesKey, 
      fullCiphertext
    );
    
    return dec.decode(decryptedBuffer);

  } catch (e) {
    console.error("Decryption failed:", e);
    // Return a default error message or throw
    return `[DECRYPTION ERROR: ${e.message || e}]`;
  }
}

// NEW: Helper function for local decryption using the known symmetric key
/**
 * Decrypts a message using the symmetric AES key directly.
 * @param {string} aesKeyRawB64 The symmetric AES key (base64).
 * @param {string} aesCiphertextB64 The encrypted message content (base64).
 * @param {string} aesIvB64 The IV used for AES-GCM (base64).
 * @param {string} aesTagB64 The authentication tag used for AES-GCM (base64).
 * @returns {Promise<string>} The decrypted plaintext message.
 */
export async function decryptMessageWithKey(aesKeyRawB64, aesCiphertextB64, aesIvB64, aesTagB64) {
  const dec = new TextDecoder();
  
  try {
    const aesKeyRaw = b64ToBytes(aesKeyRawB64);

    // 1. Import the AES key
    const aesKey = await crypto.subtle.importKey(
      'raw', 
      aesKeyRaw, 
      { name: 'AES-GCM', length: 256 }, 
      false, 
      ['decrypt']
    );

    // 2. Decrypt the message content
    const aesCiphertext = b64ToBytes(aesCiphertextB64);
    const iv = b64ToBytes(aesIvB64);
    const aesTag = b64ToBytes(aesTagB64);

    // Concatenate ciphertext and tag back into a single buffer for decryption
    const fullCiphertext = new Uint8Array(aesCiphertext.length + aesTag.length);
    fullCiphertext.set(aesCiphertext, 0);
    fullCiphertext.set(aesTag, aesCiphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, 
      aesKey, 
      fullCiphertext
    );
    
    return dec.decode(decryptedBuffer);

  } catch (e) {
    console.error("Local decryption failed:", e);
    return `[LOCAL DECRYPTION ERROR: ${e.message || e}]`;
  }
}