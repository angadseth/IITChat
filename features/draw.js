// ═══════════════════════════════════════
//  features/draw.js — Live Draw Feature
// ═══════════════════════════════════════

let _db, _ref, _set, _push, _onValue, _onChildAdded, _getState;

// ── core state ──
let drawOpen      = false;
let drawInited    = false;
let drawCanvas    = null, drawCtx     = null;
let drawLiveCv    = null, drawLiveCtx = null;
let drawIsDrawing = false;
let drawColor     = '#ffffff';
let drawSize      = 2;
let drawIsEraser  = false;
let drawShape     = 'free';
let drawCurrPts   = [];
let drawStartPt   = null;
let drawSendTimer = null;
let drawUnsub     = null;
let drawLiveUnsub = null;
let drawActiveUnsub = null;

// ── colour wheel state ──
let drawHue       = 0;
let drawSatW      = 0;
let drawLighW     = 50;
let drawWheelInited = false;
let drawWheelOpen   = false;

const el = id => document.getElementById(id);

// ── init (called once from app.js) ──
export function initDrawFeature(db, ref, set, push, onValue, onChildAdded, getState) {
  _db = db; _ref = ref; _set = set; _push = push;
  _onValue = onValue; _onChildAdded = onChildAdded;
  _getState = getState;

  window.toggleDraw       = toggleDraw;
  window.clearDraw        = clearDraw;
  window.setDC            = setDC;
  window.setDS            = setDS;
  window.setEraser        = setEraser;
  window.setEraserLg      = setEraserLg;
  window.setShape         = setShape;
  window.toggleColorWheel = toggleColorWheel;
  window.onDrawL          = onDrawL;
  window.onDrawHex        = onDrawHex;
}

// Called from app.js whenever a new chat is opened
export function onChatOpen() {
  if (drawOpen) startDrawSync();
}

// ── Firebase path ──
function drawFBPath() {
  const { CCI, isGroup } = _getState();
  return (isGroup ? `groups/${CCI}` : `chats/${CCI}`) + '/drawing';
}

// ── show/hide draw UI ──
function _applyDrawVisibility(show) {
  el('draw-canvas').classList.toggle('hidden', !show);
  el('draw-live').classList.toggle('hidden', !show);
  el('draw-ftb').classList.toggle('hidden', !show);
  el('draw-canvas').style.pointerEvents = show ? 'all' : 'none';
}

// Auto-open for receiver when other user starts drawing
function _autoOpenDraw() {
  drawOpen = true;
  _applyDrawVisibility(true);
  if (!drawInited) initDraw();
  requestAnimationFrame(() => sizeDraw());
}

// ── toggle draw (user button) ──
function toggleDraw() {
  drawOpen = !drawOpen;
  _applyDrawVisibility(drawOpen);
  if (drawOpen) {
    if (!drawInited) initDraw();
    requestAnimationFrame(() => {
      sizeDraw();
      const { CCI } = _getState();
      if (CCI) startDrawSync();
    });
  }
}

