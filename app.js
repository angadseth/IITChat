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
          <div class="cip">${lm ? (lm.type === 'text' ? lm.text.substring(0, 35) : '📎') : 'Say hi! 👋'}</div>
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

function mkMsg(msg, isMe, con) {
  const row = document.createElement('div');
  row.className = `mr ${isMe ? 'me' : 'them'}${con ? ' con' : ''}`;

  const body = msg.type === 'text'
    ? escHtml(msg.text).replace(/\n/g, '<br>')
    : '';

  const rHtml  = mkReacts(msg);
  const expLeft = THREE_DAYS - (Date.now() - msg.ts);
  const expH   = Math.max(0, Math.round(expLeft / 3_600_000));

  row.innerHTML = `
    ${!isMe ? `<div class="mav">${CCT?.avatar || '👤'}</div>` : ''}
    <div class="mc">
      ${!isMe && !con ? `<div class="msn">${CCT?.name || ''}</div>` : ''}
      <div class="bw">
        <div class="bub" onclick="showRP(event,this,'${msg.id}')">${body}</div>
      </div>
      ${rHtml ? `<div class="rcts">${rHtml}</div>` : ''}
      <div class="mm">
        <span>${fmtTime(msg.ts)}</span>
        ${expH < 24 ? `<span style="opacity:.45;font-size:9px">🕐${expH}h</span>` : ''}
        ${isMe ? '<span class="mck"><i class="fa fa-check-double"></i></span>' : ''}
      </div>
    </div>`;
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

window.showRP = (e, bub, mid) => {
  e.stopPropagation();
  document.querySelectorAll('.rpk').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'rpk';
  picker.innerHTML = REACTS.map(r =>
    `<span onclick="addRct('${mid}','${r}');this.closest('.rpk').remove()">${r}</span>`
  ).join('');
  bub.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50);
};

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

window.toggleEP = () => el('epnl').classList.toggle('hidden');

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

// ── init ──
applyTheme(localStorage.getItem('iitchat-theme') || 'dark');
showCat('smileys', null);
