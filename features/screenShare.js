// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
//  + audio  + cursor sync  + visual remote control
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
  let unsubViewerCur = null;
  let unsubControl   = null;
  let controlGranted = false;
  let cursorThrottle = 0;
  let overlayWin     = null;

  // ─────────────────────────────────
  //  Overlay dot on sharer's screen
  // ─────────────────────────────────
  function ensureOverlay() {
    if (document.getElementById('ss-ov')) return;
    const ov = document.createElement('div');
    ov.id = 'ss-ov';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;overflow:hidden;';
    document.body.appendChild(ov);
  }

  function setCursorDot(id, color, label, nx, ny) {
    ensureOverlay();
    let dot = document.getElementById(id);
    if (!dot) {
      dot = document.createElement('div');
      dot.id = id;
      dot.style.cssText = 'position:fixed;pointer-events:none;display:flex;align-items:flex-start;gap:3px;transition:left .04s linear,top .04s linear;';
      dot.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" style="flex-shrink:0">
          <path d="M2 2l12 5-5 2-3 8z" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        </svg>
        <span style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;margin-top:14px;box-shadow:0 2px 8px rgba(0,0,0,.5);font-family:system-ui,sans-serif;"></span>`;
      document.getElementById('ss-ov').appendChild(dot);
    }
    dot.querySelector('span').textContent = label;
    dot.style.left = (nx * window.innerWidth)  + 'px';
    dot.style.top  = (ny * window.innerHeight) + 'px';
  }

  function spawnClickRipple(nx, ny, color) {
    ensureOverlay();
    const el = document.createElement('div');
    const px = nx * window.innerWidth;
    const py = ny * window.innerHeight;
    el.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:36px;height:36px;border-radius:50%;border:2.5px solid ${color};transform:translate(-50%,-50%) scale(.3);opacity:1;pointer-events:none;z-index:2147483647;animation:ssRipple .55s ease-out forwards;`;
    document.getElementById('ss-ov').appendChild(el);
    if (!document.getElementById('ss-rip-style')) {
      const s = document.createElement('style');
      s.id = 'ss-rip-style';
      s.textContent = '@keyframes ssRipple{to{transform:translate(-50%,-50%) scale(2.2);opacity:0;}}';
      document.head.appendChild(s);
    }
    setTimeout(() => el.remove(), 600);
  }

  // ─────────────────────────────────
  //  Control request UI (sharer side)
  // ─────────────────────────────────
  function showControlRequest(viewerName) {
    let bar = document.getElementById('ss-ctrl-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ss-ctrl-bar';
      bar.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid rgba(108,99,255,.4);border-radius:14px;padding:12px 20px;display:flex;align-items:center;gap:12px;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:system-ui,sans-serif;';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <span style="font-size:13px;color:#fff"><b style="color:#a78bfa">${viewerName}</b> wants visual control</span>
      <button onclick="window._ssAcceptCtrl()" style="background:#43e97b;color:#000;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Accept</button>
      <button onclick="window._ssDenyCtrl()" style="background:#ff4f6b22;color:#ff4f6b;border:1px solid #ff4f6b44;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Deny</button>`;
  }

  window._ssAcceptCtrl = () => {
    const { CCI } = getState();
    controlGranted = true;
    document.getElementById('ss-ctrl-bar')?.remove();
    dbSet(dbRef(db, `screenShare/${CCI}/control`), { granted: true });
    toastFn('✅ Visual control granted');
  };
  window._ssDenyCtrl = () => {
    const { CCI } = getState();
    controlGranted = false;
    document.getElementById('ss-ctrl-bar')?.remove();
    dbSet(dbRef(db, `screenShare/${CCI}/control`), { granted: false });
    toastFn('❌ Control denied');
  };

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
  //  ssInit
  // ─────────────────────────────────
  window.ssInit = (cci) => {
    unsubIncoming?.(); unsubViewerCur?.(); unsubControl?.();
    hideWatchBar();
    document.getElementById('ss-ov')?.remove();

    unsubIncoming = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();
      if (!data?.active) { hideWatchBar(); document.getElementById('ss-viewer-dot')?.remove(); return; }

      if (data.by === CU?.uid) {
        // I am sharer — watch viewer cursor
        unsubViewerCur?.();
        unsubViewerCur = dbOnValue(dbRef(db, `screenShare/${cci}/cursors/viewer`), s => {
          const c = s.val();
          if (c) setCursorDot('ss-viewer-dot', '#43e97b', c.name || 'Viewer', c.x, c.y);
          else   document.getElementById('ss-viewer-dot')?.remove();
        });

        // watch for control request
        unsubControl?.();
        unsubControl = dbOnValue(dbRef(db, `screenShare/${cci}/controlReq`), s => {
          const r = s.val();
          if (r?.pending) showControlRequest(r.name || 'Viewer');
        });

        // watch for clicks from viewer
        dbOnValue(dbRef(db, `screenShare/${cci}/clicks`), s => {
          const c = s.val();
          if (!c || !controlGranted) return;
          spawnClickRipple(c.x, c.y, '#43e97b');
          // also forward to overlay window
          overlayWin?.postMessage({ type:'click', x:c.x, y:c.y }, '*');
        });
        return;
      }

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
        audio: true   // ← system audio
      });
    } catch { return; }

    pc = new RTCPeerConnection(ICE_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    // push my cursor
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
      offer:      { sdp: offer.sdp, type: offer.type }
    });

    unsubAns = dbOnValue(dbRef(db, `screenShare/${CCI}/answer`), async snap => {
      if (!snap.val() || pc?.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    });

    unsubVICE = dbOnValue(dbRef(db, `screenShare/${CCI}/ice_viewer`), snap => {
      snap.forEach(c => pc?.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}));
    });

    // open overlay window
    overlayWin = window.open(
      `ss-overlay.html?cci=${encodeURIComponent(CCI)}&w=${window.innerWidth}&h=${window.innerHeight}`,
      'ss-overlay',
      `width=${window.screen.width},height=${window.screen.height},top=0,left=0,menubar=no,toolbar=no,location=no,status=no`
    );
    localStream.getVideoTracks()[0]._overlayWin = overlayWin;

    setShareUI(true);
    toastFn('🖥️ Sharing started with audio');
  };

  // ─────────────────────────────────
  //  Stop sharing
  // ─────────────────────────────────
  window.stopSS = async () => {
    const { CCI } = getState();
    const track = localStream?.getVideoTracks()[0];
    if (track?._onMouse) document.removeEventListener('mousemove', track._onMouse);
    track?._overlayWin?.close();
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null; localStream = null; overlayWin = null; controlGranted = false;
    unsubAns?.(); unsubVICE?.(); unsubViewerCur?.(); unsubControl?.();
    document.getElementById('ss-ov')?.remove();
    document.getElementById('ss-ctrl-bar')?.remove();
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
