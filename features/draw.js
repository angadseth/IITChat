// ═══════════════════════════════════════
//  features/draw.js — Live Draw Feature
// ═══════════════════════════════════════

let _db, _ref, _set, _push, _onValue, _onChildAdded, _getState;

// ── tool + draw state ──
let drawTool      = 'pencil';
let drawPrevTool  = 'pencil';
let drawOpen      = false;
let drawInited    = false;
let drawCanvas    = null, drawCtx     = null;
let drawLiveCv    = null, drawLiveCtx = null;
let drawIsDrawing = false;
let drawColor     = '#ffffff';
let drawSize      = 2;           // actual px — set by slider
let drawSliderVal = 2;           // 1-10 slider value
let drawCurrPts   = [];
let drawStartPt   = null;
let drawSendTimer = null;
let drawUnsub     = null;
let drawLiveUnsub = null;
let drawActiveUnsub = null;

// ── undo / redo ──
let drawHistory   = [];   // [{key, data}] all committed strokes
let drawRedoStack = [];   // [{data}] undone strokes awaiting redo

// ── colour wheel ──
let drawHue = 0, drawSatW = 0, drawLighW = 50;
let drawWheelInited = false, drawWheelOpen = false;

// Slider value (1-10) → actual pixel size
const SZ = [1, 2, 4, 6, 9, 12, 16, 22, 30, 40];

const el = id => document.getElementById(id);

// ── init ──
export function initDrawFeature(db, ref, set, push, onValue, onChildAdded, getState) {
  _db = db; _ref = ref; _set = set; _push = push;
  _onValue = onValue; _onChildAdded = onChildAdded;
  _getState = getState;

  window.toggleDraw       = toggleDraw;
  window.clearDraw        = clearDraw;
  window.setTool          = setTool;
  window.setDS            = setDS;
  window.setDC            = setDC;
  window.onDrawSize       = onDrawSize;
  window.drawUndo         = drawUndo;
  window.drawRedo         = drawRedo;
  window.toggleColorWheel = toggleColorWheel;
  window.onDrawL          = onDrawL;
  window.onDrawHex        = onDrawHex;
}

export function onChatOpen() {
  if (drawOpen) startDrawSync();
}

function drawFBPath() {
  const { CCI, isGroup } = _getState();
  return (isGroup ? `groups/${CCI}` : `chats/${CCI}`) + '/drawing';
}

// ── visibility ──
function _applyVis(show) {
  el('draw-canvas').classList.toggle('hidden', !show);
  el('draw-live').classList.toggle('hidden', !show);
  el('draw-ftb').classList.toggle('hidden', !show);
  el('draw-canvas').style.pointerEvents = show ? 'all' : 'none';
}
function _autoOpenDraw() {
  drawOpen = true; _applyVis(true);
  if (!drawInited) initDraw();
  requestAnimationFrame(() => sizeDraw());
}
function toggleDraw() {
  drawOpen = !drawOpen; _applyVis(drawOpen);
  if (drawOpen) {
    if (!drawInited) initDraw();
    requestAnimationFrame(() => {
      sizeDraw();
      const { CCI } = _getState();
      if (CCI) startDrawSync();
    });
  }
}

// ── canvas init ──
function initDraw() {
  drawCanvas  = el('draw-canvas');
  drawLiveCv  = el('draw-live');
  drawCtx     = drawCanvas.getContext('2d');
  drawLiveCtx = drawLiveCv.getContext('2d');
  drawInited  = true;

  const ftb = el('draw-ftb'), grip = el('draw-ftb-drag');
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

  document.addEventListener('click', e => {
    if (!drawWheelOpen) return;
    if (!el('draw-ftb')?.contains(e.target)) {
      drawWheelOpen = false;
      el('draw-wheel-popup')?.classList.add('hidden');
    }
  });

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
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.style.top   = ma.offsetTop  + 'px';
    c.style.left  = ma.offsetLeft + 'px';
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
  if (drawTool === 'eyedrop') {
    const px = Math.max(0, Math.min(Math.round(pt.x * drawCanvas.width),  drawCanvas.width  - 1));
    const py = Math.max(0, Math.min(Math.round(pt.y * drawCanvas.height), drawCanvas.height - 1));
    const d  = drawCtx.getImageData(px, py, 1, 1).data;
    if (d[3] > 20) {
      drawColor = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2,'0')).join('');
      _updateColorUI(drawColor);
    }
    _setToolByName(drawPrevTool); return;
  }
  if (drawTool === 'fill') {
    const px = Math.max(0, Math.min(Math.round(pt.x * drawCanvas.width),  drawCanvas.width  - 1));
    const py = Math.max(0, Math.min(Math.round(pt.y * drawCanvas.height), drawCanvas.height - 1));
    _floodFill(drawCtx, px, py, drawColor);
    const { CCI, CU } = _getState();
    if (CCI) {
      drawRedoStack = [];
      _push(_ref(_db, drawFBPath() + '/strokes'), {
        c: drawColor, sh: 'fill', pts: [pt], by: CU.uid, ts: Date.now()
      });
    }
    return;
  }

  drawIsDrawing = true; drawStartPt = pt; drawCurrPts = [pt];
  if (drawTool === 'pencil') drawSeg(drawCtx, pt, pt);
  if (drawTool === 'eraser') drawSeg(drawCtx, pt, pt);
  if (drawTool === 'spray')  _sprayAt(drawCtx, pt, 0);
  drawSendTimer = setInterval(pushLiveStroke, 55);

  const { CCI, CU } = _getState();
  if (CCI) _set(_ref(_db, drawFBPath() + '/active'), { by: CU.uid, ts: Date.now() });
}

