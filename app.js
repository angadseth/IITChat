// ═══════════════════════════════════════════════════════
//  IIT CHAT — app.js
//  Firebase Realtime DB  |  No Storage needed
//  Messages auto-delete after 3 days
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initDrawFeature, onChatOpen as drawChatOpen } from './features/draw.js';
import { initMsgMenu } from './features/msgMenu.js';
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
  ref, set, get, push, onValue, onChildAdded, update, remove, onDisconnect, serverTimestamp
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

// ── feature: draw ──
initDrawFeature(db, ref, set, push, onValue, onChildAdded, () => ({ CU, CCI, isGroup }));
// ── feature: message menu ──
initMsgMenu(() => ({ CU, CCT }), () => el('msgi')?.focus());

// ── state ──
let CU       = null;   // current user
let CCI      = null;   // current chat id
let CCT      = null;   // current contact object
let contacts = {};
let unsub       = null;   // unsubscribe listener
let unsubLR     = null;   // live reactions listener
let replyTo     = null;   // { id, text, senderName }
let isGroup       = false;  // current chat is a group?
let grpData       = null;   // current group object
let memberCache   = {};     // uid → {name,avatar} for group messages
let unreadCounts  = JSON.parse(localStorage.getItem('iitchat-unread') || '{}');
let ctListeners   = [];     // contact-level listeners to clean up on reload

// ── music state ──
let ytPlayer       = null;   // YouTube IFrame player
let ytReady        = false;  // IFrame API loaded?
let musicUnsub     = null;   // Firebase music listener
let mpSyncing      = false;  // prevent feedback loop when syncing from Firebase
let mpOpen         = false;  // panel open?
let mpPendingSeek  = null;   // { seekOffset, seekStartedAt, shouldPlay } — applied in onReady
let mpLastFB       = null;   // last Firebase music snapshot (for drift detection)
let mpSyncInterval = null;   // seek-drift polling interval
let mpLastSeekedAt = 0;      // tracks which seekedAt we last applied
let mpLastVid      = null;   // currently loaded video/insta key

// ── Draggable panel utility (mouse + touch, optional CSS-selector delegation) ──
// makeDraggable(panel, handle)                — handle is direct element
// makeDraggable(panel, panel, '.lrp-header')  — delegation: only drag when child matches selector
function makeDraggable(panel, handle, delegateSel) {
  let drag = null;
  const onDown = e => {
    if (delegateSel && !e.target.closest(delegateSel)) return;
    // Don't capture clicks on interactive children (close btn, emojis, inputs)
    if (e.target.closest('button,.lrx,.lre,input,a')) return;
    const pt = e.touches?.[0] || e;
    const r  = panel.getBoundingClientRect();
    drag = { ox: pt.clientX - r.left, oy: pt.clientY - r.top };
    panel.style.transition = 'none';
    e.preventDefault();
  };
  const onMove = e => {
    if (!drag) return;
    const pt = e.touches?.[0] || e;
    panel.style.left   = Math.max(0, Math.min(pt.clientX - drag.ox, window.innerWidth  - panel.offsetWidth))  + 'px';
    panel.style.top    = Math.max(0, Math.min(pt.clientY - drag.oy, window.innerHeight - panel.offsetHeight)) + 'px';
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
  };
  const onUp = () => { drag = null; };
  handle.addEventListener('mousedown',  onDown, { passive: false });
  handle.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove',  onMove);
  document.addEventListener('touchmove',  onMove, { passive: false });
  document.addEventListener('mouseup',  onUp);
  document.addEventListener('touchend', onUp);
}

// ── Avatar HTML helper — photo if available, else emoji ──
function avH(av, photo) {
  if (photo) return `<img src="${photo}" class="av-img" alt="" loading="lazy">`;
  return av || '👤';
}

function saveUnread() { localStorage.setItem('iitchat-unread', JSON.stringify(unreadCounts)); }

