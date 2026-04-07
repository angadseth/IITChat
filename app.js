// ═══════════════════════════════════════════════════════
//  IIT CHAT — app.js
//  Firebase Realtime DB  |  No Storage needed
//  Messages auto-delete after 3 days
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref, set, get, push, onValue, update, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ══════════════════════════════════════════════════════
// 🔥 BHAI YAHAN APNA FIREBASE CONFIG PASTE KAR
//    Firebase Console → Project Settings → Your Apps
// ══════════════════════════════════════════════════════
const FC = {
  apiKey:            "AIzaSyBUkQ3ykM5ErEKeLSfClIuaU7Qtokwg0Ek",
  authDomain:        "iitchat-ef6a0.firebaseapp.com",
  databaseURL:       "https://iitchat-ef6a0-default-rtdb.firebaseio.com",
  projectId:         "iitchat-ef6a0",
  storageBucket:     "iitchat-ef6a0.firebasestorage.app",
  messagingSenderId: "701410820532",
  appId:             "1:701410820532:web:1c975bcfd5812c10f132e1"
};
// ══════════════════════════════════════════════════════

const fbApp = initializeApp(FC);
const auth  = getAuth(fbApp);
const db    = getDatabase(fbApp);

// ══════════════════════════════════════════════════════
// 📸 IMGBB API KEY — imgbb.com pe free account banao
//    Login → apna naam → API → key copy karo
// ══════════════════════════════════════════════════════
const IMGBB_KEY = 'e9167e60305454e517e135847608509d';
// ══════════════════════════════════════════════════════

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;   // ms

// ── state ──
let CU       = null;   // current user
let CCI      = null;   // current chat id
let CCT      = null;   // current contact object
let contacts = {};
let unsub    = null;   // unsubscribe listener

// ═══════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════
window.doLogin = async () => {
  const e = el('le').value.trim();
  const p = el('lp').value;
  setAErr('');
  if (!e || !p) { setAErr('Fill all fields'); return; }
  try {
    await signInWithEmailAndPassword(auth, e, p);
  } catch (err) {
    setAErr(fmtErr(err.code));
  }
};

window.doRegister = async () => {
  const n  = el('rn').value.trim();
  const e  = el('re').value.trim();
  const p  = el('rp').value;
  const av = document.querySelector('.avo.sel')?.dataset.av || '😎';
  setAErr('');
  if (!n || !e || !p) { setAErr('Fill all fields'); return; }
  if (p.length < 6)   { setAErr('Password min 6 chars'); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    await updateProfile(cred.user, { displayName: n });
    await set(ref(db, `users/${cred.user.uid}`), {
      name: n, email: e.toLowerCase(),
      avatar: av, uid: cred.user.uid,
      online: true, lastSeen: Date.now()
    });
  } catch (err) {
    setAErr(fmtErr(err.code));
  }
};

window.doLogout = async () => {
  if (CU) await update(ref(db, `users/${CU.uid}`), { online: false, lastSeen: Date.now() });
  await signOut(auth);
};

function fmtErr(code) {
  const map = {
    'auth/user-not-found':      'User not found',
    'auth/wrong-password':      'Wrong password',
    'auth/email-already-in-use':'Email already registered',
    'auth/invalid-credential':  'Invalid email or password',
    'auth/invalid-email':       'Invalid email',
  };
  return map[code] || 'Something went wrong, try again';
}

function setAErr(m) { el('aerr').textContent = m; }

// ── auth state listener ──
onAuthStateChanged(auth, async u => {
  if (u) {
    CU = u;
    await update(ref(db, `users/${u.uid}`), { online: true, lastSeen: Date.now() });

    const snap = await get(ref(db, `users/${u.uid}`));
    const pr   = snap.val() || {};

    // fill sidebar avatar
    el('myav').innerHTML = `${pr.avatar || '😎'}<div class="sd"></div>`;

    // fill settings panel
    el('spav').textContent = pr.avatar || '😎';
    el('spnm').textContent = pr.name   || u.displayName || 'You';
    el('spem').textContent = u.email;

    el('auth-screen').style.display = 'none';
    el('app').style.display         = 'flex';

    applyTheme(localStorage.getItem('iitchat-theme') || 'dark');
    loadContacts();
    autoClean();
  } else {
    CU = null;
    el('auth-screen').style.display = 'flex';
    el('app').style.display         = 'none';
  }
});