// ── init canvas + events (once) ──
function initDraw() {
  drawCanvas  = el('draw-canvas');
  drawLiveCv  = el('draw-live');
  drawCtx     = drawCanvas.getContext('2d');
  drawLiveCtx = drawLiveCv.getContext('2d');
  drawInited  = true;

  // Drag toolbar — position:fixed so clamp to window bounds
  const ftb  = el('draw-ftb');
  const grip = el('draw-ftb-drag');
  let drag = null;
  grip.addEventListener('mousedown', e => {
    const r = ftb.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    ftb.style.left  = Math.max(0, Math.min(e.clientX - drag.ox, window.innerWidth  - ftb.offsetWidth))  + 'px';
    ftb.style.top   = Math.max(0, Math.min(e.clientY - drag.oy, window.innerHeight - ftb.offsetHeight)) + 'px';
    ftb.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { drag = null; });

  // Close colour wheel when clicking outside the toolbar
  document.addEventListener('click', e => {
    if (!drawWheelOpen) return;
    const ftbEl   = el('draw-ftb');
    if (ftbEl && !ftbEl.contains(e.target)) {
      drawWheelOpen = false;
      el('draw-wheel-popup')?.classList.add('hidden');
    }
  });

  // Re-fit canvases on resize — skip if mid-stroke to avoid clearing live drawing
  new ResizeObserver(() => { if (drawOpen && !drawIsDrawing) sizeDraw(true); }).observe(el('ma-wrap'));

  const on = (t, ev, fn, o) => t.addEventListener(ev, fn, o);
  on(drawCanvas, 'mousedown',  e => onDS(ptOf(e)));
  on(drawCanvas, 'mousemove',  e => { if (drawIsDrawing) onDM(ptOf(e)); });
  on(drawCanvas, 'mouseup',    onDE);
  on(drawCanvas, 'mouseleave', onDE);
  on(drawCanvas, 'touchstart', e => { e.preventDefault(); onDS(ptOf(e.touches[0])); }, { passive: false });
  on(drawCanvas, 'touchmove',  e => { e.preventDefault(); if (drawIsDrawing) onDM(ptOf(e.touches[0])); }, { passive: false });
  on(drawCanvas, 'touchend',   e => { e.preventDefault(); onDE(); }, { passive: false });
}

function sizeDraw(redraw) {
  if (!drawCanvas) return;
  const ma = el('ma');
  const w = ma.clientWidth, h = ma.clientHeight;
  if (!w || !h) return;
  [drawCanvas, drawLiveCv].forEach(c => {
    c.width = w; c.height = h;
    c.style.width  = w + 'px'; c.style.height = h + 'px';
    c.style.top    = ma.offsetTop  + 'px';
    c.style.left   = ma.offsetLeft + 'px';
  });
  const { CCI } = _getState();
  if (redraw && CCI && !drawIsDrawing) startDrawSync();
}

function ptOf(e) {
  const r = drawCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / drawCanvas.width,
           y: (e.clientY - r.top)  / drawCanvas.height };
}

// ── drawing events ──
function onDS(pt) {
  drawIsDrawing = true; drawStartPt = pt; drawCurrPts = [pt];
  if (drawShape === 'free' || drawIsEraser) drawSeg(drawCtx, pt, pt);
  drawSendTimer = setInterval(pushLiveStroke, 55);
  // Notify other user that drawing is active → they auto-open
  const { CCI, CU } = _getState();
  if (CCI) _set(_ref(_db, drawFBPath() + '/active'), { by: CU.uid, ts: Date.now() });
}

function onDM(pt) {
  drawCurrPts.push(pt);
  if (drawShape === 'free' || drawIsEraser) {
    drawSeg(drawCtx, drawCurrPts[drawCurrPts.length - 2], pt);
  } else {
    drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
    drawShapeOn(drawLiveCtx, drawStartPt, pt, drawColor, drawSize, drawShape);
  }
}

function onDE() {
  if (!drawIsDrawing) return;
  drawIsDrawing = false;
  clearInterval(drawSendTimer); drawSendTimer = null;
  const ep = drawCurrPts[drawCurrPts.length - 1] || drawStartPt;
  if (drawShape !== 'free' && !drawIsEraser && drawStartPt) {
    drawShapeOn(drawCtx, drawStartPt, ep, drawColor, drawSize, drawShape);
    drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
  }
  const { CCI, CU } = _getState();
  if (!CCI || !drawCurrPts.length) return;
  _push(_ref(_db, drawFBPath() + '/strokes'), {
    c: drawColor, s: drawSize, e: drawIsEraser,
    sh: drawShape, pts: drawCurrPts, sp: drawStartPt,
    by: CU.uid, ts: Date.now()
  });
  _set(_ref(_db, drawFBPath() + '/live/' + CU.uid), null);
  drawCurrPts = [];
}

function pushLiveStroke() {
  const { CCI, CU } = _getState();
  if (!CCI || !drawCurrPts.length) return;
  _set(_ref(_db, drawFBPath() + '/live/' + CU.uid), {
    c: drawColor, s: drawSize, e: drawIsEraser,
    sh: drawShape, pts: drawCurrPts.slice(-100), sp: drawStartPt
  });
}