function onDM(pt) {
  drawCurrPts.push(pt);
  if (drawTool === 'pencil') {
    drawSeg(drawCtx, drawCurrPts[drawCurrPts.length - 2], pt);
  } else if (drawTool === 'eraser') {
    drawSeg(drawCtx, drawCurrPts[drawCurrPts.length - 2], pt);
  } else if (drawTool === 'spray') {
    _sprayAt(drawCtx, pt, drawCurrPts.length);
  } else {
    drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
    _drawShape(drawLiveCtx, drawStartPt, pt, drawColor, drawSize, drawTool);
  }
}

function onDE() {
  if (!drawIsDrawing) return;
  drawIsDrawing = false;
  clearInterval(drawSendTimer); drawSendTimer = null;
  const ep = drawCurrPts[drawCurrPts.length - 1] || drawStartPt;
  if (['line','rect','circle'].includes(drawTool) && drawStartPt) {
    _drawShape(drawCtx, drawStartPt, ep, drawColor, drawSize, drawTool);
    drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
  }
  const { CCI, CU } = _getState();
  if (!CCI || !drawCurrPts.length) return;
  drawRedoStack = [];  // new stroke clears redo history
  _push(_ref(_db, drawFBPath() + '/strokes'), {
    c: drawColor, s: drawSize, e: drawTool === 'eraser',
    sh: drawTool, pts: drawCurrPts, sp: drawStartPt,
    by: CU.uid, ts: Date.now()
  });
  _set(_ref(_db, drawFBPath() + '/live/' + CU.uid), null);
  drawCurrPts = [];
}

function pushLiveStroke() {
  const { CCI, CU } = _getState();
  if (!CCI || !drawCurrPts.length) return;
  _set(_ref(_db, drawFBPath() + '/live/' + CU.uid), {
    c: drawColor, s: drawSize, e: drawTool === 'eraser',
    sh: drawTool, pts: drawCurrPts.slice(-80), sp: drawStartPt
  });
}

// ── undo / redo ──
function drawUndo() {
  const { CU } = _getState();
  const mine = drawHistory.filter(h => h.data.by === CU?.uid);
  if (!mine.length) return;
  const last = mine[mine.length - 1];
  drawRedoStack.push(last.data);
  // Remove from Firebase — onValue listener will re-render
  _set(_ref(_db, drawFBPath() + '/strokes/' + last.key), null);
}

function drawRedo() {
  if (!drawRedoStack.length) return;
  const stroke = drawRedoStack.pop();
  _push(_ref(_db, drawFBPath() + '/strokes'), stroke);
}

// ── rendering ──
function drawSeg(ctx, from, to) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const isErase = drawTool === 'eraser';
  ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = isErase ? 'rgba(0,0,0,1)' : drawColor;
  ctx.fillStyle   = isErase ? 'rgba(0,0,0,1)' : drawColor;
  ctx.lineWidth = drawSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (from === to || (from.x === to.x && from.y === to.y)) {
    ctx.beginPath(); ctx.arc(from.x*W, from.y*H, drawSize/2, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(from.x*W, from.y*H); ctx.lineTo(to.x*W, to.y*H); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function _drawShape(ctx, from, to, color, size, shape) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x1=from.x*W, y1=from.y*H, x2=to.x*W, y2=to.y*H;
  ctx.strokeStyle = color; ctx.lineWidth = size || 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape==='line') { ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
  else if (shape==='rect') { ctx.strokeRect(x1,y1,x2-x1,y2-y1); }
  else if (shape==='circle') {
    const cx=(x1+x2)/2, cy=(y1+y2)/2;
    ctx.ellipse(cx,cy,Math.max(Math.abs(x2-x1)/2,1),Math.max(Math.abs(y2-y1)/2,1),0,0,Math.PI*2);
    ctx.stroke();
  }
}

function _sprayAt(ctx, pt, seed) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx=pt.x*W, cy=pt.y*H;
  const radius = Math.max(10, drawSize * 4);
  const count  = Math.max(8,  drawSize * 3);
  ctx.fillStyle = drawColor;
  for (let i = 0; i < count; i++) {
    const a = _pr(seed*100+i)    * Math.PI * 2;
    const r = _pr(seed*100+i+50) * radius;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a)*r, cy + Math.sin(a)*r, _pr(seed+i+99)*1.2+0.3, 0, Math.PI*2);
    ctx.fill();
  }
}
function _pr(n) { const x = Math.sin(n+1)*43758.5; return x - Math.floor(x); }