// ═══════════════════════════════════════
//  AUTO-CLEANUP (runs on every login)
//  Deletes messages older than 3 days
// ═══════════════════════════════════════
async function autoClean() {
  const cutoff = Date.now() - THREE_DAYS;
  const cs = await get(ref(db, `contacts/${CU.uid}`));
  if (!cs.exists()) return;
  for (const uid of Object.keys(cs.val() || {})) {
    const chatId = cid(CU.uid, uid);
    const ms = await get(ref(db, `chats/${chatId}/messages`));
    if (!ms.exists()) continue;
    for (const [k, v] of Object.entries(ms.val())) {
      if (v.ts && v.ts < cutoff) {
        await remove(ref(db, `chats/${chatId}/messages/${k}`));
      }
    }
  }
}

// ═══════════════════════════════════════
//  CONTACTS
// ═══════════════════════════════════════
function loadContacts() {
  onValue(ref(db, `contacts/${CU.uid}`), async snap => {
    contacts = {};
    const cl   = el('cl');
    cl.innerHTML = '';
    const data = snap.val() || {};
    const uids = Object.keys(data);

    if (!uids.length) {
      cl.innerHTML = '<div class="noct"><i class="fa fa-users"></i><p>No friends yet.<br>Add someone to start!</p></div>';
      return;
    }

    for (const uid of uids) {
      const us = await get(ref(db, `users/${uid}`));
      if (!us.exists()) continue;
      const u = us.val();
      contacts[uid] = u;

      const chatId = cid(CU.uid, uid);
      const lm     = (await get(ref(db, `chats/${chatId}/lastMessage`))).val();

      const item = document.createElement('div');
      item.className    = 'ci' + (CCI === chatId ? ' act' : '');
      item.dataset.uid  = uid;
      item.innerHTML    = `
        <div class="ciav">
          ${u.avatar || '👤'}
          <div class="sd ${u.online ? 'on' : 'off'}"></div>
        </div>
        <div class="cii">
          <div class="cin">${u.name}</div>
          <div class="cip">${lmPreview(lm)}</div>
        </div>
        <div class="cim">
          <div class="cit">${lm ? fmtTime(lm.ts) : ''}</div>
        </div>`;
      item.onclick = () => openChat(uid, u);
      cl.appendChild(item);
    }
  });
}

window.addFriend = async () => {
  const email = el('fem').value.trim().toLowerCase();
  const errEl = el('ferr');
  errEl.textContent = '';

  if (!email)                           { errEl.textContent = 'Enter email'; return; }
  if (email === CU.email.toLowerCase()) { errEl.textContent = "That's your own email!"; return; }

  const snap  = await get(ref(db, 'users'));
  const found = Object.values(snap.val() || {}).find(u => u.email?.toLowerCase() === email);
  if (!found)             { errEl.textContent = 'No user found with that email'; return; }
  if (contacts[found.uid]){ errEl.textContent = 'Already your friend'; return; }

  await set(ref(db, `contacts/${CU.uid}/${found.uid}`), true);
  await set(ref(db, `contacts/${found.uid}/${CU.uid}`), true);
  closeAC();
  toast('✅ Friend added!');
};