function updateBadge(item, count) {
  let badge = item.querySelector('.ubadge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'ubadge';
      item.querySelector('.cim').prepend(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
  } else {
    badge?.remove();
  }
}

// ═══════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════
window.doLogin = async () => {
  const e = el('le').value.trim();
  const p = el('lp').value;
  setAErr('');
  if (!e || !p) { setAErr('Fill all fields'); return; }
  const btn = document.querySelector('#lf .btnp');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Signing in…';
  try {
    await signInWithEmailAndPassword(auth, e, p);
  } catch (err) {
    setAErr(fmtErr(err.code));
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-sign-in-alt"></i> Sign In';
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
onAuthStateChanged(auth, u => {
  if (u) {
    CU = u;

    // Show app immediately — don't block on DB
    el('auth-screen').style.display = 'none';
    el('app').style.display         = 'flex';
    applyTheme(localStorage.getItem('iitchat-theme') || 'dark');

    const uRef = ref(db, `users/${u.uid}`);

    function goOnline() {
      update(uRef, { online: true, lastSeen: Date.now() });
      onDisconnect(uRef).update({ online: false, lastSeen: serverTimestamp() });
    }
    function goOffline() {
      update(uRef, { online: false, lastSeen: Date.now() });
    }

    goOnline();

    document.addEventListener('visibilitychange', () => {
      document.hidden ? goOffline() : goOnline();
    });
    window.addEventListener('beforeunload', () => { goOffline(); });

    // Load profile in background — doesn't block app open
    get(ref(db, `users/${u.uid}`)).then(snap => {
      const pr = snap.val() || {};
      el('myav').innerHTML   = avH(pr.avatar || '😎', pr.photoURL) + `<div class="sd"></div>`;
      el('spav').innerHTML   = avH(pr.avatar || '😎', pr.photoURL);
      el('spnm').textContent = pr.name   || u.displayName || 'You';
      el('spem').textContent = u.email;
    });

    loadContacts();
    loadGroups();
    autoClean();
    initNotifications();
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
    notifUnsubs.forEach(u => u()); notifUnsubs = [];
    ctListeners.forEach(u => u());  ctListeners = [];
    const cl   = el('cl');
    cl.innerHTML = '';
    const data = snap.val() || {};
    const uids = Object.keys(data);

    if (!uids.length) {
      cl.innerHTML = '<div class="noct"><i class="fa fa-users"></i><p>No friends yet.<br>Add someone to start!</p></div>';
      return;
    }

    // fetch all users + lastMessages in parallel (much faster)
    const results = await Promise.all(uids.map(async uid => {
      const chatId = cid(CU.uid, uid);
      const [us, lmSnap] = await Promise.all([
        get(ref(db, `users/${uid}`)),
        get(ref(db, `chats/${chatId}/lastMessage`))
      ]);
      return { uid, us, lm: lmSnap.val() };
    }));

    for (const { uid, us, lm } of results) {
      if (!us.exists()) continue;
      const u = us.val();
      contacts[uid] = u;

      const chatId = cid(CU.uid, uid);
      const item = document.createElement('div');
      item.className    = 'ci' + (CCI === chatId ? ' act' : '');
      item.dataset.uid  = uid;
      item.innerHTML    = `
        <div class="ciav">
          ${avH(u.avatar, u.photoURL)}
          <div class="sd ${u.online ? 'on' : 'off'}"></div>
        </div>
        <div class="cii">
          <div class="cin">${u.name}</div>
          <div class="cip">${lmPreview(lm)}</div>
        </div>
        <div class="cim">
          <div class="cit">${lm ? fmtTime(lm.ts) : ''}</div>
        </div>`;
      // show existing unread badge from localStorage
      updateBadge(item, unreadCounts[uid] || 0);

      item.onclick = () => openChat(uid, u);
      cl.appendChild(item);
      setupNotifForContact(uid, u.name, u.avatar || '💬');

      // ── live online dot ──
      ctListeners.push(onValue(ref(db, `users/${uid}/online`), s => {
        const dot = item.querySelector('.sd');
        if (dot) dot.className = 'sd ' + (s.val() ? 'on' : 'off');
      }));

      // ── live last message update in sidebar ──
      ctListeners.push(onValue(ref(db, `chats/${chatId}/lastMessage`), snap => {
        const lm  = snap.val();
        const pip = item.querySelector('.cip');
        const cit = item.querySelector('.cit');
        if (pip) pip.textContent = lmPreview(lm);
        if (cit) cit.textContent = lm ? fmtTime(lm.ts) : '';
      }));

      // ── unread count: only NEW messages (ts > now) ──
      const listenSince = Date.now();
      ctListeners.push(onChildAdded(ref(db, `chats/${chatId}/messages`), snap => {
        const msg = snap.val();
        if (!msg || msg.ts <= listenSince) return;  // skip old
        if (msg.sender === CU.uid) return;           // my own msg
        if (CCI === chatId) return;                  // chat is open
        unreadCounts[uid] = (unreadCounts[uid] || 0) + 1;
        updateBadge(item, unreadCounts[uid]);
        saveUnread();
      }));
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
  isGroup = false; grpData = null; memberCache = {};
  el('gib').style.display = 'none';

  // clear unread for this contact
  if (unreadCounts[uid]) {
    unreadCounts[uid] = 0;
    saveUnread();
    const item = document.querySelector(`.ci[data-uid="${uid}"]`);
    if (item) updateBadge(item, 0);
  }

  CCT = u;
  CCI = cid(CU.uid, uid);

  document.querySelectorAll('.ci').forEach(i => i.classList.remove('act'));
  document.querySelector(`.ci[data-uid="${uid}"]`)?.classList.add('act');

  el('cwel').classList.add('hidden');
  const acd = el('acd');
  acd.classList.remove('hidden');
  acd.style.display = 'flex';

  el('chav').innerHTML = avH(u.avatar, u.photoURL);
  el('chn').textContent  = u.name;

  const chs = el('chs');
  let contactOnline = false;
  let contactLastSeen = null;
  let isTyping = false;

  const renderStatus = () => {
    if (isTyping) return; // typing indicator already shown
    if (contactOnline) {
      chs.textContent = '● Online';
      chs.className   = 'chs on';
    } else {
      chs.textContent = contactLastSeen
        ? 'Last seen ' + fmtLastSeen(contactLastSeen)
        : 'Offline';
      chs.className = 'chs';
    }
  };

  // Watch online + lastSeen together — real-time, no stale get()
  onValue(ref(db, `users/${uid}/online`), s => {
    contactOnline = !!s.val();
    renderStatus();
  });
  onValue(ref(db, `users/${uid}/lastSeen`), s => {
    contactLastSeen = s.val();
    renderStatus();
  });
  onValue(ref(db, `users/${uid}/typingIn`), s => {
    if (s.val() === CCI) {
      isTyping = true;
      chs.textContent = 'typing...';
      chs.className   = 'chs typing';
    } else {
      isTyping = false;
      renderStatus();
    }
  });

  // live reactions listener
  if (unsubLR) unsubLR();
  unsubLR = onChildAdded(ref(db, `liveReactions/${CCI}`), snap => {
    const d = snap.val();
    if (!d || !d.emoji) return;
    if (Date.now() - d.ts > 5000) return;   // ignore stale
    if (d.uid === CU.uid) return;            // already shown locally
    showReactionAnim(d.emoji);
    setTimeout(() => remove(snap.ref), 3200);
  });

  startMusicSync(CCI);
  drawChatOpen();
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
    checkScrollBtn();
  });
}

// ── Scroll-to-bottom button ──
function checkScrollBtn() {
  const area = el('ma');
  const btn  = el('scroll-btn');
  if (!area || !btn) return;
  const distFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
  btn.classList.toggle('hidden', distFromBottom < 80);
}

window.scrollToBottom = function () {
  const area = el('ma');
  area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
};

// Attach scroll listener once
el('ma').addEventListener('scroll', checkScrollBtn);

function emojiOnlyCount(text) {
  if (!text?.trim()) return 0;
  const noEmoji = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}|\uFE0F|\u200D|[\u{1F3FB}-\u{1F3FF}]/gu, '').trim();
  if (noEmoji.length > 0) return 0;
  return [...text.matchAll(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu)].length;
}

function mkBody(msg, isMe, isNew) {
  if (msg.type === 'text') {
    const ec = emojiOnlyCount(msg.text);
    const anim = isNew ? ' emoji-anim' : '';
    if (ec === 1)            return `<span class="emoji-xl${anim}">${escHtml(msg.text)}</span>`;
    if (ec >= 2 && ec <= 3) return `<span class="emoji-lg${anim}">${escHtml(msg.text)}</span>`;
    if (ec >= 4 && ec <= 6) return `<span class="emoji-md">${escHtml(msg.text)}</span>`;
    if (ec > 6)             return `<span class="emoji-sm">${escHtml(msg.text)}</span>`;
    return escHtml(msg.text).replace(/\n/g, '<br>');
  }
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
  row.dataset.mid = msg.id;

  const isNew   = Date.now() - msg.ts < 5000;
  const emojiOnly = msg.type === 'text' && emojiOnlyCount(msg.text) > 0;
  const body    = mkBody(msg, isMe, isNew);
  const rHtml   = mkReacts(msg);
  const expLeft = THREE_DAYS - (Date.now() - msg.ts);
  const expH    = Math.max(0, Math.round(expLeft / 3_600_000));

  const replyHtml = msg.replyTo ? `
    <div class="rp-quote" onclick="scrollToMsg('${msg.replyTo.id}')">
      <div class="rp-qname">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5.5l3-3v2c3 0 5.5 1.5 6 5.5-1.5-2.5-3-3.5-6-3.5v2L1 5.5z"/></svg>
        <span class="rp-qlabel">Replying to</span>&nbsp;${escHtml(msg.replyTo.senderName)}
      </div>
      <div class="rp-qtext">${escHtml(msg.replyTo.text).substring(0, 100)}</div>
    </div><div class="rp-qdivider"></div>` : '';

  const sender      = isGroup ? (memberCache[msg.sender] || {}) : {};
  const senderAv    = isGroup ? (sender.avatar   || '👤') : (CCT?.avatar    || '👤');
  const senderPhoto = isGroup ? (sender.photoURL || '')   : (CCT?.photoURL  || '');
  const senderName  = isGroup ? (sender.name     || '')   : (CCT?.name      || '');

  row.innerHTML = `
    ${!isMe ? `<div class="mav">${avH(senderAv, senderPhoto)}</div>` : ''}
    <div class="mc">
      ${!isMe && !con ? `<div class="msn">${escHtml(senderName)}</div>` : ''}
      <div class="bw">
        <div class="bub${emojiOnly ? ' emoji-bub' : ''}" onclick="showRP(event,this,'${msg.id}',${isMe})">${replyHtml}${body}</div>
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

// ── REACTIONS ── (showRP is now in features/msgMenu.js)

window.setReply = (id, text, senderName) => {
  replyTo = { id, text, senderName };
  const bar = el('reply-bar');
  el('reply-name').textContent = senderName;
  el('reply-preview').textContent = text.length > 60 ? text.substring(0, 60) + '…' : text;
  bar.classList.remove('hidden');
  el('msgi').focus();
};

window.copyMsg = mid => {
  const row  = document.querySelector(`[data-mid="${mid}"]`);
  const text = row?.querySelector('.bub')?.innerText?.trim();
  if (!text) { toast('❌ Nothing to copy'); return; }
  navigator.clipboard.writeText(text)
    .then(() => toast('📋 Copied!'))
    .catch(() => toast('❌ Copy failed'));
};

window.cancelReply = () => {
  replyTo = null;
  el('reply-bar').classList.add('hidden');
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
  setTimeout(() => el('msgi')?.focus(), 80);
};
window.togRct = async (mid, em) => {
  const r    = ref(db, `chats/${CCI}/messages/${mid}/reactions/${CU.uid}`);
  const snap = await get(r);
  if (snap.val() === em) await remove(r);
  else await update(ref(db, `chats/${CCI}/messages/${mid}/reactions`), { [CU.uid]: em });
  setTimeout(() => el('msgi')?.focus(), 80);
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
  const data = { type: 'text', text };
  if (replyTo) {
    data.replyTo = { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName };
    cancelReply();
  }
  await sendData(data);
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
  if (type === 'camera') { openCAM(); return; }
  if (!CCI) { toast('Open a chat first'); return; }
  if (type === 'media') el('fi-media').click();
  else                  el('fi-vo').click();
};

async function handleFilePick(e, type) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('❌ Sirf images supported hain'); return; }
  await uploadImageFile(file, type === 'viewonce');
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

window.toggleSB = () => {
  const sb  = document.querySelector('.sidebar');
  const tab = el('sb-open-tab');
  const isNowHidden = sb.classList.toggle('sb-hidden');
  tab.classList.toggle('hidden', !isNowHidden);
  localStorage.setItem('sb-open', String(!isNowHidden));
};

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

window.scrollToMsg = id => {
  const target = el('ma')?.querySelector(`[data-mid="${id}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('msg-highlight');
  setTimeout(() => target.classList.remove('msg-highlight'), 1500);
};

function escJs(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════
const GRP_AVATARS = ['👥','🎉','📚','🏏','🎮','🎵','💼','🌍','🔥','💪','🎨','🤝'];

function loadGroups() {
  onValue(ref(db, `userGroups/${CU.uid}`), async snap => {
    const gcl  = el('gcl');
    gcl.innerHTML = '';
    const data = snap.val() || {};
    const gids = Object.keys(data);
    if (!gids.length) {
      gcl.innerHTML = '<div class="noct" style="padding:18px 10px"><i class="fa fa-users"></i><p>No groups yet</p></div>';
      return;
    }
    const results = await Promise.all(gids.map(async gid => {
      const [gs, lmSnap] = await Promise.all([
        get(ref(db, `groups/${gid}`)),
        get(ref(db, `chats/${gid}/lastMessage`))
      ]);
      return { gid, gs, lm: lmSnap.val() };
    }));
    for (const { gid, gs, lm } of results) {
      if (!gs.exists()) continue;
      const g = gs.val();
      const mc = Object.keys(g.members || {}).length;
      const item = document.createElement('div');
      item.className   = 'ci' + (CCI === gid ? ' act' : '');
      item.dataset.gid = gid;
      item.innerHTML   = `
        <div class="ciav" style="font-size:20px;background:var(--bg3)">${g.avatar || '👥'}</div>
        <div class="cii">
          <div class="cin">${escHtml(g.name)}</div>
          <div class="cip">${lm ? lmPreview(lm) : mc + ' members'}</div>
        </div>
        <div class="cim"><div class="cit">${lm ? fmtTime(lm.ts) : ''}</div></div>`;
      item.onclick = () => openGroupChat(gid, g);
      gcl.appendChild(item);
    }
  });
}

async function openGroupChat(gid, g) {
  isGroup = true; grpData = g; CCT = null; CCI = gid;

  document.querySelectorAll('.ci').forEach(i => i.classList.remove('act'));
  document.querySelector(`.ci[data-gid="${gid}"]`)?.classList.add('act');

  el('cwel').classList.add('hidden');
  const acd = el('acd');
  acd.classList.remove('hidden'); acd.style.display = 'flex';

  el('chav').innerHTML        = g.avatar || '👥';
  el('chn').textContent       = g.name;
  el('gib').style.display     = 'flex';   // show group info button

  const mUids = Object.keys(g.members || {});
  el('chs').textContent = mUids.length + ' members';
  el('chs').className   = 'chs';

  // load member cache in parallel
  memberCache = {};
  await Promise.all(mUids.map(async uid => {
    const s = await get(ref(db, `users/${uid}`));
    if (s.exists()) memberCache[uid] = s.val();
  }));

  // live reactions
  if (unsubLR) unsubLR();
  unsubLR = onChildAdded(ref(db, `liveReactions/${CCI}`), snap => {
    const d = snap.val();
    if (!d || !d.emoji || Date.now() - d.ts > 5000 || d.uid === CU.uid) return;
    showReactionAnim(d.emoji);
    setTimeout(() => remove(snap.ref), 3200);
  });

  // group typing
  onValue(ref(db, `groups/${gid}/typing`), snap => {
    const data = snap.val() || {};
    const now  = Date.now();
    const typers = Object.entries(data)
      .filter(([uid, ts]) => uid !== CU.uid && now - ts < 4000)
      .map(([uid]) => memberCache[uid]?.name || 'Someone');
    const chs = el('chs');
    if (typers.length) {
      chs.textContent = typers[0] + ' is typing...';
      chs.className   = 'chs typing';
    } else {
      chs.textContent = mUids.length + ' members';
      chs.className   = 'chs';
    }
  });

  startMusicSync(gid);
  drawChatOpen();
  loadMsgs();
}

// ── CREATE GROUP ──
const cgSel = new Set();

window.openCG = () => {
  cgSel.clear();
  el('cgn').value = '';
  el('cgerr').textContent = '';

  // avatar picker
  el('cgavp').innerHTML = GRP_AVATARS.map((a, i) =>
    `<div class="avo${i===0?' sel':''}" data-av="${a}" onclick="selAv(this)">${a}</div>`
  ).join('');

  // member checkboxes from contacts
  const html = Object.values(contacts).map(c => `
    <label class="cg-member">
      <input type="checkbox" value="${c.uid}" onchange="cgToggle(this)">
      <span>${c.avatar || '👤'} ${escHtml(c.name)}</span>
    </label>`).join('');
  el('cgmems').innerHTML = html || '<div style="color:var(--text3);font-size:12px">Add friends first</div>';

  el('cgm').classList.add('show');
};
window.closeCG = () => el('cgm').classList.remove('show');
window.cgToggle = cb => { cb.checked ? cgSel.add(cb.value) : cgSel.delete(cb.value); };

window.confirmCG = async () => {
  const name   = el('cgn').value.trim();
  const avatar = document.querySelector('#cgavp .avo.sel')?.dataset.av || '👥';
  if (!name) { el('cgerr').textContent = 'Group name is required'; return; }
  if (!cgSel.size) { el('cgerr').textContent = 'Add at least 1 member'; return; }

  const members = { [CU.uid]: true };
  cgSel.forEach(uid => members[uid] = true);

  const gRef = push(ref(db, 'groups'));
  const gid  = gRef.key;
  await set(gRef, { id: gid, name, avatar, createdBy: CU.uid, createdAt: Date.now(), members });
  await Promise.all(Object.keys(members).map(uid =>
    set(ref(db, `userGroups/${uid}/${gid}`), true)
  ));

  closeCG();
  toast('✅ Group created!');
};

// ── GROUP INFO (members) ──
window.openGI = async () => {
  if (!isGroup || !grpData) return;
  const mUids = Object.keys(grpData.members || {});
  el('gi-title').textContent = grpData.avatar + ' ' + grpData.name;
  el('gi-list').innerHTML = mUids.map(uid => {
    const m = memberCache[uid] || {};
    const tag = grpData.createdBy === uid ? ' <span style="font-size:9px;color:var(--accent);font-weight:700">ADMIN</span>' : '';
    return `<div class="ci" style="pointer-events:none">
      <div class="ciav">${m.avatar || '👤'}</div>
      <div class="cii"><div class="cin">${escHtml(m.name || uid)}${tag}</div></div>
    </div>`;
  }).join('');

  // add member section
  const nonMembers = Object.values(contacts).filter(c => !grpData.members[c.uid]);
  el('gi-add').innerHTML = nonMembers.length ? `
    <label style="font-size:11px;font-weight:600;color:var(--text2);letter-spacing:.5px;text-transform:uppercase">Add Member</label>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
      ${nonMembers.map(c => `
        <label class="cg-member">
          <input type="checkbox" value="${c.uid}" id="gi_${c.uid}">
          <span>${c.avatar || '👤'} ${escHtml(c.name)}</span>
        </label>`).join('')}
    </div>
    <button class="btnp" style="margin-top:10px" onclick="addGIMembers()">
      <i class="fa fa-user-plus"></i> Add Selected
    </button>` : '';

  el('gim').classList.add('show');
};
window.closeGI = () => el('gim').classList.remove('show');

window.addGIMembers = async () => {
  const toAdd = Object.values(contacts)
    .filter(c => document.getElementById('gi_' + c.uid)?.checked);
  if (!toAdd.length) { toast('Select at least 1 person'); return; }
  await Promise.all(toAdd.map(async c => {
    await set(ref(db, `groups/${CCI}/members/${c.uid}`), true);
    await set(ref(db, `userGroups/${c.uid}/${CCI}`), true);
  }));
  closeGI();
  toast('✅ Members added!');
};

// ═══════════════════════════════════════
//  LIVE REACTIONS (Google Meet style)
// ═══════════════════════════════════════
const LIVE_REACTS = ['🫂','🥰','😘','😁','😭','😂','🤣','🌚','😱','🥺','🥲','💋','😛'];

// ── LRP custom drag (with auto-orient near screen edges) ──
{
  const lrp = el('lrp');
  let drag = null;
  lrp.addEventListener('mousedown', e => {
    if (!e.target.closest('.lrp-handle')) return;
    const r = lrp.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    lrp.style.transition = 'none';
    e.preventDefault();
  });
  lrp.addEventListener('touchstart', e => {
    if (!e.target.closest('.lrp-handle')) return;
    const r = lrp.getBoundingClientRect();
    const t = e.touches[0];
    drag = { ox: t.clientX - r.left, oy: t.clientY - r.top };
    lrp.style.transition = 'none';
    e.preventDefault();
  }, { passive: false });
  const onMove = e => {
    if (!drag) return;
    const pt = e.touches?.[0] || e;
    const x = Math.max(0, Math.min(pt.clientX - drag.ox, window.innerWidth  - lrp.offsetWidth));
    const y = Math.max(0, Math.min(pt.clientY - drag.oy, window.innerHeight - lrp.offsetHeight));
    lrp.style.left = x + 'px'; lrp.style.top = y + 'px';
    lrp.style.right = 'auto'; lrp.style.bottom = 'auto';
    // Auto-orient: vertical strip when near left/right edge
    const nearEdge = x < 90 || x + lrp.offsetWidth > window.innerWidth - 90;
    lrp.classList.toggle('lrp-vert', nearEdge);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup',  () => { drag = null; });
  document.addEventListener('touchend', () => { drag = null; });
}

window.closeLRP = () => { el('lrp').classList.add('hidden'); };
window.toggleLRP = () => {
  const lrp = el('lrp');
  if (lrp.classList.contains('hidden')) {
    lrp.innerHTML = `
      <div class="lrp-handle"><div class="lrp-handle-dots"></div></div>
      <button class="lrp-close" onclick="closeLRP()" title="Close">✕</button>
      <div class="lrp-emojis">
        ${LIVE_REACTS.map(r => `<span class="lre" onclick="sendLiveReact('${r}')">${r}</span>`).join('')}
      </div>`;
    lrp.classList.remove('hidden');
    // prevent focus steal on click
    lrp.addEventListener('mousedown', e => e.preventDefault(), { capture: true });
    if (!lrp.style.left) {
      requestAnimationFrame(() => {
        const btn = el('lrb');
        const br  = btn.getBoundingClientRect();
        const pw  = lrp.offsetWidth || 240;
        lrp.style.left   = Math.max(10, br.right - pw) + 'px';
        lrp.style.top    = (br.bottom + 10) + 'px';
        lrp.style.right  = 'auto'; lrp.style.bottom = 'auto';
      });
    }
  } else {
    lrp.classList.add('hidden');
  }
};

window.sendLiveReact = async emoji => {
  // panel band NAHI hoga — multiple reactions bhej sakte ho
  showReactionAnim(emoji);
  el('msgi')?.focus();
  const r = await push(ref(db, `liveReactions/${CCI}`), { emoji, uid: CU.uid, ts: Date.now() });
  setTimeout(() => remove(r), 3500);
};

function showReactionAnim(emoji) {
  const count = 3 + Math.floor(Math.random() * 2); // 3 ya 4 emojis
  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnOneEmoji(emoji), i * 100);
  }
}

function spawnOneEmoji(emoji) {
  const canvas = el('rcanvas');
  if (!canvas) return;
  const div = document.createElement('div');
  div.className   = 'lr-float';
  div.textContent = emoji;
  div.style.left  = (5 + Math.random() * 68) + '%';
  div.style.setProperty('--rot', (Math.random() * 40 - 20) + 'deg');
  canvas.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

// lrp panel sirf X button se band hoga — click bahar se nahi

// ═══════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════
let notifUnsubs = [];

async function initNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// WhatsApp-style ding using Web Audio API — no file needed
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);

    // second small ding
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.22);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.55);
  } catch (_) {}
}

