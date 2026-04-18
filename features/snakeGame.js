// ══════════════════════════════════════════════════════
//  features/snakeGame.js  —  Snake & Ladders floating panel
//  v2 — sounds, step-by-step animation, juicy UI
// ══════════════════════════════════════════════════════

export function initSnakeGame(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbUpdate, getState, toastFn) {

  const SQ = 36; // px per square
  const COLORS = ['red','blue','green','yellow'];
  const CGRAD  = {
    red:    'radial-gradient(circle at 30% 30%,#ff9a9a,#c62828)',
    blue:   'radial-gradient(circle at 30% 30%,#90caf9,#1565c0)',
    green:  'radial-gradient(circle at 30% 30%,#a5d6a7,#2e7d32)',
    yellow: 'radial-gradient(circle at 30% 30%,#fff59d,#f57f17)'
  };
  const LADDERS = {4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91};
  const SNAKES  = {17:7,54:34,62:19,64:60,87:24,93:73,95:75,99:78};
  const DOTS    = {1:[0,0,0,0,1,0,0,0,0],2:[1,0,0,0,0,0,0,0,1],3:[1,0,0,0,1,0,0,0,1],4:[1,0,1,0,0,0,1,0,1],5:[1,0,1,0,1,0,1,0,1],6:[1,0,1,1,0,1,1,0,1]};

  const T = {
    classic:{bg:'#f5ead0',bg2:'#e8d5a8',sqa:'#a8d5a2',sqb:'#fdf6e3',brd:'#7a5c10',num:'rgba(0,0,0,.22)',pan:'#fffdf0',crd:'rgba(139,105,20,.18)',txt:'#3d2b1f',tx2:'#8a6840',acc:'#c8a040',dbg:'#fffdf0',dot:'#3d2b1f',dbd:'#c8a040',sc:'#c62828',lc:'#7a5c10',ttl:'#7a5c10,#d4a020',btn:'#c8a040',win:'rgba(120,88,10,.95)'},
    heaven: {bg:'#e3f2fd',bg2:'#bbdefb',sqa:'#fff9c4',sqb:'#e3f4ff',brd:'#f9a825',num:'rgba(21,50,100,.25)',pan:'#fff',crd:'rgba(249,168,37,.2)',txt:'#0d2b5e',tx2:'#5c7a9e',acc:'#f9a825',dbg:'#fff',dot:'#0d2b5e',dbd:'#f9a825',sc:'#42a5f5',lc:'#f9a825',ttl:'#4a90d9,#f9a825',btn:'#f9a825',win:'rgba(249,168,37,.97)'},
    love:   {bg:'#fce4ec',bg2:'#f48fb1',sqa:'#f48fb1',sqb:'#fce4ec',brd:'#c2185b',num:'rgba(136,14,79,.28)',pan:'#fff0f6',crd:'rgba(194,24,91,.18)',txt:'#880e4f',tx2:'#c2185b',acc:'#e91e63',dbg:'#fff',dot:'#e91e63',dbd:'#f48fb1',sc:'#b71c1c',lc:'#e91e63',ttl:'#e91e63,#ff80ab',btn:'#e91e63',win:'rgba(194,24,91,.97)'},
    neon:   {bg:'#0a0a1a',bg2:'#111128',sqa:'#141430',sqb:'#0d0d22',brd:'#6c63ff',num:'rgba(108,99,255,.55)',pan:'rgba(14,14,36,.98)',crd:'rgba(108,99,255,.2)',txt:'#dde0ff',tx2:'#7080c0',acc:'#6c63ff',dbg:'#0f0f28',dot:'#43e97b',dbd:'#6c63ff',sc:'#ff4f6b',lc:'#43e97b',ttl:'#6c63ff,#43e97b',btn:'#6c63ff',win:'rgba(20,10,60,.97)'},
  };

  let panel=null, gdata=null, myUid=null, CCI_g=null, unsub=null;
  let curTheme='classic', drag=null, lastMT=0, lastDT=0, animating=false;

  // ── Web Audio sounds (no files needed) ──
  let AC = null;
  function getAC() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type='sine', vol=0.28, delay=0, ramp=true) {
    try {
      const ac = getAC();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime + delay);
      if (ramp) g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
      o.start(ac.currentTime + delay);
      o.stop(ac.currentTime + delay + dur + 0.05);
    } catch(e) {}
  }
  const SND = {
    dice() {
      // shake-rattle
      for (let i = 0; i < 8; i++) tone(150 + Math.random()*400, 0.06, 'square', 0.12, i*0.055);
    },
    step() { tone(520 + Math.random()*80, 0.07, 'sine', 0.18); },
    ladder() {
      [523,659,784,1047,1319].forEach((f,i) => tone(f, 0.18, 'sine', 0.35, i*0.09));
    },
    snake() {
      [480,380,280,200,140].forEach((f,i) => tone(f, 0.2, 'sawtooth', 0.22, i*0.1));
    },
    bounce() { tone(300, 0.1, 'triangle', 0.22); tone(200, 0.12, 'triangle', 0.2, 0.08); },
    win() {
      const m = [523,523,523,784,0,659,587,523,784,1047];
      let t = 0;
      m.forEach(f => { if(f) tone(f, 0.22, 'sine', 0.4, t); t += 0.17; });
    }
  };

  // ── helpers ──
  const el    = id => panel?.querySelector('#'+id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function s2g(n) { const br=Math.floor((n-1)/10),bc=(n-1)%10,vr=9-br,vc=br%2===0?bc:9-bc; return{r:vr,c:vc}; }
  function ctr(n)  { const{r,c}=s2g(n); return{x:(c+.5)*SQ,y:(r+.5)*SQ}; }

  // ── CSS ──
  function injectCSS() {
    if (document.getElementById('sg-css')) return;
    const s = document.createElement('style'); s.id = 'sg-css';
    s.textContent = `
#sg-panel{position:fixed;top:50px;left:50%;transform:translateX(-50%);width:760px;z-index:8500;border-radius:18px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.07);display:flex;flex-direction:column;font-family:'Sora',system-ui,sans-serif;max-height:92vh}
#sg-hdr{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:grab;flex-shrink:0;user-select:none;border-bottom:1px solid rgba(255,255,255,.06)}
#sg-hdr:active{cursor:grabbing}
#sg-ttl{flex:1;font-size:15px;font-weight:800;letter-spacing:.3px;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sg-th{width:19px;height:19px;border-radius:50%;cursor:pointer;border:2.5px solid transparent;transition:.15s;flex-shrink:0}
.sg-th:hover,.sg-th.on{border-color:rgba(255,255,255,.9);transform:scale(1.25);box-shadow:0 0 7px rgba(255,255,255,.3)}
#sg-x{background:none;border:none;font-size:18px;cursor:pointer;opacity:.45;line-height:1;padding:1px 3px;flex-shrink:0;color:inherit}
#sg-x:hover{opacity:1}
#sg-body{display:flex;flex-direction:column;flex:1;position:relative;overflow:hidden}
/* ── Lobby ── */
#sg-lob{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px;flex:1}
#sg-lob-ttl{font-size:26px;font-weight:900;text-align:center;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.5px}
#sg-lob-sub{font-size:12px;opacity:.55;text-align:center;margin-top:-8px}
#sg-lob-grid{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:4px 0}
.sg-lp{border-radius:14px;padding:13px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:84px;border:1.5px solid transparent;transition:.2s;position:relative}
.sg-lp.me{box-shadow:0 0 0 2px currentColor}
.sg-lpc{width:40px;height:40px;border-radius:50%;font-size:16px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;border:2.5px solid rgba(255,255,255,.5);box-shadow:0 3px 10px rgba(0,0,0,.3)}
.sg-lpn{font-size:12px;font-weight:700;text-align:center}
.sg-lpy{font-size:8px;font-weight:900;letter-spacing:.8px;padding:2px 6px;border-radius:8px;background:currentColor;color:#fff}
.sg-lp.empty{opacity:.3}
.sg-empty-ico{font-size:22px}
#sg-lob-st{font-size:12px;animation:sgp 2s ease infinite}
@keyframes sgp{0%,100%{opacity:1}50%{opacity:.3}}
.sg-btn{padding:9px 22px;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;transition:.18s;letter-spacing:.3px}
.sg-btn:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.2)}
.sg-btn:active:not(:disabled){transform:translateY(0) scale(.97)}
.sg-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}
/* ── Game ── */
#sg-game{display:none;flex:1;min-height:0}
#sg-game.on{display:flex}
#sg-bwrap{position:relative;flex-shrink:0;border-radius:8px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.25)}
#sg-board{display:grid;grid-template-columns:repeat(10,${SQ}px);grid-template-rows:repeat(10,${SQ}px);border:2.5px solid;position:relative;z-index:1}
.sg-sq{position:relative;width:${SQ}px;height:${SQ}px;overflow:visible;transition:background .3s}
.sg-sq.flash-ladder{animation:fl-ld .6s ease 2}
.sg-sq.flash-snake{animation:fl-sn .6s ease 2}
@keyframes fl-ld{0%,100%{filter:none}50%{filter:brightness(1.6) saturate(2)}}
@keyframes fl-sn{0%,100%{filter:none}50%{filter:brightness(1.5) hue-rotate(320deg) saturate(2)}}
.sg-sqn{position:absolute;top:1px;right:2px;font-size:6px;font-weight:700;pointer-events:none;z-index:2}
.sg-sqt{position:absolute;bottom:1px;left:0;width:100%;display:flex;flex-wrap:wrap;gap:1px;padding:0 1px;z-index:3;justify-content:center}
.sg-tok{width:15px;height:15px;border-radius:50%;border:2px solid rgba(255,255,255,.85);font-size:6.5px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 3px rgba(0,0,0,.6);box-shadow:0 2px 6px rgba(0,0,0,.4),0 0 0 1px rgba(0,0,0,.15);flex-shrink:0;transition:transform .1s}
.sg-tok.red{background:radial-gradient(circle at 30% 30%,#ff9a9a,#c62828)}
.sg-tok.blue{background:radial-gradient(circle at 30% 30%,#90caf9,#1565c0)}
.sg-tok.green{background:radial-gradient(circle at 30% 30%,#a5d6a7,#2e7d32)}
.sg-tok.yellow{background:radial-gradient(circle at 30% 30%,#fff59d,#f57f17)}
.sg-tok.bounce{animation:tok-b .4s cubic-bezier(.36,1.7,.6,1)}
@keyframes tok-b{0%{transform:scale(.7)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
#sg-cv{position:absolute;top:0;left:0;pointer-events:none;z-index:2}
/* Right panel */
#sg-rp{display:flex;flex-direction:column;gap:8px;padding:10px;overflow-y:auto;flex:1;min-width:0}
#sg-rp::-webkit-scrollbar{width:3px}
.sg-pc{display:flex;align-items:center;gap:8px;border-radius:11px;padding:7px 10px;border:1.5px solid;transition:.2s}
.sg-pc.active{box-shadow:0 0 0 2px var(--acc),inset 0 0 0 1px var(--acc)}
.sg-pct{width:28px;height:28px;border-radius:50%;font-size:12px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid rgba(255,255,255,.5);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.sg-pci{flex:1;min-width:0}
.sg-pcn{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sg-pcs{font-size:9px;opacity:.55}
.sg-badge{font-size:8px;font-weight:900;padding:3px 6px;border-radius:7px;letter-spacing:.5px;animation:bpulse 1.2s ease infinite}
@keyframes bpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(.95)}}
/* Dice area */
#sg-dc{border-radius:12px;padding:11px;border:1.5px solid;display:flex;flex-direction:column;align-items:center;gap:8px}
#sg-dice{width:70px;height:70px;border-radius:14px;border:2.5px solid;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:8px;gap:5px;cursor:pointer;transition:transform .1s;box-shadow:0 6px 18px rgba(0,0,0,.2),0 2px 4px rgba(0,0,0,.15);position:relative;overflow:hidden}
#sg-dice::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.18) 0%,transparent 60%);border-radius:12px;pointer-events:none}
#sg-dice:hover:not(.disabled){transform:scale(1.08) rotate(2deg);box-shadow:0 8px 24px rgba(0,0,0,.3)}
#sg-dice:active:not(.disabled){transform:scale(.93)}
#sg-dice.rolling{animation:diceroll .55s cubic-bezier(.36,1.5,.6,1)}
@keyframes diceroll{0%{transform:rotate(0) scale(1)}15%{transform:rotate(-25deg) scale(1.18)}40%{transform:rotate(32deg) scale(.88)}65%{transform:rotate(-15deg) scale(1.1)}85%{transform:rotate(8deg) scale(.97)}100%{transform:rotate(0) scale(1)}}
.sg-dot{border-radius:50%;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.sg-dot.off{background:transparent!important;box-shadow:none}
#sg-roll{width:100%;padding:9px 0;border:none;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;transition:.18s;color:#fff;letter-spacing:.3px;box-shadow:0 3px 10px rgba(0,0,0,.2)}
#sg-roll:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1.5px);box-shadow:0 5px 16px rgba(0,0,0,.25)}
#sg-roll:active:not(:disabled){transform:translateY(0)}
#sg-roll:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
#sg-tmsg{font-size:11px;text-align:center;line-height:1.4;font-weight:600}
/* Log */
#sg-lc{border-radius:10px;padding:8px 10px;border:1.5px solid;flex:1;overflow-y:auto;max-height:130px;min-height:60px}
#sg-lc::-webkit-scrollbar{width:2px}
.sg-lhd{font-size:8px;font-weight:900;letter-spacing:1.2px;margin-bottom:5px;opacity:.5}
.sg-le{font-size:10px;padding:3px 0;border-bottom:1px solid rgba(128,128,128,.1);line-height:1.45;display:flex;align-items:baseline;gap:4px}
.sg-le:last-child{border-bottom:none}
.sg-le-ico{font-size:12px;flex-shrink:0}
/* Win overlay */
#sg-win{display:none;position:absolute;inset:0;backdrop-filter:blur(12px);z-index:10;flex-direction:column;align-items:center;justify-content:center;gap:12px}
#sg-win.on{display:flex}
#sg-we{font-size:72px;animation:sgwb 1s ease infinite;filter:drop-shadow(0 0 20px rgba(255,200,0,.5))}
@keyframes sgwb{0%,100%{transform:scale(1) rotate(-5deg)}50%{transform:scale(1.2) rotate(5deg)}}
#sg-wt{font-size:26px;font-weight:900;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.4)}
#sg-ws{font-size:13px;color:rgba(255,255,255,.75);text-align:center}
#sg-pa{margin-top:6px;padding:10px 26px;background:#fff;border:none;border-radius:10px;font-size:13px;font-weight:900;cursor:pointer;transition:.15s;color:#333}
#sg-pa:hover{transform:scale(1.07)}
/* Confetti */
.sg-conf{position:absolute;width:8px;height:8px;border-radius:2px;pointer-events:none;animation:conf-fall linear forwards}
@keyframes conf-fall{0%{opacity:1;transform:translateY(0) rotate(0deg)}100%{opacity:0;transform:translateY(220px) rotate(720deg)}}
    `;
    document.head.appendChild(s);
  }

  // ── theme ──
  function applyTheme(t) {
    curTheme = t;
    if (!panel) return;
    const th = T[t] || T.classic;
    const grad = `linear-gradient(135deg,${th.ttl})`;
    panel.style.background = th.bg;
    panel.style.color = th.txt;
    const hdr = el('sg-hdr'); hdr.style.background = th.bg2; hdr.style.borderBottomColor = th.crd;
    el('sg-ttl').style.backgroundImage = grad;
    const ltt = el('sg-lob-ttl'); if(ltt) ltt.style.backgroundImage = grad;
    const st = el('sg-lob-st'); if(st) st.style.color = th.tx2;
    const sb = el('sg-start'); if(sb){ sb.style.background=th.btn; sb.style.color='#fff'; }
    const lb = el('sg-leave'); if(lb){ lb.style.background=th.pan; lb.style.color=th.tx2; lb.style.border=`1.5px solid ${th.crd}`; }
    const roll = el('sg-roll'); if(roll) roll.style.background = th.btn;
    const dc = el('sg-dc'); if(dc){ dc.style.background=th.pan; dc.style.borderColor=th.crd; }
    const dice = el('sg-dice'); if(dice){ dice.style.background=th.dbg; dice.style.borderColor=th.dbd; }
    const lc = el('sg-lc'); if(lc){ lc.style.background=th.pan; lc.style.borderColor=th.crd; }
    const win = el('sg-win'); if(win){ win.style.background=th.win; }
    for(let i=0;i<9;i++){ const d=el(`sgd${i}`); if(d&&!d.classList.contains('off')) d.style.background=th.dot; }
    el('sg-board')?.style && (el('sg-board').style.borderColor = th.brd);
    panel.querySelectorAll('.sg-sq.ea').forEach(s=>s.style.background=th.sqa);
    panel.querySelectorAll('.sg-sq.eb').forEach(s=>s.style.background=th.sqb);
    panel.querySelectorAll('.sg-sqn').forEach(s=>s.style.color=th.num);
    panel.querySelectorAll('.sg-pc').forEach(c=>{ c.style.background=th.pan; c.style.borderColor=th.crd; });
    panel.querySelectorAll('.sg-th').forEach(b=>b.classList.remove('on'));
    const map={classic:'sg-tc',heaven:'sg-th2',love:'sg-tl',neon:'sg-tn'};
    el(map[t])?.classList.add('on');
    drawSL();
  }

  // ── board ──
  function buildBoard() {
    const bd = el('sg-board'); bd.innerHTML = '';
    for(let vr=0;vr<10;vr++){
      for(let vc=0;vc<10;vc++){
        const br=9-vr,bc=br%2===0?vc:9-vc,n=br*10+bc+1;
        const sq=document.createElement('div');
        sq.className=`sg-sq ${(vr+vc)%2===0?'ea':'eb'}`;
        sq.id=`sgq${n}`;
        sq.innerHTML=`<div class="sg-sqn">${n}</div><div class="sg-sqt" id="sgt${n}"></div>`;
        bd.appendChild(sq);
      }
    }
  }

  // ── canvas draw ──
  function drawSL() {
    const cv = el('sg-cv'); if(!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,SQ*10,SQ*10);
    const th = T[curTheme]||T.classic;
    Object.entries(LADDERS).forEach(([a,b])=>drawLadder(ctx,ctr(+a),ctr(+b),th.lc));
    Object.entries(SNAKES).forEach(([h,t])=>drawSnake(ctx,ctr(+h),ctr(+t),th.sc));
  }
  function drawLadder(ctx,a,b,col){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);
    const nx=-dy/len*5,ny=dx/len*5;
    ctx.globalAlpha=.8; ctx.strokeStyle=col; ctx.lineCap='round';
    [[a.x-nx,a.y-ny,b.x-nx,b.y-ny],[a.x+nx,a.y+ny,b.x+nx,b.y+ny]].forEach(([x1,y1,x2,y2])=>{
      ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    const steps=Math.max(2,Math.floor(len/13));
    ctx.lineWidth=2;
    for(let i=1;i<=steps;i++){const t=i/(steps+1),rx=a.x+dx*t,ry=a.y+dy*t;ctx.beginPath();ctx.moveTo(rx-nx,ry-ny);ctx.lineTo(rx+nx,ry+ny);ctx.stroke();}
    ctx.globalAlpha=1; ctx.beginPath(); ctx.arc(a.x,a.y,4,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
  }
  function drawSnake(ctx,head,tail,col){
    const dx=tail.x-head.x,dy=tail.y-head.y;
    const cx1=head.x+dx*.25+dy*.38,cy1=head.y+dy*.25-dx*.38;
    const cx2=head.x+dx*.75-dy*.38,cy2=head.y+dy*.75+dx*.38;
    // shadow
    ctx.beginPath(); ctx.moveTo(head.x,head.y); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,tail.x,tail.y);
    ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.globalAlpha=1; ctx.stroke();
    // body
    ctx.beginPath(); ctx.moveTo(head.x,head.y); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,tail.x,tail.y);
    ctx.strokeStyle=col; ctx.lineWidth=5; ctx.globalAlpha=.85; ctx.stroke();
    // head circle
    ctx.beginPath(); ctx.arc(head.x,head.y,6.5,0,Math.PI*2); ctx.fillStyle=col; ctx.globalAlpha=1; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1.5; ctx.stroke();
    // eyes
    ctx.fillStyle='#fff';
    [[head.x+2.5,head.y-2],[head.x-2.5,head.y-2]].forEach(([ex,ey])=>{
      ctx.beginPath(); ctx.arc(ex,ey,2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(ex,ey,1,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff';
    });
    ctx.globalAlpha=1;
  }

  // ── dice face ──
  function showDice(v){
    const pat=DOTS[v]||DOTS[1], th=T[curTheme]||T.classic;
    for(let i=0;i<9;i++){
      const d=el(`sgd${i}`); if(!d) continue;
      d.className=`sg-dot${pat[i]?'':' off'}`;
      if(pat[i]) d.style.background=th.dot;
    }
  }
  function animDice(v){
    const dice=el('sg-dice'); if(!dice) return;
    SND.dice();
    // flash random faces then settle
    let count = 0;
    const iv = setInterval(() => {
      showDice(Math.floor(Math.random()*6)+1);
      count++;
      if(count >= 6) { clearInterval(iv); showDice(v); }
    }, 70);
    dice.classList.remove('rolling'); void dice.offsetWidth; dice.classList.add('rolling');
    setTimeout(()=>dice.classList.remove('rolling'),600);
  }

  // ── token step animation ──
  async function animateMove(uid, fromPos, toPos, finalPos, isLadder, isSnake) {
    const pl = gdata?.players?.[uid]; if(!pl) return;
    // step from fromPos+1 to toPos
    const dir = toPos > fromPos ? 1 : -1;
    const steps = Math.abs(toPos - fromPos);
    let cur = fromPos;
    for(let i=0; i<steps; i++){
      cur += dir;
      await sleep(110);
      SND.step();
      // temporarily update pos for render
      renderTokensOverride(uid, cur);
    }
    await sleep(120);
    if(isLadder){
      flashSquare(toPos, 'flash-ladder');
      await sleep(200);
      SND.ladder();
      renderTokensOverride(uid, finalPos);
      await sleep(120);
      addBounce(uid);
    } else if(isSnake){
      flashSquare(toPos, 'flash-snake');
      await sleep(200);
      SND.snake();
      renderTokensOverride(uid, finalPos);
      await sleep(120);
      addBounce(uid);
    } else {
      addBounce(uid);
      if(toPos <= 0) SND.bounce();
    }
  }
  function renderTokensOverride(uid, pos) {
    if(!gdata) return;
    const fake = Object.assign({}, gdata.players);
    if(fake[uid]) fake[uid] = Object.assign({}, fake[uid], {pos});
    renderTokens(fake);
  }
  function flashSquare(sq, cls) {
    const sqEl = el(`sgq${sq}`); if(!sqEl) return;
    sqEl.classList.add(cls);
    setTimeout(()=>sqEl.classList.remove(cls), 1300);
  }
  function addBounce(uid) {
    const pl = gdata?.players?.[uid]; if(!pl) return;
    const box = el(`sgt${pl.pos}`); if(!box) return;
    const tok = box.querySelector('.sg-tok'); if(!tok) return;
    tok.classList.remove('bounce'); void tok.offsetWidth; tok.classList.add('bounce');
    setTimeout(()=>tok.classList.remove('bounce'),500);
  }

  // ── render tokens ──
  function renderTokens(players){
    panel.querySelectorAll('.sg-sqt').forEach(e=>e.innerHTML='');
    Object.values(players||{}).forEach(pl=>{
      if(!pl.pos||pl.pos<1||pl.pos>100) return;
      const box=el(`sgt${pl.pos}`); if(!box) return;
      const tok=document.createElement('div');
      tok.className=`sg-tok ${pl.color}`;
      tok.textContent=(pl.name||'?')[0].toUpperCase();
      tok.title=pl.name;
      box.appendChild(tok);
    });
  }

  // ── player cards ──
  function renderCards(players,turn){
    const wrap=el('sg-pcw'); if(!wrap) return;
    const th=T[curTheme]||T.classic;
    wrap.innerHTML='';
    Object.entries(players||{}).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([uid,pl])=>{
      const isTurn=uid===turn,isMe=uid===myUid;
      const card=document.createElement('div');
      card.className='sg-pc'; card.style.background=th.pan; card.style.borderColor=th.crd;
      if(isTurn){ card.style.boxShadow=`0 0 0 2px ${th.acc}`; card.style.setProperty('--acc',th.acc); }
      card.innerHTML=`
        <div class="sg-pct" style="background:${CGRAD[pl.color]||'#999'}">${(pl.name||'?')[0].toUpperCase()}</div>
        <div class="sg-pci">
          <div class="sg-pcn">${pl.name}${isMe?' <span style="opacity:.5;font-size:9px">(you)</span>':''}</div>
          <div class="sg-pcs">Sq ${pl.pos>0?pl.pos:'Start'}</div>
        </div>
        ${isTurn?`<div class="sg-badge" style="background:${th.acc}22;color:${th.acc};border:1px solid ${th.acc}55">TURN</div>`:''}
      `;
      wrap.appendChild(card);
    });
  }

  // ── log ──
  function addLog(ico, html){
    const log=el('sg-log'); if(!log) return;
    const e=document.createElement('div'); e.className='sg-le';
    e.innerHTML=`<span class="sg-le-ico">${ico}</span><span>${html}</span>`;
    log.prepend(e);
    while(log.children.length>22) log.removeChild(log.lastChild);
  }

  // ── confetti ──
  function spawnConfetti(){
    const pal=['#ff4f6b','#ffd700','#43e97b','#6c63ff','#ff9a3c','#00e5ff'];
    const win=el('sg-win'); if(!win) return;
    for(let i=0;i<36;i++){
      const c=document.createElement('div');
      c.className='sg-conf';
      c.style.cssText=`left:${10+Math.random()*80}%;top:${-10+Math.random()*30}%;background:${pal[i%pal.length]};width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;animation-duration:${1.2+Math.random()*.9}s;animation-delay:${Math.random()*.4}s;border-radius:${Math.random()>.5?'50%':'2px'}`;
      win.appendChild(c);
      setTimeout(()=>c.remove(), 2400);
    }
  }

  // ── lobby ──
  function renderLobby(d){
    el('sg-lob').style.display='flex';
    el('sg-game')?.classList.remove('on');
    const th=T[curTheme]||T.classic;
    const players=d.players||{};
    const sorted=Object.entries(players).sort((a,b)=>(a[1].order||0)-(b[1].order||0));
    const grid=el('sg-lob-grid'); grid.innerHTML='';
    sorted.forEach(([uid,pl])=>{
      const isMe=uid===myUid,card=document.createElement('div');
      card.className=`sg-lp${isMe?' me':''}`;
      card.style.background=th.pan; card.style.borderColor=th.crd;
      card.innerHTML=`
        <div class="sg-lpc" style="background:${CGRAD[pl.color]}">${(pl.name||'?')[0].toUpperCase()}</div>
        <div class="sg-lpn" style="color:${th.txt}">${pl.name}</div>
        ${isMe?`<div class="sg-lpy" style="color:${th.acc};background:${th.acc}22">YOU</div>`:''}
      `;
      grid.appendChild(card);
    });
    for(let i=sorted.length;i<4;i++){
      const e=document.createElement('div');
      e.className='sg-lp empty';
      e.innerHTML=`<div class="sg-lpc" style="background:#aaa;font-size:18px;opacity:.4">?</div><div class="sg-lpn" style="color:${th.tx2}">Waiting…</div>`;
      grid.appendChild(e);
    }
    const cnt=sorted.length,isHost=d.createdBy===myUid,sb=el('sg-start');
    sb.disabled=!(isHost&&cnt>=2);
    sb.textContent=isHost?(cnt>=2?'▶ Start Game':`Need ${2-cnt} more`):'Waiting for host…';
    el('sg-lob-st').textContent=cnt<2?`${cnt}/4 joined — need at least 2`:isHost?`${cnt} players ready — start?`:`Waiting for host to start…`;
  }

  // ── game ──
  function renderGame(d){
    el('sg-lob').style.display='none';
    el('sg-game')?.classList.add('on');
    renderTokens(d.players);
    renderCards(d.players,d.currentTurn);
    const isMyTurn=d.currentTurn===myUid,tp=d.players?.[d.currentTurn];
    el('sg-roll').disabled=!isMyTurn||animating;
    el('sg-tmsg').textContent=isMyTurn?'🎲 Your turn! Roll the dice!':tp?`⏳ ${tp.name}'s turn…`:'–';
    if(d.dice?.value&&d.dice.t>lastDT){ lastDT=d.dice.t; animDice(d.dice.value); }
    else if(d.dice?.value) showDice(d.dice.value);
    if(d.lastMove&&d.lastMove.t>lastMT){
      lastMT=d.lastMove.t;
      const lm=d.lastMove,mp=d.players?.[lm.uid];
      let ico='🎲', msg=`<b>${mp?.name}</b> rolled ${lm.dice}`;
      if(lm.bounced){ ico='🔄'; msg+=` bounced → ${lm.to}`; }
      else { msg+=` → sq ${lm.to}`; }
      if(lm.ladder){ ico='🪜'; msg+=` climbed ladder → <b>${lm.final}</b>!`; }
      if(lm.snake){ ico='🐍'; msg+=` hit snake → <b>${lm.final}</b>!`; }
      addLog(ico, msg);
      // animate
      animating=true;
      el('sg-roll').disabled=true;
      animateMove(lm.uid,lm.from,lm.to,lm.final,lm.ladder,lm.snake).then(()=>{
        animating=false;
        renderTokens(d.players);
        renderCards(d.players,d.currentTurn);
        el('sg-roll').disabled=!(d.currentTurn===myUid);
      });
    }
  }

  // ── win ──
  function renderWin(d){
    renderGame(d);
    el('sg-roll').disabled=true;
    const w=d.players?.[d.winner],isMe=d.winner===myUid,win=el('sg-win');
    win.classList.add('on'); win.style.background=(T[curTheme]||T.classic).win;
    el('sg-we').textContent=isMe?'🏆':'🎊';
    el('sg-wt').textContent=isMe?'You Win! 🎉':`${w?.name||'?'} Wins!`;
    el('sg-ws').textContent=isMe?'You reached square 100!':'Better luck next time 🍀';
    el('sg-pa').style.display=d.createdBy===myUid?'block':'none';
    if(isMe){ SND.win(); setTimeout(spawnConfetti,200); setTimeout(spawnConfetti,700); }
  }

  // ── roll ──
  function rollDice(){
    if(!gdata||gdata.currentTurn!==myUid||gdata.state!=='playing'||animating) return;
    const me=gdata.players?.[myUid]; if(!me) return;
    el('sg-roll').disabled=true;
    const val=Math.floor(Math.random()*6)+1,cur=me.pos||0;
    let raw=cur+val,bounced=false;
    if(raw>100){raw=200-raw;bounced=true;}
    if(raw<1) raw=1;
    let final=raw,ladder=false,snake=false;
    if(!bounced&&LADDERS[raw]){final=LADDERS[raw];ladder=true;}
    else if(!bounced&&SNAKES[raw]){final=SNAKES[raw];snake=true;}
    const won=final===100;
    const order=Object.entries(gdata.players||{}).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).map(e=>e[0]);
    const nextTurn=won?myUid:order[(order.indexOf(myUid)+1)%order.length];
    const now=Date.now();
    dbUpdate(dbRef(db,`games/${CCI_g}`),{
      [`players/${myUid}/pos`]:final, dice:{value:val,t:now},
      lastMove:{uid:myUid,dice:val,from:cur,to:raw,final,bounced,ladder,snake,t:now},
      currentTurn:nextTurn, ...(won?{state:'finished',winner:myUid}:{})
    });
  }

  function startGame(){
    if(!gdata||gdata.createdBy!==myUid) return;
    const uids=Object.keys(gdata.players||{}); if(uids.length<2) return;
    uids.sort(()=>Math.random()-.5);
    const ups={state:'playing',currentTurn:uids[0],winner:null,dice:null,lastMove:null};
    uids.forEach((uid,i)=>{ups[`players/${uid}/order`]=i;ups[`players/${uid}/pos`]=0;});
    dbUpdate(dbRef(db,`games/${CCI_g}`),ups);
  }

  function leaveGame(){
    cleanup();
    if(myUid&&CCI_g) dbRemove(dbRef(db,`games/${CCI_g}/players/${myUid}`)).catch(()=>{});
    panel.style.display='none';
  }

  function playAgain(){
    if(!gdata||gdata.createdBy!==myUid) return;
    const ups={state:'lobby',currentTurn:null,winner:null,dice:null,lastMove:null};
    Object.keys(gdata.players||{}).forEach(uid=>{ups[`players/${uid}/pos`]=0;});
    dbUpdate(dbRef(db,`games/${CCI_g}`),ups);
    el('sg-win')?.classList.remove('on');
    const log=el('sg-log'); if(log) log.innerHTML='';
    lastMT=0; lastDT=0; animating=false;
  }

  function listenGame(){
    if(unsub){unsub();unsub=null;}
    unsub=dbOnValue(dbRef(db,`games/${CCI_g}`),snap=>{
      const d=snap.val(); if(!d) return;
      gdata=d;
      if(d.state==='lobby') renderLobby(d);
      else if(d.state==='playing') renderGame(d);
      else if(d.state==='finished') renderWin(d);
    });
  }

  function cleanup(){ if(unsub){unsub();unsub=null;} gdata=null; lastMT=0; lastDT=0; animating=false; }

  async function joinGame(){
    const { CU }=getState();
    const name=CU?.displayName||'Player';
    const snap=await dbGet(dbRef(db,`games/${CCI_g}`));
    const d=snap.val();
    if(!d){
      await dbSet(dbRef(db,`games/${CCI_g}`),{state:'lobby',createdBy:myUid,players:{[myUid]:{name,color:COLORS[0],pos:0,order:0}}});
    } else {
      if(!d.players?.[myUid]){
        const cnt=Object.keys(d.players||{}).length;
        if(cnt>=4){toastFn('Game is full (max 4)!');return;}
        if(d.state!=='lobby'){toastFn('Game already started!');return;}
        await dbUpdate(dbRef(db,`games/${CCI_g}/players`),{[myUid]:{name,color:COLORS[cnt%COLORS.length],pos:0,order:cnt}});
      }
    }
    listenGame();
  }

  // ── build DOM ──
  function createPanel(){
    injectCSS();
    panel=document.createElement('div');
    panel.id='sg-panel';
    panel.style.cssText='display:flex;flex-direction:column;font-family:system-ui,sans-serif';
    panel.innerHTML=`
      <div id="sg-hdr">
        <span style="font-size:18px">🐍</span>
        <div id="sg-ttl">Snake &amp; Ladders</div>
        <div style="display:flex;gap:5px;align-items:center">
          <div class="sg-th on" id="sg-tc" data-t="classic" style="background:linear-gradient(135deg,#a8d5a2,#f5ead0)" title="Classic"></div>
          <div class="sg-th"   id="sg-th2" data-t="heaven"  style="background:linear-gradient(135deg,#ffd700,#e3f4ff)" title="Heaven"></div>
          <div class="sg-th"   id="sg-tl"  data-t="love"    style="background:linear-gradient(135deg,#e91e63,#fce4ec)" title="Love"></div>
          <div class="sg-th"   id="sg-tn"  data-t="neon"    style="background:linear-gradient(135deg,#6c63ff,#43e97b)" title="Neon"></div>
        </div>
        <button id="sg-x">✕</button>
      </div>
      <div id="sg-body">
        <div id="sg-lob">
          <div id="sg-lob-ttl">🎲 Snake &amp; Ladders 🪜</div>
          <div id="sg-lob-sub">Real-time multiplayer · 2–4 players</div>
          <div id="sg-lob-grid"></div>
          <div id="sg-lob-st">Waiting for players…</div>
          <div style="display:flex;gap:9px">
            <button class="sg-btn" id="sg-start" disabled>▶ Start Game</button>
            <button class="sg-btn" id="sg-leave">Leave</button>
          </div>
        </div>
        <div id="sg-game">
          <div id="sg-bwrap">
            <div id="sg-board"></div>
            <canvas id="sg-cv" width="${SQ*10}" height="${SQ*10}"></canvas>
          </div>
          <div id="sg-rp">
            <div id="sg-pcw"></div>
            <div id="sg-dc">
              <div id="sg-dice">${Array.from({length:9},(_,i)=>`<div class="sg-dot off" id="sgd${i}"></div>`).join('')}</div>
              <div id="sg-tmsg">–</div>
              <button id="sg-roll" disabled>🎲 Roll Dice</button>
            </div>
            <div id="sg-lc"><div class="sg-lhd">GAME LOG</div><div id="sg-log"></div></div>
          </div>
        </div>
        <div id="sg-win">
          <div id="sg-we">🏆</div>
          <div id="sg-wt">You Win!</div>
          <div id="sg-ws">You reached square 100!</div>
          <button id="sg-pa">🔄 Play Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    el('sg-x').addEventListener('click',()=>{panel.style.display='none';cleanup();});
    el('sg-start').addEventListener('click',startGame);
    el('sg-leave').addEventListener('click',leaveGame);
    el('sg-dice').addEventListener('click',rollDice);
    el('sg-roll').addEventListener('click',rollDice);
    el('sg-pa').addEventListener('click',playAgain);
    panel.querySelectorAll('.sg-th').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.t)));

    // drag
    el('sg-hdr').addEventListener('mousedown',e=>{
      if(e.target.closest('button,.sg-th')) return;
      const r=panel.getBoundingClientRect();
      drag={ox:e.clientX-r.left,oy:e.clientY-r.top};
      panel.style.transform='none';
    });
    document.addEventListener('mousemove',e=>{
      if(!drag) return;
      panel.style.left=Math.max(0,Math.min(e.clientX-drag.ox,window.innerWidth-panel.offsetWidth))+'px';
      panel.style.top=Math.max(0,Math.min(e.clientY-drag.oy,window.innerHeight-panel.offsetHeight))+'px';
    });
    document.addEventListener('mouseup',()=>{drag=null;});

    buildBoard();
    showDice(1);
    applyTheme('classic');
    setTimeout(drawSL, 60);
  }

  // ── toggle ──
  window.openGame = () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    if (!panel) createPanel();
    if (panel.style.display !== 'none' && panel.style.display !== '') {
      panel.style.display='none'; cleanup(); return;
    }
    myUid=CU?.uid; CCI_g=CCI;
    panel.style.display='flex';
    panel.style.left='50%'; panel.style.top='50px'; panel.style.transform='translateX(-50%)';
    el('sg-win')?.classList.remove('on');
    const log=el('sg-log'); if(log) log.innerHTML='';
    lastMT=0; lastDT=0; animating=false;
    joinGame();
  };
}