window.filterCL = () => {
  const q = el('sinp').value.toLowerCase();
  document.querySelectorAll('.ci').forEach(item => {
    item.style.display = item.querySelector('.cin')?.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

// ═══════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════
function cid(a, b) { return [a, b].sort().join('_'); }

async function openChat(uid, u) {
  CCT = u;
  CCI = cid(CU.uid, uid);

  document.querySelectorAll('.ci').forEach(i => i.classList.remove('act'));
  document.querySelector(`.ci[data-uid="${uid}"]`)?.classList.add('act');

  el('cwel').classList.add('hidden');
  const acd = el('acd');
  acd.classList.remove('hidden');
  acd.style.display = 'flex';

  el('chav').textContent = u.avatar || '👤';
  el('chn').textContent  = u.name;

  const chs = el('chs');
  const setStatus = online => {
    chs.textContent  = online ? '● Online' : 'Last seen recently';
    chs.className    = 'chs' + (online ? ' on' : '');
  };
  setStatus(u.online);
  onValue(ref(db, `users/${uid}/online`), s => setStatus(s.val()));

  loadMsgs();
}

function loadMsgs() {
  if (unsub) unsub();
  const area = el('ma');
  area.innerHTML = '';

  unsub = onValue(ref(db, `chats/${CCI}/messages`), snap => {
    area.innerHTML = '';
    const msgs = snap.val();
    if (!msgs) return;

    let prevDate = '', prevSender = '';
    Object.values(msgs).sort((a, b) => a.ts - b.ts).forEach(msg => {
      const d = new Date(msg.ts).toDateString();
      if (d !== prevDate) {
        const dl = document.createElement('div');
        dl.className   = 'dl';
        dl.textContent = d === new Date().toDateString() ? 'Today' : d;
        area.appendChild(dl);
        prevDate = d; prevSender = '';
      }
      const isMe = msg.sender === CU.uid;
      const con  = msg.sender === prevSender;
      area.appendChild(mkMsg(msg, isMe, con));
      prevSender = msg.sender;
    });
    area.scrollTop = area.scrollHeight;
  });
}

function mkBody(msg, isMe) {
  if (msg.type === 'text') return escHtml(msg.text).replace(/\n/g, '<br>');
  if (msg.type === 'image') {
    if (msg.viewOnce) {
      const viewed = msg.viewedBy?.[CU.uid];
      if (isMe)   return `<div class="vo-bub sent"><i class="fa fa-eye"></i> View once${viewed ? ' · <span style="font-size:10px;opacity:.6">Seen</span>' : ''}</div>`;
      if (viewed) return `<div class="vo-bub opened"><i class="fa fa-eye-slash"></i> Photo opened</div>`;
      return `<div class="vo-bub tap"><i class="fa fa-eye"></i> Tap to view</div>`;
    }
    return `<img class="mimg" src="${msg.url}" loading="lazy">`;
  }
  if (msg.type === 'video') {
    return `<video class="mvid" controls preload="metadata"><source src="${msg.url}"></video>`;
  }
  if (msg.type === 'document') {
    const name = escHtml(msg.name || 'Document');
    const size = fmtSize(msg.size);
    return `<a class="mdoc" href="${msg.url}" target="_blank" download="${name}">
      <i class="fa fa-file-alt"></i>
      <div class="mdoc-info"><div class="mdoc-name">${name}</div>${size ? `<div class="mdoc-size">${size}</div>` : ''}</div>
      <i class="fa fa-download" style="opacity:.5;flex-shrink:0"></i>
    </a>`;
  }
  return '';
}

function mkMsg(msg, isMe, con) {
  const row = document.createElement('div');
  row.className = `mr ${isMe ? 'me' : 'them'}${con ? ' con' : ''}`;

  const body    = mkBody(msg, isMe);
  const rHtml   = mkReacts(msg);
  const expLeft = THREE_DAYS - (Date.now() - msg.ts);
  const expH    = Math.max(0, Math.round(expLeft / 3_600_000));

  row.innerHTML = `
    ${!isMe ? `<div class="mav">${CCT?.avatar || '👤'}</div>` : ''}
    <div class="mc">
      ${!isMe && !con ? `<div class="msn">${CCT?.name || ''}</div>` : ''}
      <div class="bw">
        <div class="bub" onclick="showRP(event,this,'${msg.id}',${isMe})">${body}</div>
      </div>
      ${rHtml ? `<div class="rcts">${rHtml}</div>` : ''}
      <div class="mm">
        <span>${fmtTime(msg.ts)}</span>
        ${expH < 24 ? `<span style="opacity:.45;font-size:9px">🕐${expH}h</span>` : ''}
        ${isMe ? '<span class="mck"><i class="fa fa-check-double"></i></span>' : ''}
      </div>
    </div>`;

  // attach media event listeners (avoids URL-escaping issues in inline handlers)
  row.querySelector('.mimg')?.addEventListener('click', e => { e.stopPropagation(); openImg(msg.url); });
  row.querySelector('.mvid')?.addEventListener('click', e => e.stopPropagation());
  row.querySelector('.mdoc')?.addEventListener('click', e => e.stopPropagation());
  row.querySelector('.vo-bub.tap')?.addEventListener('click', e => { e.stopPropagation(); viewOnce(msg.id, msg.url); });

  return row;
}

function mkReacts(msg) {
  if (!msg.reactions) return '';
  const grouped = {};
  Object.entries(msg.reactions).forEach(([uid, em]) => {
    if (!grouped[em]) grouped[em] = [];
    grouped[em].push(uid);
  });
  return Object.entries(grouped).map(([em, uids]) =>
    `<span class="rch${uids.includes(CU.uid) ? ' mine' : ''}"
      onclick="togRct('${msg.id}','${em}')">${em} ${uids.length}</span>`
  ).join('');
}

// ── REACTIONS ──
const REACTS = ['❤️','😂','😮','😢','👍','🔥','🎉','😍','💀','🤣'];

window.showRP = (e, bub, mid, isMe) => {
  e.stopPropagation();
  document.querySelectorAll('.rpk').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'rpk';
  let html = REACTS.map(r =>
    `<span onclick="addRct('${mid}','${r}');this.closest('.rpk').remove()">${r}</span>`
  ).join('');
  if (isMe) html += `<span class="rpk-del" title="Delete" onclick="delMsg('${mid}');this.closest('.rpk').remove()">🗑️</span>`;
  picker.innerHTML = html;
  bub.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50);
};

window.delMsg = async mid => {
  if (!confirm('Delete this message?')) return;
  await remove(ref(db, `chats/${CCI}/messages/${mid}`));
  const ms = await get(ref(db, `chats/${CCI}/messages`));
  if (!ms.exists()) {
    await remove(ref(db, `chats/${CCI}/lastMessage`));
  } else {
    const all = Object.values(ms.val()).sort((a, b) => a.ts - b.ts);
    await set(ref(db, `chats/${CCI}/lastMessage`), all[all.length - 1]);
  }
};

function openImg(url) {
  el('lbimg').src = url;
  el('lb').classList.remove('hidden');
}

async function viewOnce(mid, url) {
  await update(ref(db, `chats/${CCI}/messages/${mid}/viewedBy`), { [CU.uid]: true });
  openImg(url);
}

window.closeLB = e => { if (e.target === el('lb')) el('lb').classList.add('hidden'); };

window.addRct = async (mid, em) => {
  await update(ref(db, `chats/${CCI}/messages/${mid}/reactions`), { [CU.uid]: em });
};
window.togRct = async (mid, em) => {
  const r    = ref(db, `chats/${CCI}/messages/${mid}/reactions/${CU.uid}`);
  const snap = await get(r);
  if (snap.val() === em) await remove(r);
  else await update(ref(db, `chats/${CCI}/messages/${mid}/reactions`), { [CU.uid]: em });
};

window.clearChat = async () => {
  if (!confirm('Clear this entire chat?')) return;
  await remove(ref(db, `chats/${CCI}/messages`));
  await remove(ref(db, `chats/${CCI}/lastMessage`));
  toast('🗑️ Chat cleared');
};

// ═══════════════════════════════════════
//  SEND MESSAGE
// ═══════════════════════════════════════
async function sendData(data) {
  if (!CCI) return;
  const msgRef = push(ref(db, `chats/${CCI}/messages`));
  const msg    = { ...data, id: msgRef.key, sender: CU.uid, ts: Date.now() };
  await set(msgRef, msg);
  await set(ref(db, `chats/${CCI}/lastMessage`), msg);
}

window.sendMsg = async () => {
  const inp  = el('msgi');
  const text = inp.value.trim();
  if (!text || !CCI) return;
  inp.value = '';
  inp.style.height = 'auto';
  await sendData({ type: 'text', text });
};

window.onKey  = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
window.aRsz   = el => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 85) + 'px'; };