function setupNotifForContact(uid, uName, uAvatar) {
  const chatId  = cid(CU.uid, uid);
  const initTs  = Date.now();
  let   ready   = false;

  // onChildAdded fires once per message — perfect for new message detection
  const unsub = onChildAdded(ref(db, `chats/${chatId}/messages`), snap => {
    const msg = snap.val();
    if (!msg) return;

    // skip old messages loaded on init
    if (!ready) {
      if (msg.ts < initTs - 2000) return;  // old message, skip
      // first message after init time — mark ready after a short window
      setTimeout(() => { ready = true; }, 1500);
      return;
    }

    if (msg.sender === CU.uid) return;  // apna message

    // sound har case mein — tab active ho ya hidden
    playNotifSound();

    // notification sirf tab hidden ho ya dusra chat open ho
    if (!document.hidden && CCI === chatId) return;

    if (Notification.permission !== 'granted') return;

    const body = msg.type === 'text'  ? msg.text.substring(0, 80)
               : msg.type === 'image' ? '📷 Photo'
               : msg.type === 'video' ? '🎥 Video'
               : '📎 File';

    const n = new Notification(`${uAvatar} ${uName}`, {
      body,
      icon: 'https://cdn.jsdelivr.net/npm/twemoji@14/assets/72x72/1f4ac.png',
      tag: chatId,
      renotify: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
  });

  notifUnsubs.push(unsub);
}

// ── TYPING INDICATOR ──
let typingTimer;
function onTyping() {
  if (!CCI || !CU) return;
  if (isGroup) {
    update(ref(db, `groups/${CCI}/typing`), { [CU.uid]: Date.now() });
  } else {
    update(ref(db, `users/${CU.uid}`), { typingIn: CCI });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (isGroup) {
      update(ref(db, `groups/${CCI}/typing`), { [CU.uid]: null });
    } else {
      update(ref(db, `users/${CU.uid}`), { typingIn: null });
    }
  }, 2500);
}

// ── LAST SEEN FORMAT ──
function fmtLastSeen(ts) {
  if (!ts) return 'recently';
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff / 60000) + ' min ago';
  const d    = new Date(ts);
  const now  = new Date();
  if (d.toDateString() === now.toDateString()) return 'today at ' + fmtTime(ts);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'yesterday at ' + fmtTime(ts);
  return d.toLocaleDateString('en-IN') + ' at ' + fmtTime(ts);
}