// ── canvas rendering ──
function drawSeg(ctx, from, to) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.globalCompositeOperation = drawIsEraser ? 'destination-out' : 'source-over';
  ctx.strokeStyle = drawIsEraser ? 'rgba(0,0,0,1)' : drawColor;
  ctx.fillStyle   = drawIsEraser ? 'rgba(0,0,0,1)' : drawColor;
  ctx.lineWidth = drawSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (from === to || (from.x === to.x && from.y === to.y)) {
    ctx.beginPath(); ctx.arc(from.x*W, from.y*H, drawSize/2, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(from.x*W, from.y*H); ctx.lineTo(to.x*W, to.y*H); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawShapeOn(ctx, from, to, color, size, shape) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x1 = from.x*W, y1 = from.y*H, x2 = to.x*W, y2 = to.y*H;
  ctx.strokeStyle = color; ctx.lineWidth = size || 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'line') { ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
  else if (shape === 'rect') { ctx.strokeRect(x1,y1,x2-x1,y2-y1); }
  else if (shape === 'circle') {
    const cx=(x1+x2)/2, cy=(y1+y2)/2, rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
    ctx.ellipse(cx,cy,Math.max(rx,1),Math.max(ry,1),0,0,Math.PI*2); ctx.stroke();
  }
}

function renderStroke(ctx, stroke) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pts = stroke.pts || [];
  if (!pts.length) return;
  ctx.globalCompositeOperation = stroke.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.e ? 'rgba(0,0,0,1)' : stroke.c;
  ctx.fillStyle   = stroke.e ? 'rgba(0,0,0,1)' : stroke.c;
  ctx.lineWidth = stroke.s || 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sh = stroke.sh || 'free';
  if (sh === 'free' || stroke.e) {
    if (pts.length === 1) {
      ctx.beginPath(); ctx.arc(pts[0].x*W, pts[0].y*H, (stroke.s||3)/2, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(pts[0].x*W, pts[0].y*H);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x*W, pts[i].y*H);
      ctx.stroke();
    }
  } else {
    const sp = stroke.sp || pts[0], ep = pts[pts.length-1];
    drawShapeOn(ctx, sp, ep, stroke.c, stroke.s, sh);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ── Firebase sync ──
export function startDrawSync() {
  if (drawUnsub)       { drawUnsub();       drawUnsub = null; }
  if (drawLiveUnsub)   { drawLiveUnsub();   drawLiveUnsub = null; }
  if (drawActiveUnsub) { drawActiveUnsub(); drawActiveUnsub = null; }
  if (!drawCanvas) return;
  sizeDraw();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);

  // Permanent strokes
  drawUnsub = _onChildAdded(_ref(_db, drawFBPath() + '/strokes'), snap => {
    const s = snap.val();
    if (s && drawCtx) renderStroke(drawCtx, s);
  });

  // Live strokes from other user
  const { CU } = _getState();
  drawLiveUnsub = _onValue(_ref(_db, drawFBPath() + '/live'), snap => {
    const all = snap.val() || {};
    if (!drawLiveCtx) return;
    drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
    Object.entries(all).forEach(([uid, stroke]) => {
      if (uid === CU?.uid) return;
      renderStroke(drawLiveCtx, stroke);
    });
  });

  // Auto-open for receiver when other user starts drawing
  drawActiveUnsub = _onValue(_ref(_db, drawFBPath() + '/active'), snap => {
    const d = snap.val();
    const { CU: cu } = _getState();
    if (d && d.by !== cu?.uid && !drawOpen) _autoOpenDraw();
  });
}

async function clearDraw() {
  const { CCI } = _getState();
  if (!CCI) return;
  await _set(_ref(_db, drawFBPath()), null);
  if (drawCtx)     drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (drawLiveCtx) drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
  startDrawSync();
}

// ── toolbar handlers ──
function setDC(el_) {
  document.querySelectorAll('.dco').forEach(d => d.classList.remove('act'));
  el_.classList.add('act');
  drawColor = el_.dataset.c; drawIsEraser = false;
  document.querySelectorAll('.erase-btn').forEach(b => b.classList.remove('act'));
  _closeWheel();
}
function setDS(btn) {
  document.querySelectorAll('.dsb').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  drawSize = parseInt(btn.dataset.s); drawIsEraser = false;
  document.querySelectorAll('.erase-btn').forEach(b => b.classList.remove('act'));
}
function setEraser(btn) {
  document.querySelectorAll('.dsb, .dshp').forEach(b => b.classList.remove('act'));
  btn.classList.add('act'); drawIsEraser = true;
  drawSize = parseInt(btn.dataset.es) || 28;
}
function setEraserLg(btn) {
  document.querySelectorAll('.dsb, .dshp').forEach(b => b.classList.remove('act'));
  btn.classList.add('act'); drawIsEraser = true;
  drawSize = parseInt(btn.dataset.es) || 55;
}
function setShape(btn) {
  document.querySelectorAll('.dshp').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  drawShape = btn.dataset.sh; drawIsEraser = false;
  document.querySelectorAll('.erase-btn').forEach(b => b.classList.remove('act'));
}

// ── colour wheel ──
function _closeWheel() {
  drawWheelOpen = false;
  el('draw-wheel-popup')?.classList.add('hidden');
}

function toggleColorWheel() {
  drawWheelOpen = !drawWheelOpen;
  el('draw-wheel-popup').classList.toggle('hidden', !drawWheelOpen);
  if (drawWheelOpen && !drawWheelInited) _initColorWheel();
}

function _initColorWheel() {
  drawWheelInited = true;
  _renderColorWheel(el('draw-wheel-cv'));
  el('draw-wheel-cv').addEventListener('click', e => {
    const cv = el('draw-wheel-cv');
    const r  = cv.getBoundingClientRect();
    const x  = e.clientX - r.left - r.width  / 2;
    const y  = e.clientY - r.top  - r.height / 2;
    const maxR = r.width / 2;
    const dist = Math.sqrt(x*x + y*y);
    if (dist > maxR) return;
    drawHue  = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    drawSatW = Math.min(dist / maxR * 100, 100);
    _applyWheelColor();
  });
  el('draw-hex').value = drawColor;
  el('draw-hex-prev').style.background = drawColor;
}

function _renderColorWheel(cv) {
  const ctx  = cv.getContext('2d');
  const size = cv.width;
  const cx = size/2, cy = size/2, r = size/2 - 1;
  const img  = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > r) continue;
      const h = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      const s = dist / r;
      const [R, G, B] = _hslToRgb(h / 360, s, 0.5);
      const i = (py * size + px) * 4;
      img.data[i] = R; img.data[i+1] = G; img.data[i+2] = B; img.data[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // White centre dot
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
}

function _hslToRgb(h, s, l) {
  const k = n => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255)];
}

function _hslToHex(h, s, l) {
  const [r, g, b] = _hslToRgb(h/360, s/100, l/100);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function _applyWheelColor() {
  drawColor = _hslToHex(drawHue, drawSatW, drawLighW);
  drawIsEraser = false;
  el('draw-hex').value = drawColor;
  el('draw-hex-prev').style.background = drawColor;
  document.querySelectorAll('.dco').forEach(d => d.classList.remove('act'));
  el('dco-custom').classList.add('act');
  document.querySelectorAll('.erase-btn').forEach(b => b.classList.remove('act'));
}

function onDrawL(val) {
  drawLighW = parseInt(val);
  if (drawSatW > 0 || drawHue > 0) _applyWheelColor();
}

function onDrawHex(val) {
  const clean = val.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) {
    el('draw-hex-prev').style.background = 'rgba(255,255,255,0.1)';
    return;
  }
  drawColor = clean;
  el('draw-hex-prev').style.background = clean;
  drawIsEraser = false;
  document.querySelectorAll('.dco').forEach(d => d.classList.remove('act'));
  el('dco-custom').classList.add('act');
  document.querySelectorAll('.erase-btn').forEach(b => b.classList.remove('act'));
}