// ═══════════════════════════════════════
//  EMOJI PICKER
// ═══════════════════════════════════════
const EMOJIS = {
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😏','😒','😔','😟','😕','☹️','😣','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','🤗','🤔','🤭','🤫','😶','😐','😑','😬','🙄','😯','😲','🥱','😴','😵','🤐','🥴','🤢','🤧','😷'],
  love:    ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🌹','🌷','🌸','💐','🎁','💌','💋','🤗','🫂','😍','🥰','😘','✨','🌙','⭐','💫','🥂','🍷'],
  hands:   ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','💪','🦾'],
  nature:  ['🌱','🌿','☘️','🍀','🍃','🍂','🍁','🍄','🌾','💐','🌷','🌹','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌙','🌟','⭐','🌠','⚡','🌈','🌊','🦁','🐯','🐻','🦊','🐺','🐨','🐼','🦋','🐝','🌍'],
  food:    ['🍕','🍔','🍟','🌭','🍿','🥚','🍳','🥞','🍞','🥐','🧀','🥗','🌮','🌯','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🧁','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🥂','🍷','🥃','🍹','☕','🍵'],
  symbols: ['💯','🔥','✨','⭐','🌟','💥','❓','❗','‼️','🆘','🆒','🆕','🆙','🆓','🚫','⛔','✅','❌','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','♾️','💤','🎉','🎊','🏆','🥇','💎','🔑','🎯']
};