// ── CAMERA ──
let camStream = null;

window.openCAM = async () => {
  if (!CCI) { toast('Open a chat first'); return; }
  el('camm').classList.add('show');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    el('camv').srcObject = camStream;
  } catch (err) {
    toast('❌ Camera access denied');
    closeCAM();
  }
};

window.closeCAM = () => {
  el('camm').classList.remove('show');
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
};

window.capturePhoto = () => {
  const video  = el('camv');
  const canvas = el('camc');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  closeCAM();
  canvas.toBlob(async blob => {
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadImageFile(file, false);
  }, 'image/jpeg', 0.88);
};

window.uploadProfilePic = async (file) => {
  if (!file || !CU) return;
  if (file.size > 8 * 1024 * 1024) { toast('❌ Max 8 MB'); return; }
  toast('⏫ Uploading photo…');
  try {
    // Compress to max 400×400 via canvas
    const compressed = await new Promise(res => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 400;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(res, 'image/jpeg', 0.85);
      };
      img.src = url;
    });
    const b64  = await toBase64(compressed);
    const form = new FormData();
    form.append('image', b64.split(',')[1]);
    const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Upload failed');
    const photoURL = json.data.url;

    // Save to Firebase
    await update(ref(db, `users/${CU.uid}`), { photoURL });

    // Update all visible displays immediately
    const imgTag = `<img src="${photoURL}" class="av-img" alt="">`;
    el('spav').innerHTML  = imgTag;
    el('myav').innerHTML  = imgTag + `<div class="sd"></div>`;

    // Update contact list item for this user (if contact sees us)
    toast('✅ Profile photo updated!');
  } catch (err) {
    console.error(err);
    toast('❌ Upload failed: ' + err.message);
  }
};

