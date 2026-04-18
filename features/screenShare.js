// ══════════════════════════════════════════════════════
//  features/screenShare.js  —  WebRTC screen sharing
//  + real-time cursor sync for both sharer & viewer
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
  let unsubIncoming = null;
  let unsubAns    = null;
  let unsubVICE   = null;
  let cursorUnsub = null;
  let cursorThrottle = 0;

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
  }

  function hideWatchBar() {
    document.getElementById('ss-watch-bar')?.remove();
  }

  // ── Sharer cursor overlay (shows viewer's cursor on sharer screen) ──
  function ensureSharerOverlay() {
    if (document.getElementById('ss-cursor-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'ss-cursor-overlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(ov);
  }

  function showViewerCursorOnSharer(x, y, name) {
    ensureSharerOverlay();
    let dot = document.getElementById('ss-viewer-dot');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'ss-viewer-dot';
      dot.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 2l12 5-5 2-3 8z" fill="#43e97b" stroke="#fff" stroke-width="1"/></svg><span style="background:#43e97b;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:2px;white-space:nowrap"></span>`;
      dot.style.cssText = 'position:fixed;pointer-events:none;transform:translate(0,0);z-index:9999;transition:left 0.05s,top 0.05s;';
      document.getElementById('ss-cursor-overlay')?.appendChild(dot);
    }
    dot.querySelector('span').textContent = name || 'Viewer';
    // x,y are 0-1 normalized to sharer's screen
    dot.style.left = (x * window.screen.width)  + 'px';
    dot.style.top  = (y * window.screen.height) + 'px';
  }

  // ── Called when chat opens ──
  window.ssInit = (cci) => {
    unsubIncoming?.();
    cursorUnsub?.();
    hideWatchBar();
    document.getElementById('ss-cursor-overlay')?.remove();

    unsubIncoming = dbOnValue(dbRef(db, `screenShare/${cci}`), snap => {
      const data = snap.val();
      const { CU } = getState();
      if (!data || !data.active) { hideWatchBar(); return; }
      if (data.by === CU?.uid) {
        // I'm the sharer — listen for viewer cursor
        cursorUnsub?.();
        cursorUnsub = dbOnValue(dbRef(db, `screenShare/${cci}/cursors/viewer`), s => {
          const c = s.val();
          if (c) showViewerCursorOnSharer(c.x, c.y, c.name);
          else   document.getElementById('ss-viewer-dot')?.remove();
        });
        return;
      }
      showWatchBar(data.sharerName || 'Partner');
    });
  };

  // ── Start sharing ──
  window.startSS = async () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    if (localStream) { window.stopSS(); return; }

    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never', frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
    } catch { return; }

    pc = new RTCPeerConnection(ICE_CFG);

    // prioritize low latency
    const sender = pc.addTrack(localStream.getVideoTracks()[0], localStream);
    try {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].networkPriority = 'high';
      params.encodings[0].priority        = 'high';
      await sender.setParameters(params);
    } catch {}

    localStream.getVideoTracks()[0].onended = () => window.stopSS();

    pc.onicecandidate = e => {
      if (e.candidate) dbPush(dbRef(db, `screenShare/${CCI}/ice_sharer`), e.candidate.toJSON());
    };

    // track own mouse — push normalized to Firebase
    const onMouseMove = (e) => {
      const now = Date.now();
      if (now - cursorThrottle < 50) return; // 20fps cursor
      cursorThrottle = now;
      const { CU } = getState();
      dbSet(dbRef(db, `screenShare/${CCI}/cursors/sharer`), {
        x: e.screenX / (window.screen.width  || 1920),
        y: e.screenY / (window.screen.height || 1080),
        name: CU?.displayName || 'You'
      });
    };
    document.addEventListener('mousemove', onMouseMove);
    localStream.getVideoTracks()[0]._onMouseMove = onMouseMove; // save ref to remove later

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await dbSet(dbRef(db, `screenShare/${CCI}`), {
      active:      true,
      by:          CU.uid,
      sharerName:  CU.displayName || 'Partner',
      screenW:     window.screen.width,
      screenH:     window.screen.height,
      offer:       { sdp: offer.sdp, type: offer.type }
    });

    unsubAns = dbOnValue(dbRef(db, `screenShare/${CCI}/answer`), async snap => {
      if (!snap.val() || pc?.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    });

    unsubVICE = dbOnValue(dbRef(db, `screenShare/${CCI}/ice_viewer`), snap => {
      snap.forEach(c => pc?.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}));
    });

    setShareUI(true);
    toastFn('🖥️ Screen sharing started');
  };

  // ── Stop sharing ──
  window.stopSS = async () => {
    const { CCI } = getState();
    const track = localStream?.getVideoTracks()[0];
    if (track?._onMouseMove) document.removeEventListener('mousemove', track._onMouseMove);
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null; localStream = null;
    unsubAns?.(); unsubVICE?.();
    document.getElementById('ss-cursor-overlay')?.remove();
    if (CCI) await dbRemove(dbRef(db, `screenShare/${CCI}`));
    setShareUI(false);
    toastFn('🖥️ Screen share stopped');
  };

  // ── Open viewer window ──
  window.ssWatch = () => {
    const { CCI, CU } = getState();
    if (!CCI) return;
    const name = encodeURIComponent(CU?.displayName || 'Viewer');
    const url  = `screenshare.html?cci=${encodeURIComponent(CCI)}&name=${name}`;
    window.open(url, '_blank', 'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no');
  };
}