function _floodFill(ctx, sx, sy, hexColor) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;
  const img = ctx.getImageData(0, 0, W, H), data = img.data;
  const si = (sy*W+sx)*4;
  const [tr,tg,tb,ta] = [data[si],data[si+1],data[si+2],data[si+3]];
  const fr=parseInt(hexColor.slice(1,3),16), fg=parseInt(hexColor.slice(3,5),16), fb=parseInt(hexColor.slice(5,7),16);
  if (tr===fr&&tg===fg&&tb===fb&&ta===255) return;
  const match = i => data[i]===tr&&data[i+1]===tg&&data[i+2]===tb&&data[i+3]===ta;
  const stack = [sx+sy*W], visited = new Uint8Array(W*H);
  while (stack.length) {
    const pos = stack.pop();
    if (visited[pos]) continue; visited[pos]=1;
    const idx = pos*4;
    if (!match(idx)) continue;
    data[idx]=fr; data[idx+1]=fg; data[idx+2]=fb; data[idx+3]=255;
    const x=pos%W, y=(pos/W)|0;
    if (x>0)     stack.push(pos-1);
    if (x<W-1)   stack.push(pos+1);
    if (y>0)     stack.push(pos-W);
    if (y<H-1)   stack.push(pos+W);
  }
  ctx.putImageData(img, 0, 0);
}