async function uploadImageFile(file, viewOnce) {
  if (file.size > 10 * 1024 * 1024) { toast('❌ Max image size: 10 MB'); return; }
  if (!IMGBB_KEY || IMGBB_KEY === 'YOUR_IMGBB_API_KEY_HERE') { toast('❌ ImgBB API key missing'); return; }
  toast('⏫ Uploading...');
  try {
    const b64  = await toBase64(file);
    const form = new FormData();
    form.append('image', b64.split(',')[1]);
    const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Upload failed');
    const data = { type: 'image', url: json.data.url, name: file.name, size: file.size };
    if (viewOnce) data.viewOnce = true;
    await sendData(data);
    toast('✅ Sent!');
  } catch (err) {
    console.error(err);
    toast('❌ Upload failed: ' + err.message);
  }
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

// ═══════════════════════════════════════
//  🎵 SHARED MUSIC
// ═══════════════════════════════════════

// Load YouTube IFrame API once
(function loadYTApi() {
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
})();
window.onYouTubeIframeAPIReady = function () { ytReady = true; };

function musicPath() {
  if (!CCI) return null;
  return isGroup ? `groups/${CCI}/music` : `chats/${CCI}/music`;
}

let mpDragInited = false;
window.toggleMusic = function () {
  const panel = el('music-panel');
  mpOpen = !mpOpen;
  panel.classList.toggle('hidden', !mpOpen);
  if (mpOpen) {
    if (!mpDragInited) {
      makeDraggable(panel, panel.querySelector('.mp-header'));
      mpDragInited = true;
    }
    // Position near the music button on first open
    if (!panel.style.left) {
      requestAnimationFrame(() => {
        const btn = el('mpb');
        const br  = btn.getBoundingClientRect();
        const pw  = panel.offsetWidth || 320;
        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left   = Math.max(10, br.right - pw) + 'px';
        panel.style.top    = (br.bottom + 10) + 'px';
      });
    }
    el('mp-search-inp').focus();
  }
};

// Try to extract a YouTube video ID from a URL or plain ID string
function extractVid(str) {
  str = str.trim();
  // full URL forms
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) return m[1];
  }
  // bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(str)) return str;
  return null;
}

