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
  let unsubControl   = null;
  let unsubViewerCur = null;
  let controlGranted = false;
  let cursorThrottle = 0;
  let overlayWin     = null;

  // ─────────────────────────────────────────────────────
  //  Viewer Cursor HUD — fallback when overlay can't open
  //  (tab-only share or popup blocked)
  // ─────────────────────────────────────────────────────
  function ensureHUD() {
    if (document.getElementById('ss-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'ss-hud';
    hud.style.cssText = `
      position:fixed; bottom:90px; right:16px; z-index:9999;
      background:rgba(13,13,31,0.92); border:1px solid rgba(108,99,255,0.35);
      border-radius:12px; padding:8px 10px; pointer-events:none;
      backdrop-filter:blur(10px); min-width:130px;
      box-shadow:0 4px 20px rgba(0,0,0,0.5);
      font-family:system-ui,sans-serif;
    `;
    hud.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#a78bfa;margin-bottom:6px;display:flex;align-items:center;gap:5px">
        <span style="width:6px;height:6px;border-radius:50%;background:#43e97b;display:inline-block;animation:hudBlink 1s ease infinite"></span>
        Viewer pointer
      </div>
      <canvas id="ss-hud-cv" width="110" height="62"
        style="border-radius:6px;background:#1a1a2e;display:block;"></canvas>
      <div id="ss-hud-name" style="font-size:9px;color:#9090b0;margin-top:4px;text-align:center"></div>
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes hudBlink{0%,100%{opacity:1}50%{opacity:.2}}';
    document.head.appendChild(style);
    document.body.appendChild(hud);
  }

  function updateHUD(nx, ny, name) {
    ensureHUD();
    const cv  = document.getElementById('ss-hud-cv');
    const nm  = document.getElementById('ss-hud-name');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(108,99,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W-2, H-2);
    const px = nx * W, py = ny * H;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(67,233,123,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI*2);
    ctx.fillStyle = '#43e97b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (nm) nm.textContent = name || 'Viewer';
  }

  function removeHUD() {
    document.getElementById('ss-hud')?.remove();
  }

  // ─────────────────────────────────
  //  Control request UI (sharer side)
  // ─────────────────────────────────
  function showControlRequest(viewerName) {
    let bar = document.getElementById('ss-ctrl-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ss-ctrl-bar';
      bar.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid rgba(108,99,255,.4);border-radius:14px;padding:12px 20px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:system-ui,sans-serif;';
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
  //  ssInit — called when chat opens
  // ─────────────────────────────────
  window.ssInit = (cci) => {
    unsubIncoming?.(); unsubControl?.(); unsubViewerCur?.();
    unsubViewerCur = null;
    hideWatchBar(); removeHUD();

    unsubIncoming = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();
      if (!data?.active) { hideWatchBar(); removeHUD(); return; }

      if (data.by === CU?.uid) {
        // I am sharer — watch viewer cursor → HUD (fallback when overlay not open)
        if (!unsubViewerCur) {
          unsubViewerCur = dbOnValue(dbRef(db, `screenShare/${cci}/cursors/viewer`), s => {
            const c = s.val();
            if (c && !overlayWin) updateHUD(c.x, c.y, c.name);
            else removeHUD();
          });
        }
        if (!unsubControl) {
          unsubControl = dbOnValue(dbRef(db, `screenShare/${cci}/controlReq`), s => {
            const r = s.val();
            if (r?.pending) showControlRequest(r.name || 'Viewer');
          });
        }
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

    // Detect share type — 'monitor' = full screen, 'window' or 'browser' = partial
    const trackSettings  = localStream.getVideoTracks()[0].getSettings();
    const isFullScreen   = trackSettings.displaySurface === 'monitor';

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

    unsubControl = dbOnValue(dbRef(db, `screenShare/${CCI}/controlReq`), s => {
      const r = s.val();
      if (r?.pending) showControlRequest(r.name || 'Viewer');
    });

    // Open transparent overlay on sharer's screen so viewer cursor
    // appears at the exact same coordinates on the real shared content.
    // Works for full-screen share; tab-only share falls back to HUD.
    if (isFullScreen) {
      overlayWin = window.open(
        `ss-overlay.html?cci=${encodeURIComponent(CCI)}`,
        'ss-overlay',
        `width=${screen.width},height=${screen.height},top=0,left=0,` +
        `menubar=no,toolbar=no,location=no,status=no`
      );
    }

    setShareUI(true);
    toastFn(isFullScreen
      ? '🖥️ Sharing — viewer cursor will appear live on your screen'
      : '🖥️ Sharing — tip: share full screen for live cursor overlay'
    );
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
    pc = null; localStream = null; controlGranted = false;
    unsubAns?.(); unsubVICE?.(); unsubControl?.(); unsubViewerCur?.();
    unsubControl = null; unsubViewerCur = null;
    removeHUD();
    overlayWin?.close(); overlayWin = null;
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
