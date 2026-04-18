// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
//  Coordinate system:
//    Viewer  → sends   (x, y) normalised 0-1 of video content area
//    Sharer  → maps to (x * innerW, y * innerH) on its own page
//    Viewer  → shows both cursors on top of the <video> element
// ══════════════════════════════════════════════════════

const ICE_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function initScreenShare(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbPush, dbUpdate, getState, toastFn) {

  let pc             = null;
  let localStream    = null;
  let unsubIncoming  = null;
  let unsubAns       = null;
  let unsubVICE      = null;
  let unsubViewerCur = null;
  let cursorThrottle = 0;

  // ─────────────────────────────────────────
  //  Sharer-side overlay (shows viewer cursor
  //  on top of the actual page content)
  // ─────────────────────────────────────────
  function ensureOverlay() {
    if (document.getElementById('ss-ov')) return;
    const ov = document.createElement('div');
    ov.id = 'ss-ov';
    ov.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:2147483647;overflow:hidden;';
    document.body.appendChild(ov);
  }

  function setCursorDot(id, color, label, nx, ny) {
    ensureOverlay();
    let dot = document.getElementById(id);
    if (!dot) {
      dot = document.createElement('div');
      dot.id = id;
      dot.style.cssText =
        'position:fixed;pointer-events:none;display:flex;' +
        'align-items:flex-start;gap:3px;' +
        'transition:left .04s linear,top .04s linear;';
      dot.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" style="flex-shrink:0">
          <path d="M2 2l12 5-5 2-3 8z" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        </svg>
        <span style="background:${color};color:#fff;font-size:10px;font-weight:700;
          padding:2px 6px;border-radius:5px;white-space:nowrap;margin-top:14px;
          box-shadow:0 2px 8px rgba(0,0,0,.5);font-family:system-ui,sans-serif;"></span>`;
      document.getElementById('ss-ov').appendChild(dot);
    }
    dot.querySelector('span').textContent = label;
    // nx,ny are 0-1 relative to the shared PAGE viewport
    dot.style.left = (nx * window.innerWidth)  + 'px';
    dot.style.top  = (ny * window.innerHeight) + 'px';
  }

  // ─────────────────────────────────────────
  //  Watch-bar (shown to viewer when share starts)
  // ─────────────────────────────────────────
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

  function hideWatchBar() {
    document.getElementById('ss-watch-bar')?.remove();
  }

  // ─────────────────────────────────────────
  //  Share button UI
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  //  ssInit — called when any chat opens
  // ─────────────────────────────────────────
  window.ssInit = (cci) => {
    unsubIncoming?.();
    unsubViewerCur?.();
    hideWatchBar();
    document.getElementById('ss-ov')?.remove();

    unsubIncoming = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();

      if (!data || !data.active) {
        hideWatchBar();
        document.getElementById('ss-viewer-dot')?.remove();
        return;
      }

      if (data.by === CU?.uid) {
        // I'm the sharer — watch for viewer's cursor and show on MY screen
        unsubViewerCur?.();
        unsubViewerCur = dbOnValue(dbRef(db, `screenShare/${cci}/cursors/viewer`), s => {
          const c = s.val();
          if (c) setCursorDot('ss-viewer-dot', '#43e97b', c.name || 'Viewer', c.x, c.y);
          else   document.getElementById('ss-viewer-dot')?.remove();
        });
        return;
      }

      showWatchBar(data.sharerName || 'Partner');
    });
  };

  // ─────────────────────────────────────────
  //  Start sharing
  // ─────────────────────────────────────────
  window.startSS = async () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    if (localStream) { window.stopSS(); return; }

    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } },
        audio: false
      });
    } catch { return; }

    pc = new RTCPeerConnection(ICE_CFG);
    pc.addTrack(localStream.getVideoTracks()[0], localStream);
    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    // Push my own cursor — normalised to my innerWidth/innerHeight
    const onMouse = e => {
      const now = Date.now();
      if (now - cursorThrottle < 40) return;
      cursorThrottle = now;
      const { CU } = getState();
      dbSet(dbRef(db, `screenShare/${CCI}/cursors/sharer`), {
        x:    e.clientX / window.innerWidth,
        y:    e.clientY / window.innerHeight,
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

    // open transparent overlay window — sharer positions it over YouTube
    const ow = window.open(
      `ss-overlay.html?cci=${encodeURIComponent(CCI)}&w=${window.innerWidth}&h=${window.innerHeight}`,
      'ss-overlay',
      `width=${window.screen.width},height=${window.screen.height},top=0,left=0,menubar=no,toolbar=no,location=no,status=no`
    );
    if (ow) localStream.getVideoTracks()[0]._overlayWin = ow;

    setShareUI(true);
    toastFn('🖥️ Sharing started — position the overlay window over your content');
  };

  // ─────────────────────────────────────────
  //  Stop sharing
  // ─────────────────────────────────────────
  window.stopSS = async () => {
    const { CCI } = getState();
    const track = localStream?.getVideoTracks()[0];
    if (track?._onMouse) document.removeEventListener('mousemove', track._onMouse);
    track?._overlayWin?.close();
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null; localStream = null;
    unsubAns?.(); unsubVICE?.(); unsubViewerCur?.();
    document.getElementById('ss-ov')?.remove();
    if (CCI) await dbRemove(dbRef(db, `screenShare/${CCI}`));
    setShareUI(false);
    toastFn('🖥️ Screen share stopped');
  };

  // ─────────────────────────────────────────
  //  Open viewer window
  // ─────────────────────────────────────────
  window.ssWatch = () => {
    const { CCI, CU } = getState();
    if (!CCI) return;
    const name = encodeURIComponent(CU?.displayName || 'Viewer');
    const url  = `screenshare.html?cci=${encodeURIComponent(CCI)}&name=${name}`;
    window.open(url, '_blank', 'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no');
  };
}
