// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
// ══════════════════════════════════════════════════════

const ICE_CFG = {
  iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    {urls:'stun:stun2.l.google.com:19302'},
  ]
};

export function initScreenShare(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbPush, dbUpdate, getState, toastFn) {

  let pc             = null;
  let localStream    = null;
  let unsubIncoming  = null;
  let unsubAns       = null;
  let unsubVICE      = null;
  let cursorThrottle = 0;
  let overlayWin     = null;

  // ─────────────────────────────────
  //  Watch bar + helpers
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
    btn.innerHTML = active ? '<i class="fa fa-stop-circle" style="color:#ff4f6b"></i>' : '<i class="fa fa-desktop"></i>';
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
        video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } },
        audio: true
      });
    } catch { return; }

    pc = new RTCPeerConnection(ICE_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    // push sharer cursor (viewer sees it as purple dot on video)
    const onMouse = e => {
      const now = Date.now();
      if (now - cursorThrottle < 40) return;
      cursorThrottle = now;
      dbSet(dbRef(db, `screenShare/${CCI}/cursors/sharer`), {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        name: CU?.displayName || 'Sharer'
      });
    };
    document.addEventListener('mousemove', onMouse);
    localStream.getVideoTracks()[0]._onMouse = onMouse;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await dbSet(dbRef(db, `screenShare/${CCI}`), {
      active:     true,
      by:         CU.uid,
      sharerName: CU.displayName || 'Partner',
      vpW:        window.innerWidth,
      vpH:        window.innerHeight,
      winX:       window.screenX,
      winY:       window.screenY,
      chromeW:    window.outerWidth  - window.innerWidth,
      chromeH:    window.outerHeight - window.innerHeight,
      offer:      { sdp: offer.sdp, type: offer.type }
    });

    unsubAns = dbOnValue(dbRef(db, `screenShare/${CCI}/answer`), async snap => {
      if (!snap.val() || pc?.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    });

    unsubVICE = dbOnValue(dbRef(db, `screenShare/${CCI}/ice_viewer`), snap => {
      snap.forEach(c => pc?.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}));
    });

    // Open transparent overlay — positions viewer cursor at exact screen coords
    overlayWin = window.open(
      `ss-overlay.html?cci=${encodeURIComponent(CCI)}`,
      'ss-overlay',
      `width=${screen.width},height=${screen.height},top=0,left=0,` +
      `menubar=no,toolbar=no,location=no,status=no`
    );

    setShareUI(true);
    toastFn('🖥️ Sharing started — viewer cursor will appear on your screen');
  };

  // ─────────────────────────────────
  //  Stop sharing
  // ─────────────────────────────────
  window.stopSS = async () => {
    const { CCI } = getState();
    const track = localStream?.getVideoTracks()[0];
    if (track?._onMouse) document.removeEventListener('mousemove', track._onMouse);
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null; localStream = null;
    unsubAns?.(); unsubVICE?.();
    overlayWin?.close(); overlayWin = null;
    if (CCI) await dbRemove(dbRef(db, `screenShare/${CCI}`));
    setShareUI(false);
    toastFn('🖥️ Screen share stopped');
  };

  // ─────────────────────────────────
  //  Open viewer window
  // ─────────────────────────────────
  window.ssWatch = () => {
    const { CCI, CU } = getState();
    if (!CCI) return;
    const name = encodeURIComponent(CU?.displayName || 'Viewer');
    window.open(
      `screenshare.html?cci=${encodeURIComponent(CCI)}&name=${name}`,
      '_blank',
      'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no'
    );
  };
}
