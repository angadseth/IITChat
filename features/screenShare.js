// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
//  Video + audio only, no cursor/pointer
// ══════════════════════════════════════════════════════

const ICE_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username:   'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

export function initScreenShare(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbPush, dbUpdate, getState, toastFn) {

  let pc            = null;
  let localStream   = null;
  let unsubIncoming = null;
  let unsubAns      = null;
  let unsubVICE     = null;

  // ─────────────────────────────────
  //  Watch bar
  // ─────────────────────────────────
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
      <button class="ss-watch-close" onclick="this.closest('#ss-watch-bar').remove()">✕</button>`;
  }

  function hideWatchBar() { document.getElementById('ss-watch-bar')?.remove(); }

  function setShareUI(active) {
    const btn = document.getElementById('ss-btn');
    if (!btn) return;
    btn.innerHTML = active
      ? '<i class="fa fa-stop-circle" style="color:#ff4f6b"></i>'
      : '<i class="fa fa-desktop"></i>';
    btn.title = active ? 'Stop screen share' : 'Share screen';
    btn.classList.toggle('ss-active', active);
  }

  // ─────────────────────────────────
  //  ssInit — called when chat opens
  // ─────────────────────────────────
  window.ssInit = (cci) => {
    unsubIncoming?.();
    hideWatchBar();
    unsubIncoming = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();
      if (!data?.active) { hideWatchBar(); return; }
      if (data.by === CU?.uid) return;
      showWatchBar(data.sharerName || 'Partner');
    });
  };

  // ─────────────────────────────────
  //  Start sharing
  // ─────────────────────────────────
  window.startSS = async () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    if (localStream) { window.stopSS(); return; }

    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true
      });
    } catch { return; }

    pc = new RTCPeerConnection(ICE_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await dbSet(dbRef(db, `screenShare/${CCI}`), {
      active:     true,
      by:         CU.uid,
      sharerName: CU.displayName || 'Partner',
      offer:      { sdp: offer.sdp, type: offer.type }
    });

    // queue viewer ICE candidates that arrive before answer/remote-desc is set
    const pendingICE = [];
    let remoteReady  = false;

    const flushICE = () => {
      while (pendingICE.length) {
        pc?.addIceCandidate(new RTCIceCandidate(pendingICE.shift())).catch(() => {});
      }
    };

    const seenKeys = new Set();
    unsubVICE = dbOnValue(dbRef(db, `screenShare/${CCI}/ice_viewer`), snap => {
      snap.forEach(child => {
        if (seenKeys.has(child.key)) return;
        seenKeys.add(child.key);
        const c = child.val();
        if (remoteReady) pc?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        else pendingICE.push(c);
      });
    });

    unsubAns = dbOnValue(dbRef(db, `screenShare/${CCI}/answer`), async snap => {
      if (!snap.val() || pc?.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
      remoteReady = true;
      flushICE();
    });

    setShareUI(true);
    toastFn('🖥️ Sharing started');
  };

  // ─────────────────────────────────
  //  Stop sharing
  // ─────────────────────────────────
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

  // ─────────────────────────────────
  //  Open viewer window
  // ─────────────────────────────────
  window.ssWatch = () => {
    const { CCI } = getState();
    if (!CCI) return;
    window.open(
      `screenshare.html?cci=${encodeURIComponent(CCI)}`,
      '_blank',
      'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no'
    );
  };
}
