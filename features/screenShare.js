// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
//  Sharer  : getDisplayMedia → Firebase signaling → peer
//  Viewer  : screenshare.html opened in new window
// ══════════════════════════════════════════════════════

const ICE_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function initScreenShare(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbPush, dbUpdate, getState, toastFn) {

  let pc          = null;
  let localStream = null;
  let unsubOffer  = null;
  let unsubAns    = null;
  let unsubVICE   = null;
  let currentCCI  = null;

  // ── helper: Firebase path for this session ──
  const ssRef = (path = '') => dbRef(db, `screenShare/${currentCCI}${path ? '/' + path : ''}`);

  // ── Show/hide sharer indicator ──
  function setShareUI(active) {
    const btn = document.getElementById('ss-btn');
    if (!btn) return;
    if (active) {
      btn.innerHTML = '<i class="fa fa-stop-circle" style="color:#ff4f6b"></i>';
      btn.title = 'Stop screen share';
      btn.classList.add('ss-active');
    } else {
      btn.innerHTML = '<i class="fa fa-desktop"></i>';
      btn.title = 'Share screen';
      btn.classList.remove('ss-active');
    }
  }

  // ── Show incoming share bar ──
  function showWatchBar(sharerName) {
    let bar = document.getElementById('ss-watch-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ss-watch-bar';
      bar.className = 'ss-watch-bar';
      document.getElementById('acd')?.prepend(bar);
    }
    bar.innerHTML = `
      <span class="ss-watch-dot"></span>
      <span><b>${sharerName}</b> is sharing their screen</span>
      <button class="ss-watch-btn" onclick="ssWatch()">Watch</button>
      <button class="ss-watch-close" onclick="document.getElementById('ss-watch-bar')?.remove()">✕</button>`;
    bar.classList.remove('hidden');
  }

  function hideWatchBar() {
    document.getElementById('ss-watch-bar')?.remove();
  }

  // ── Called when chat opens (listen for incoming share) ──
  window.ssInit = (cci) => {
    currentCCI = cci;
    unsubOffer?.();
    hideWatchBar();

    unsubOffer = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();
      if (!data || !data.active) { hideWatchBar(); return; }
      if (data.by === CU?.uid) return; // don't show to self
      showWatchBar(data.sharerName || 'Partner');
    });
  };

  // ── Start sharing ──
  window.startSS = async () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }

    // already sharing? stop
    if (localStream) { window.stopSS(); return; }

    currentCCI = CCI;

    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: 30 },
        audio: false
      });
    } catch { return; } // user cancelled picker

    pc = new RTCPeerConnection(ICE_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    // stop when browser stop button clicked
    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    // push ICE candidates to Firebase
    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await dbSet(dbRef(db, `screenShare/${CCI}`), {
      active:      true,
      by:          CU.uid,
      sharerName:  CU.displayName || 'Partner',
      offer:       { sdp: offer.sdp, type: offer.type }
    });

    // wait for viewer answer
    unsubAns = dbOnValue(dbRef(db, `screenShare/${CCI}/answer`), async snap => {
      if (!snap.val() || pc?.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    });

    // viewer ICE candidates
    unsubVICE = dbOnValue(dbRef(db, `screenShare/${CCI}/ice_viewer`), snap => {
      snap.forEach(c => pc?.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}));
    });

    setShareUI(true);
    toastFn('🖥️ Screen sharing started');
  };

  // ── Stop sharing ──
  window.stopSS = async () => {
    const { CCI } = getState();
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null; localStream = null;
    unsubAns?.(); unsubVICE?.();
    if (CCI) await dbRemove(dbRef(db, `screenShare/${CCI}`));
    setShareUI(false);
    toastFn('🖥️ Screen share stopped');
  };

  // ── Viewer opens new window ──
  window.ssWatch = () => {
    const { CCI } = getState();
    if (!CCI) return;
    const url = `screenshare.html?cci=${encodeURIComponent(CCI)}`;
    window.open(url, '_blank', 'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no');
  };
}