// ── Instagram URL → { shortcode, type } ──
function extractInsta(str) {
  str = str.trim();
  const m = str.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const type = str.includes('/reel/') || str.includes('/tv/') ? 'reel' : 'p';
  return { shortcode: m[1], type };
}

window.mpPlayInsta = async function(shortcode, type, title) {
  if (!CCI) { toast('Open a chat first'); return; }
  const url = `https://www.instagram.com/${type}/${shortcode}/`;
  await set(ref(db, musicPath()), {
    mediaType: 'instagram', shortcode, instaType: type,
    url, title: title || 'Instagram ' + (type === 'reel' ? 'Reel' : 'Post'),
    by: CU.uid, ts: Date.now()
  });
  if (!mpOpen) window.toggleMusic();
  toast('📸 Sharing Instagram ' + (type === 'reel' ? 'Reel' : 'Post') + '!');
};

function mpLoadInsta(shortcode, type) {
  el('yt-player').innerHTML = '';
  el('mp-player-wrap').classList.remove('hidden');
  el('yt-player').classList.add('hidden');
  const wrap = el('insta-player-wrap');
  wrap.classList.remove('hidden');
  const embedUrl = `https://www.instagram.com/${type}/${shortcode}/embed/`;
  el('insta-frame').src = embedUrl;
}

// ── search via multiple free APIs ──
const SEARCH_ENDPOINTS = [
  // Piped instances (return {items:[{url,title,thumbnail,uploaderName,duration}]})
  q => ({ url: `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=all`, type: 'piped' }),
  q => ({ url: `https://api.piped.projectsegfau.lt/search?q=${encodeURIComponent(q)}&filter=all`, type: 'piped' }),
  q => ({ url: `https://piped-api.garudalinux.org/search?q=${encodeURIComponent(q)}&filter=all`, type: 'piped' }),
  // Invidious instances (return [{videoId,title,videoThumbnails,author,lengthSeconds}])
  q => ({ url: `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video`, type: 'invidious' }),
  q => ({ url: `https://inv.tmate.io/api/v1/search?q=${encodeURIComponent(q)}&type=video`, type: 'invidious' }),
  q => ({ url: `https://yt.cdaut.de/api/v1/search?q=${encodeURIComponent(q)}&type=video`, type: 'invidious' }),
];