function renderStroke(ctx, stroke) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pts = stroke.pts || [], sh = stroke.sh || 'free';
  if (!pts.length) return;

  if (sh === 'fill') {
    _floodFill(ctx, Math.round(pts[0].x*W), Math.round(pts[0].y*H), stroke.c||'#000'); return;
  }
  if (sh === 'spray') {
    ctx.fillStyle = stroke.c||'#fff';
    const radius = Math.max(10,(stroke.s||3)*4), count = Math.max(8,(stroke.s||3)*3);
    pts.forEach((pt,pi) => {
      for (let i=0;i<count;i++) {
        const a=_pr(pi*100+i)*Math.PI*2, r=_pr(pi*100+i+50)*radius;
        ctx.beginPath(); ctx.arc(pt.x*W+Math.cos(a)*r, pt.y*H+Math.sin(a)*r, _pr(pi+i+99)*1.2+0.3, 0, Math.PI*2); ctx.fill();
      }
    }); return;
  }

  ctx.globalCompositeOperation = stroke.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.e ? 'rgba(0,0,0,1)' : stroke.c;
  ctx.fillStyle   = stroke.e ? 'rgba(0,0,0,1)' : stroke.c;
  ctx.lineWidth = stroke.s||3; ctx.lineCap='round'; ctx.lineJoin='round';

  if (['free','pencil','eraser'].includes(sh) || stroke.e) {
    if (pts.length===1) {
      ctx.beginPath(); ctx.arc(pts[0].x*W,pts[0].y*H,(stroke.s||3)/2,0,Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(pts[0].x*W,pts[0].y*H);
      for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x*W,pts[i].y*H);
      ctx.stroke();
    }
  } else {
    _drawShape(ctx, stroke.sp||pts[0], pts[pts.length-1], stroke.c, stroke.s, sh);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ── Firebase sync ──
// Uses onValue for strokes so undo/redo (deletions) propagate to both users
export function startDrawSync() {
  if (drawUnsub)       { drawUnsub();       drawUnsub = null; }
  if (drawLiveUnsub)   { drawLiveUnsub();   drawLiveUnsub = null; }
  if (drawActiveUnsub) { drawActiveUnsub(); drawActiveUnsub = null; }
  if (!drawCanvas) return;
  sizeDraw();
  drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
  drawHistory = [];

  // onValue re-renders entire canvas whenever any stroke is added/removed (undo/redo)
  drawUnsub = _onValue(_ref(_db, drawFBPath() + '/strokes'), snap => {
    const raw = snap.val() || {};
    drawHistory = Object.entries(raw)
      .map(([key, data]) => ({ key, data }))
      .sort((a, b) => (a.data.ts||0) - (b.data.ts||0));
    if (drawIsDrawing) return; // don't clear mid-stroke
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawHistory.forEach(h => renderStroke(drawCtx, h.data));
  });

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

  drawActiveUnsub = _onValue(_ref(_db, drawFBPath() + '/active'), snap => {
    const d = snap.val();
    const { CU: cu } = _getState();
    if (d && d.by !== cu?.uid && !drawOpen) _autoOpenDraw();
  });
}

async function clearDraw() {
  const { CCI } = _getState();
  if (!CCI) return;
  drawHistory = []; drawRedoStack = [];
  await _set(_ref(_db, drawFBPath()), null);
  if (drawCtx)     drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (drawLiveCtx) drawLiveCtx.clearRect(0, 0, drawLiveCv.width, drawLiveCv.height);
  startDrawSync();
}

// ── toolbar: tool ──
function setTool(btn) {
  document.querySelectorAll('.dtool').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  const t = btn.dataset.tool;
  if (t !== 'eyedrop') drawPrevTool = t;
  drawTool = t;
  if (drawCanvas) drawCanvas.style.cursor = t === 'eraser' ? 'cell' : 'crosshair';
}
function _setToolByName(name) {
  drawTool = name;
  document.querySelectorAll('.dtool').forEach(b => b.classList.toggle('act', b.dataset.tool === name));
  if (drawCanvas) drawCanvas.style.cursor = name === 'eraser' ? 'cell' : 'crosshair';
}

// ── toolbar: size slider ──
function onDrawSize(val) {
  drawSliderVal = parseInt(val);
  drawSize = SZ[drawSliderVal - 1] || 2;
  const v = el('draw-sz-val');
  if (v) v.textContent = drawSliderVal;
}
function setDS() {} // legacy no-op (slider replaces dot buttons)

// ── toolbar: colour ──
function setDC(el_) {
  document.querySelectorAll('.dco').forEach(d => d.classList.remove('act'));
  el_.classList.add('act');
  drawColor = el_.dataset.c;
  _updateColorUI(drawColor);
  _closeWheel();
}
function _updateColorUI(hex) {
  const cc=el('draw-cur-color'), ch=el('draw-cur-hex');
  if (cc) cc.style.background = hex;
  if (ch) ch.textContent = hex;
  const hp=el('draw-hex-prev'); if (hp) hp.style.background = hex;
  const hi=el('draw-hex');      if (hi) hi.value = hex;
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
    const cv=el('draw-wheel-cv'), r=cv.getBoundingClientRect();
    const x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2;
    const dist=Math.sqrt(x*x+y*y);
    if (dist>r.width/2) return;
    drawHue  = ((Math.atan2(y,x)*180/Math.PI)+360)%360;
    drawSatW = Math.min(dist/(r.width/2)*100,100);
    _applyWheelColor();
  });
  _updateColorUI(drawColor);
}
function _renderColorWheel(cv) {
  const ctx=cv.getContext('2d'), sz=cv.width, cx=sz/2, cy=sz/2, r=sz/2-1;
  const img=ctx.createImageData(sz,sz);
  for (let py=0;py<sz;py++) for (let px=0;px<sz;px++) {
    const dx=px-cx, dy=py-cy, d=Math.sqrt(dx*dx+dy*dy);
    if (d>r) continue;
    const h=((Math.atan2(dy,dx)*180/Math.PI)+360)%360;
    const [R,G,B]=_hsl(h/360,d/r,0.5);
    const i=(py*sz+px)*4;
    img.data[i]=R; img.data[i+1]=G; img.data[i+2]=B; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fill();
}
function _hsl(h,s,l) {
  const k=n=>(n+h*12)%12, a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return[Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];
}
function _hslHex(h,s,l) {
  const[r,g,b]=_hsl(h/360,s/100,l/100);
  return'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function _applyWheelColor() {
  drawColor=_hslHex(drawHue,drawSatW,drawLighW);
  _updateColorUI(drawColor);
  document.querySelectorAll('.dco').forEach(d=>d.classList.remove('act'));
  el('dco-custom')?.classList.add('act');
}
function onDrawL(val) {
  drawLighW=parseInt(val);
  if (drawSatW>0||drawHue>0) _applyWheelColor();
}
function onDrawHex(val) {
  const clean=val.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) { if(el('draw-hex-prev')) el('draw-hex-prev').style.background='rgba(255,255,255,.08)'; return; }
  drawColor=clean; _updateColorUI(clean);
  document.querySelectorAll('.dco').forEach(d=>d.classList.remove('act'));
  el('dco-custom')?.classList.add('act');
}