window.toggleEP = () => {
  el('amnl').classList.add('hidden');
  el('epnl').classList.toggle('hidden');
};

window.toggleAM = () => {
  el('epnl').classList.add('hidden');
  el('amnl').classList.toggle('hidden');
};

window.pickFile = type => {
  el('amnl').classList.add('hidden');
  if (!CCI) { toast('Open a chat first'); return; }
  if (type === 'media') el('fi-media').click();
  else                  el('fi-vo').click();
};

async function handleFilePick(e, type) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('❌ Sirf images supported hain'); return; }
  if (file.size > 10 * 1024 * 1024)   { toast('❌ Max image size: 10 MB'); return; }
  if (!IMGBB_KEY || IMGBB_KEY === 'YOUR_IMGBB_API_KEY_HERE') {
    toast('❌ app.js mein ImgBB API key daalo pehle'); return;
  }
  toast('⏫ Uploading...');
  try {
    const b64  = await toBase64(file);
    const form = new FormData();
    form.append('image', b64.split(',')[1]);
    const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Upload failed');
    const data = { type: 'image', url: json.data.url, name: file.name, size: file.size };
    if (type === 'viewonce') data.viewOnce = true;
    await sendData(data);
    toast('✅ Sent!');
  } catch (err) {
    console.error(err);
    toast('❌ Upload failed: ' + err.message);
  }
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

window.showCat = (cat, btn) => {
  document.querySelectorAll('.ecb').forEach(b => b.classList.remove('act'));
  btn?.classList.add('act');
  el('egr').innerHTML = (EMOJIS[cat] || [])
    .map(e => `<div class="eo" onclick="insE('${e}')">${e}</div>`)
    .join('');
};

window.insE = em => { const i = el('msgi'); i.value += em; i.focus(); };

document.addEventListener('click', e => {
  if (!e.target.closest('.epnl') && !e.target.closest('.eb'))
    el('epnl')?.classList.add('hidden');
  if (!e.target.closest('.amnl') && e.target.id !== 'amb' && !e.target.closest('#amb'))
    el('amnl')?.classList.add('hidden');
});

// ═══════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════
window.switchTab = tab => {
  document.querySelectorAll('.atab').forEach((t, i) =>
    t.classList.toggle('active', i === (tab === 'login' ? 0 : 1))
  );
  el('lf').classList.toggle('hidden', tab !== 'login');
  el('rf').classList.toggle('hidden', tab !== 'register');
  setAErr('');
};

window.selAv = node => {
  document.querySelectorAll('.avo').forEach(a => a.classList.remove('sel'));
  node.classList.add('sel');
};

window.openAC  = () => { el('acm').classList.add('show'); el('fem').value = ''; el('ferr').textContent = ''; };
window.closeAC = () => el('acm').classList.remove('show');
window.openSP  = () => el('spp').classList.add('show');
window.closeSP = e  => { if (e.target === el('spp')) el('spp').classList.remove('show'); };

window.setTheme = th => { applyTheme(th); localStorage.setItem('iitchat-theme', th); };

function applyTheme(th) {
  document.documentElement.setAttribute('data-theme', th);
  document.querySelectorAll('.thb').forEach(b => b.classList.remove('sel'));
  document.querySelector(`.thb.${th}`)?.classList.add('sel');
}

let toastTimer;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
window.showToast = toast;

// ── utils ──
function el(id) { return document.getElementById(id); }

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function lmPreview(lm) {
  if (!lm) return 'Say hi! 👋';
  if (lm.type === 'text')     return lm.text.substring(0, 35);
  if (lm.type === 'image')    return lm.viewOnce ? '👁️ View once' : '📷 Photo';
  if (lm.type === 'video')    return '🎥 Video';
  if (lm.type === 'document') return '📄 ' + (lm.name || 'Document');
  return '📎';
}

// ── file input listeners ──
el('fi-media').addEventListener('change', e => handleFilePick(e, 'media'));
el('fi-vo').addEventListener('change',    e => handleFilePick(e, 'viewonce'));

// ── init ──
applyTheme(localStorage.getItem('iitchat-theme') || 'dark');
showCat('smileys', null);