function normalisePiped(data) {
  return (data.items || [])
    .filter(i => i.url && i.url.includes('watch'))
    .map(i => ({
      vid: i.url.split('v=')[1]?.split('&')[0],
      title: i.title || '',
      thumb: i.thumbnail || '',
      sub: i.uploaderName || '',
      dur: i.duration > 0 ? fmtDur(i.duration) : ''
    }))
    .filter(i => i.vid);
}

function normaliseInvidious(data) {
  return (Array.isArray(data) ? data : [])
    .map(i => ({
      vid: i.videoId,
      title: i.title || '',
      thumb: (i.videoThumbnails || []).find(t => t.quality === 'medium')?.url
          || (i.videoThumbnails || [])[0]?.url || '',
      sub: i.author || '',
      dur: i.lengthSeconds > 0 ? fmtDur(i.lengthSeconds) : ''
    }))
    .filter(i => i.vid);
}

window.mpSearch = async function () {
  const raw = el('mp-search-inp').value.trim();
  if (!raw) return;

  // Instagram link → share directly
  const insta = extractInsta(raw);
  if (insta) {
    window.mpPlayInsta(insta.shortcode, insta.type);
    el('mp-search-inp').value = '';
    return;
  }

  // If user pasted a YouTube URL → play directly
  const directVid = extractVid(raw);
  if (directVid) {
    // fetch title via oEmbed so receiver sees a real name
    let title = raw;
    try {
      const oe = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directVid}&format=json`);
      if (oe.ok) { const d = await oe.json(); title = d.title || raw; }
    } catch (_) {}
    mpPlay(directVid, title);
    return;
  }

  const res = el('mp-results');
  res.innerHTML = '<div class="mp-loading"><span class="mp-spin"></span> Searching…</div>';

  let results = [];
  for (const ep of SEARCH_ENDPOINTS) {
    const { url, type } = ep(raw);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const data = await r.json();
      results = type === 'piped' ? normalisePiped(data) : normaliseInvidious(data);
      if (results.length) break;
    } catch (_) {}
  }

  if (!results.length) {
    res.innerHTML = `<div class="mp-loading">No results — try pasting a YouTube link directly</div>`;
    return;
  }

  res.innerHTML = results.slice(0, 10).map(item => {
    const thumb = item.thumb || `https://img.youtube.com/vi/${item.vid}/mqdefault.jpg`;
    return `<div class="mp-result" onclick="mpPlay('${item.vid}','${escAttr(item.title)}','${escAttr(thumb)}')">
      <img class="mp-thumb" src="${thumb}" onerror="this.src='https://img.youtube.com/vi/${item.vid}/mqdefault.jpg'">
      <div class="mp-rmeta">
        <div class="mp-rtitle">${item.title}</div>
        <div class="mp-rsub">${item.sub}${item.dur ? ' · ' + item.dur : ''}</div>
      </div>
      <div class="mp-play-ico">▶</div>
    </div>`;
  }).join('');
};

function fmtDur(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function escAttr(s) { return (s || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;"); }

window.mpPlay = async function (videoId, title, thumb) {
  if (!CCI) { toast('Open a chat first'); return; }
  const thumbnail = thumb || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const now = Date.now();
  mpLastSeekedAt = now;
  await set(ref(db, musicPath()), {
    videoId, title, thumbnail,
    playing: true, seekedTo: 0, seekedAt: now, by: CU.uid
  });
  if (!mpOpen) window.toggleMusic();
  toast('🎵 Playing for both!');
};

// mpLoadPlayer — seekStartedAt is the Date.now() when playback began (for accurate live calc)
function mpLoadPlayer(videoId, seekOffset, seekStartedAt, shouldPlay) {
  el('mp-player-wrap').classList.remove('hidden');
  const wrap = el('yt-player');

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    // existing player — load new video, then seek accurately in onReady via a one-shot flag
    mpPendingSeek = { seekOffset, seekStartedAt, shouldPlay };
    try { ytPlayer.loadVideoById(videoId); } catch (_) {}
    return;
  }
  if (!ytReady) { setTimeout(() => mpLoadPlayer(videoId, seekOffset, seekStartedAt, shouldPlay), 400); return; }

  wrap.innerHTML = '';
  const div = document.createElement('div');
  div.id = 'yt-inner';
  wrap.appendChild(div);
  mpPendingSeek = { seekOffset, seekStartedAt, shouldPlay };
  ytPlayer = new YT.Player('yt-inner', {
    height: '100%', width: '100%',
    videoId,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, iv_load_policy: 3 },
    events: {
      onReady: onYTReady,
      onStateChange: onYTState
    }
  });
}

function onYTReady(e) {
  if (!mpPendingSeek) return;
  const { seekOffset, seekStartedAt, shouldPlay } = mpPendingSeek;
  mpPendingSeek = null;
  const elapsed = seekStartedAt ? (Date.now() - seekStartedAt) / 1000 : 0;
  const ct = seekOffset + (shouldPlay ? elapsed : 0);
  mpSyncing = true;
  e.target.seekTo(ct, true);
  setTimeout(() => {
    try {
      if (shouldPlay) e.target.playVideo();
      else e.target.pauseVideo();
    } catch (_) {}
    // Keep mpSyncing true long enough to absorb buffering → playing state chain
    setTimeout(() => { mpSyncing = false; }, 1800);
  }, 300);
}

let mpLastStatePush = 0;  // debounce — don't push more than once per 1.5s
function onYTState(e) {
  if (mpSyncing || !CCI) return;
  const now = Date.now();
  // Debounce: ignore rapid state changes (buffering → playing etc.)
  if (now - mpLastStatePush < 1500) return;
  const path = musicPath();
  if (e.data === YT.PlayerState.PLAYING) {
    const ct = ytPlayer.getCurrentTime() || 0;
    mpLastFB = { ...(mpLastFB || {}), playing: true,  seekedTo: ct, seekedAt: now, by: CU.uid };
    mpLastSeekedAt = now; mpLastStatePush = now;
    update(ref(db, path), { playing: true,  seekedTo: ct, seekedAt: now, by: CU.uid });
  } else if (e.data === YT.PlayerState.PAUSED) {
    const ct = ytPlayer.getCurrentTime() || 0;
    mpLastFB = { ...(mpLastFB || {}), playing: false, seekedTo: ct, seekedAt: now, by: CU.uid };
    mpLastSeekedAt = now; mpLastStatePush = now;
    update(ref(db, path), { playing: false, seekedTo: ct, seekedAt: now, by: CU.uid });
  }
}

window.mpTogglePlay = function () {
  if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;
  if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
};

window.mpStop = async function () {
  if (!CCI) return;
  await set(ref(db, musicPath()), null);
  if (ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
  el('mp-player-wrap').classList.add('hidden');
  el('mp-now-title').textContent = '';
  el('insta-frame').src = '';
  el('insta-player-wrap').classList.add('hidden');
  el('yt-player').classList.remove('hidden');
  mpLastVid = null;
};

function renderNowPlaying(m) {
  el('mp-now-title').textContent = m.title || 'Now Playing';
  if (m.mediaType === 'instagram') {
    el('mp-np-thumb').src = '';
    el('mp-np-thumb').style.display = 'none';
  } else {
    el('mp-np-thumb').style.display = '';
    const thumb = m.thumbnail || `https://img.youtube.com/vi/${m.videoId}/mqdefault.jpg`;
    el('mp-np-thumb').src = thumb;
    el('mp-np-thumb').onerror = () => { el('mp-np-thumb').src = `https://img.youtube.com/vi/${m.videoId}/mqdefault.jpg`; };
  }
  el('mp-player-wrap').classList.remove('hidden');
  if (!mpOpen) window.toggleMusic();
}

// ── Seek-drift polling: detect local scrubs and push to Firebase ──
function startSeekPoll() {
  if (mpSyncInterval) clearInterval(mpSyncInterval);
  mpSyncInterval = setInterval(() => {
    if (!ytPlayer || !CCI || mpSyncing || !mpLastFB) return;
    if (typeof ytPlayer.getPlayerState !== 'function') return;
    const state = ytPlayer.getPlayerState();
    if (state !== YT.PlayerState.PLAYING) return;

    // ── Only the owner (last person to touch video) pushes drift ──
    // Receiver just follows — prevents ping-pong sync loop
    if (mpLastFB.by !== CU?.uid) return;

    const ct       = ytPlayer.getCurrentTime();
    const elapsed  = (Date.now() - mpLastFB.seekedAt) / 1000;
    const expected = (mpLastFB.seekedTo || 0) + elapsed;

    if (Math.abs(ct - expected) > 3) {
      const now = Date.now();
      if (now - mpLastStatePush < 1500) return; // debounce
      mpLastFB = { ...mpLastFB, seekedTo: ct, seekedAt: now, playing: true, by: CU.uid };
      mpLastSeekedAt = now; mpLastStatePush = now;
      update(ref(db, musicPath()), { seekedTo: ct, seekedAt: now, playing: true, by: CU.uid });
    }
  }, 600);
}

function applyRemoteSeek(m) {
  const elapsed = m.playing ? (Date.now() - m.seekedAt) / 1000 : 0;
  const ct = (m.seekedTo || 0) + elapsed;
  mpSyncing = true;
  try { ytPlayer?.seekTo?.(ct, true); } catch (_) {}
  setTimeout(() => {
    try {
      if (m.playing) ytPlayer?.playVideo?.();
      else ytPlayer?.pauseVideo?.();
    } catch (_) {}
    setTimeout(() => { mpSyncing = false; }, 1800);
  }, 250);
}

function startMusicSync(chatId) {
  if (musicUnsub) { musicUnsub(); musicUnsub = null; }
  if (mpSyncInterval) { clearInterval(mpSyncInterval); mpSyncInterval = null; }
  mpLastFB = null; mpLastSeekedAt = 0;

  const path = isGroup ? `groups/${chatId}/music` : `chats/${chatId}/music`;
  mpLastVid = null;

  musicUnsub = onValue(ref(db, path), snap => {
    const m = snap.val();
    if (!m) {
      el('mp-player-wrap').classList.add('hidden');
      el('mp-now-title').textContent = '';
      if (ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
      mpLastVid = null; mpLastFB = null;
      if (mpSyncInterval) { clearInterval(mpSyncInterval); mpSyncInterval = null; }
      return;
    }

    mpLastFB = m;
    renderNowPlaying(m);

    // ── Instagram embed (no seek sync — just show) ──
    if (m.mediaType === 'instagram') {
      const key = m.shortcode + m.instaType;
      if (key !== mpLastVid) {
        mpLastVid = key;
        mpLoadInsta(m.shortcode, m.instaType || 'p');
      }
      return;
    }

    // ── YouTube ──
    el('insta-player-wrap')?.classList.add('hidden');
    el('yt-player').classList.remove('hidden');
    const fromMe = m.by === CU?.uid;

    if (m.videoId !== mpLastVid) {
      mpLastVid = m.videoId;
      mpLastSeekedAt = m.seekedAt;
      mpSyncing = true;
      mpLoadPlayer(m.videoId, m.seekedTo || 0, m.seekedAt, m.playing);
      setTimeout(startSeekPoll, 2500);

    } else if (!fromMe && m.seekedAt !== mpLastSeekedAt) {
      mpLastSeekedAt = m.seekedAt;
      applyRemoteSeek(m);

    } else if (fromMe) {
      mpLastSeekedAt = m.seekedAt;
    }
    // (no else needed — play/pause is handled inside applyRemoteSeek + onYTState)
  });
}

// ── file input listeners ──
el('fi-media').addEventListener('change', e => handleFilePick(e, 'media'));
el('fi-vo').addEventListener('change',    e => handleFilePick(e, 'viewonce'));

// ── typing listener ──
el('msgi').addEventListener('input', onTyping);

// ── ESC to close lightbox ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') el('lb')?.classList.add('hidden');
});

// ── init ──
applyTheme(localStorage.getItem('iitchat-theme') || 'dark');
showCat('smileys', null);
