// ══════════════════════════════════════════════════════
//  features/snakeGame.js  —  Snake & Ladders floating panel
// ══════════════════════════════════════════════════════

export function initSnakeGame(db, dbRef, dbSet, dbGet, dbOnValue, dbRemove, dbUpdate, getState, toastFn) {

  const SQ = 32; // px per square (320×320 board)
  const COLORS  = ['red','blue','green','yellow'];
  const CGRAD   = { red:'radial-gradient(circle at 35% 35%,#ff8a8a,#d32f2f)', blue:'radial-gradient(circle at 35% 35%,#8a9fff,#3949ab)', green:'radial-gradient(circle at 35% 35%,#80ffb0,#2e7d32)', yellow:'radial-gradient(circle at 35% 35%,#fff080,#f57f17)' };
  const LADDERS = {4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91};
  const SNAKES  = {17:7,54:34,62:19,64:60,87:24,93:73,95:75,99:78};
  const DOTS    = {1:[0,0,0,0,1,0,0,0,0],2:[1,0,0,0,0,0,0,0,1],3:[1,0,0,0,1,0,0,0,1],4:[1,0,1,0,0,0,1,0,1],5:[1,0,1,0,1,0,1,0,1],6:[1,0,1,1,0,1,1,0,1]};

  // Themes: bg bg2 sqa sqb brd num pan crd txt tx2 acc dbg dot dbd sc lc ttl btn win
  const T = {
    classic:{bg:'#f5ead0',bg2:'#ede0c0',sqa:'#9dcc96',sqb:'#f9f3e2',brd:'#8b6914',num:'rgba(0,0,0,.27)',pan:'#fffbf0',crd:'rgba(139,105,20,.2)',txt:'#3d2b1f',tx2:'#8a6840',acc:'#c8a040',dbg:'#fffbf0',dot:'#3d2b1f',dbd:'#c8a040',sc:'#d63031',lc:'#8b6914',ttl:'#8b6914,#e8c060',btn:'#c8a040',win:'rgba(139,105,20,.97)'},
    heaven: {bg:'#e8f5ff',bg2:'#d4edff',sqa:'#fff9c4',sqb:'#e3f4ff',brd:'#ffd700',num:'rgba(28,60,100,.3)',pan:'#fff',crd:'rgba(255,215,0,.25)',txt:'#1c3c64',tx2:'#5c7a9e',acc:'#f5c800',dbg:'#fff',dot:'#1c3c64',dbd:'#ffd700',sc:'#74b9e0',lc:'#ffd700',ttl:'#5c7a9e,#ffd700',btn:'#f5c800',win:'rgba(245,200,0,.97)'},
    love:   {bg:'#fce4ec',bg2:'#f8bbd0',sqa:'#f48fb1',sqb:'#fce4ec',brd:'#e91e63',num:'rgba(136,14,79,.32)',pan:'#fff0f6',crd:'rgba(233,30,99,.2)',txt:'#880e4f',tx2:'#c2185b',acc:'#e91e63',dbg:'#fff',dot:'#e91e63',dbd:'#f48fb1',sc:'#b71c1c',lc:'#e91e63',ttl:'#e91e63,#ff80ab',btn:'#e91e63',win:'rgba(233,30,99,.97)'},
    neon:   {bg:'#0d0d1f',bg2:'#12122a',sqa:'#181832',sqb:'#0f0f26',brd:'#6c63ff',num:'rgba(108,99,255,.5)',pan:'rgba(18,18,42,.98)',crd:'rgba(108,99,255,.22)',txt:'#e0e0ff',tx2:'#8080b0',acc:'#6c63ff',dbg:'#181832',dot:'#43e97b',dbd:'#6c63ff',sc:'#ff4f6b',lc:'#43e97b',ttl:'#6c63ff,#43e97b',btn:'#6c63ff',win:'rgba(108,99,255,.97)'},
  };

  let panel=null, gdata=null, myUid=null, CCI_g=null, unsub=null;
  let curTheme='classic', drag=null, lastMT=0, lastDT=0;

  // ── helpers ──
  const el = id => panel?.querySelector('#'+id);
  function s2g(n) { const br=Math.floor((n-1)/10),bc=(n-1)%10,vr=9-br,vc=br%2===0?bc:9-bc; return{r:vr,c:vc}; }
  function ctr(n)  { const{r,c}=s2g(n); return{x:(c+.5)*SQ,y:(r+.5)*SQ}; }

  // ── inject CSS once ──
  function injectCSS() {
    if (document.getElementById('sg-css')) return;
    const s = document.createElement('style');
    s.id = 'sg-css';
    s.textContent = `
    #sg-panel{position:fixed;top:52px;left:50%;transform:translateX(-50%);width:710px;z-index:8500;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07);display:flex;flex-direction:column;font-family:'Sora',system-ui,sans-serif}
    #sg-hdr{display:flex;align-items:center;gap:9px;padding:8px 13px;cursor:grab;flex-shrink:0;user-select:none}
    #sg-hdr:active{cursor:grabbing}
    #sg-ttl{flex:1;font-size:14px;font-weight:800;letter-spacing:.3px;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .sg-th{width:18px;height:18px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:.15s;flex-shrink:0}
    .sg-th:hover,.sg-th.on{border-color:rgba(255,255,255,.85);transform:scale(1.22)}
    #sg-x{background:none;border:none;font-size:17px;cursor:pointer;opacity:.5;line-height:1;padding:0 2px;flex-shrink:0}
    #sg-x:hover{opacity:1}
    #sg-body{display:flex;flex-direction:column;flex:1;position:relative}
    /* Lobby */
    #sg-lob{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:22px;flex:1}
    #sg-lob-ttl{font-size:22px;font-weight:900;text-align:center;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    #sg-lob-grid{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
    .sg-lp{border-radius:12px;padding:11px 14px;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:78px;border:1px solid transparent;transition:.2s}
    .sg-lpc{width:34px;height:34px;border-radius:50%;font-size:14px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.45)}
    .sg-lpn{font-size:11px;font-weight:600}
    .sg-lpy{font-size:9px;font-weight:800;letter-spacing:.5px}
    #sg-lob-st{font-size:12px;animation:sgp 2s ease infinite}
    @keyframes sgp{0%,100%{opacity:1}50%{opacity:.3}}
    .sg-btn{padding:8px 20px;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;transition:.18s}
    .sg-btn:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px)}
    .sg-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
    /* Game */
    #sg-game{display:none;flex:1}
    #sg-game.on{display:flex}
    #sg-bwrap{position:relative;flex-shrink:0}
    #sg-board{display:grid;grid-template-columns:repeat(10,${SQ}px);grid-template-rows:repeat(10,${SQ}px);border:2px solid;border-radius:6px;overflow:hidden;position:relative;z-index:1;box-shadow:0 3px 18px rgba(0,0,0,.2)}
    .sg-sq{position:relative;width:${SQ}px;height:${SQ}px;overflow:visible}
    .sg-sqn{position:absolute;top:1px;right:2px;font-size:6.5px;font-weight:700;pointer-events:none;z-index:2}
    .sg-sqt{position:absolute;bottom:2px;left:0;width:100%;display:flex;flex-wrap:wrap;gap:1px;padding:0 2px;z-index:3}
    .sg-tok{width:13px;height:13px;border-radius:50%;border:1.5px solid rgba(255,255,255,.8);font-size:6px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 2px rgba(0,0,0,.5);box-shadow:0 1px 4px rgba(0,0,0,.3);flex-shrink:0}
    .sg-tok.red{background:radial-gradient(circle at 35% 35%,#ff8a8a,#d32f2f)}
    .sg-tok.blue{background:radial-gradient(circle at 35% 35%,#8a9fff,#3949ab)}
    .sg-tok.green{background:radial-gradient(circle at 35% 35%,#80ffb0,#2e7d32)}
    .sg-tok.yellow{background:radial-gradient(circle at 35% 35%,#fff080,#f57f17)}
    #sg-cv{position:absolute;top:0;left:0;pointer-events:none;z-index:2}
    /* Right panel */
    #sg-rp{display:flex;flex-direction:column;gap:7px;padding:8px;overflow-y:auto;flex:1;min-width:0}
    #sg-rp::-webkit-scrollbar{width:3px}
    .sg-pc{display:flex;align-items:center;gap:7px;border-radius:9px;padding:6px 9px;border:1px solid}
    .sg-pct{width:26px;height:26px;border-radius:50%;font-size:11px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid rgba(255,255,255,.45)}
    .sg-pci{flex:1;min-width:0}
    .sg-pcn{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sg-pcs{font-size:9px;opacity:.6}
    .sg-badge{font-size:8px;font-weight:800;padding:2px 5px;border-radius:6px}
    #sg-dc{border-radius:10px;padding:10px;border:1px solid;display:flex;flex-direction:column;align-items:center;gap:7px}
    #sg-dice{width:56px;height:56px;border-radius:12px;border:2px solid;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:7px;gap:4px;cursor:pointer;transition:.12s;box-shadow:0 3px 12px rgba(0,0,0,.12)}
    #sg-dice:hover{transform:scale(1.07)}
    #sg-dice:active{transform:scale(.9)}
    #sg-dice.spin{animation:sgdice .5s ease-out}
    @keyframes sgdice{0%{transform:rotate(0)scale(1)}20%{transform:rotate(-18deg)scale(1.12)}45%{transform:rotate(28deg)scale(.93)}65%{transform:rotate(-12deg)scale(1.06)}100%{transform:rotate(0)scale(1)}}
    .sg-dot{border-radius:50%;transition:.1s}
    .sg-dot.off{background:transparent!important;box-shadow:none}
    #sg-roll{width:100%;padding:8px 0;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:.18s;color:#fff}
    #sg-roll:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px)}
    #sg-roll:disabled{opacity:.4;cursor:not-allowed;transform:none}
    #sg-tmsg{font-size:10px;text-align:center;line-height:1.4;opacity:.7}
    #sg-lc{border-radius:9px;padding:7px 9px;border:1px solid;flex:1;min-height:50px;overflow-y:auto;max-height:120px}
    #sg-lc::-webkit-scrollbar{width:2px}
    .sg-lhd{font-size:8px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
    .sg-le{font-size:10px;padding:2px 0;border-bottom:1px solid rgba(128,128,128,.12);line-height:1.4}
    .sg-le:last-child{border-bottom:none}
    /* Win overlay */
    #sg-win{display:none;position:absolute;inset:0;backdrop-filter:blur(10px);z-index:10;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:0 0 16px 16px}
    #sg-win.on{display:flex}
    #sg-we{font-size:60px;animation:sgwb 1.1s ease infinite}
    @keyframes sgwb{0%,100%{transform:scale(1)rotate(-6deg)}50%{transform:scale(1.2)rotate(6deg)}}
    #sg-wt{font-size:22px;font-weight:900;color:#fff;text-align:center}
    #sg-ws{font-size:13px;color:rgba(255,255,255,.8);text-align:center}
    #sg-pa{margin-top:4px;padding:9px 22px;background:#fff;border:none;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer;transition:.15s}
    #sg-pa:hover{transform:scale(1.06)}
    `;
    document.head.appendChild(s);
  }

  // ── apply theme ──
  function applyTheme(t) {
    curTheme = t;
    if (!panel) return;
    const th = T[t] || T.classic;
    const grad = `linear-gradient(135deg,${th.ttl})`;
    panel.style.cssText = panel.style.cssText; // keep positioning
    panel.style.background = th.bg;
    panel.style.color = th.txt;
    const hdr = el('sg-hdr');
    hdr.style.background = th.bg2;
    hdr.style.borderBottom = `1px solid ${th.crd}`;
    const ttl = el('sg-ttl'); ttl.style.backgroundImage = grad;
    const ltt = el('sg-lob-ttl'); if(ltt){ ltt.style.backgroundImage=grad; }
    const st  = el('sg-lob-st'); if(st) st.style.color=th.tx2;
    // buttons
    const sb = el('sg-start'); if(sb){ sb.style.background=th.btn; sb.style.color='#fff'; }
    const lb = el('sg-leave'); if(lb){ lb.style.background=th.pan; lb.style.color=th.tx2; lb.style.border=`1px solid ${th.crd}`; }
    const roll = el('sg-roll'); if(roll){ roll.style.background=th.btn; }
    const dc = el('sg-dc'); if(dc){ dc.style.background=th.pan; dc.style.borderColor=th.crd; }
    const dice = el('sg-dice'); if(dice){ dice.style.background=th.dbg; dice.style.borderColor=th.dbd; }
    const lc = el('sg-lc'); if(lc){ lc.style.background=th.pan; lc.style.borderColor=th.crd; }
    const win = el('sg-win'); if(win){ win.style.background=th.win; }
    // dots color
    for(let i=0;i<9;i++){ const d=el(`sgd${i}`); if(d&&!d.classList.contains('off')) d.style.background=th.dot; }
    // board squares
    el('sg-board')?.style && (el('sg-board').style.borderColor=th.brd);
    panel.querySelectorAll('.sg-sq.ea').forEach(s=>s.style.background=th.sqa);
    panel.querySelectorAll('.sg-sq.eb').forEach(s=>s.style.background=th.sqb);
    panel.querySelectorAll('.sg-sqn').forEach(s=>s.style.color=th.num);
    // player cards
    panel.querySelectorAll('.sg-pc').forEach(c=>{c.style.background=th.pan;c.style.borderColor=th.crd;});
    // theme buttons
    panel.querySelectorAll('.sg-th').forEach(b=>b.classList.remove('on'));
    const map={classic:'sg-tc',heaven:'sg-th2',love:'sg-tl',neon:'sg-tn'};
    el(map[t])?.classList.add('on');
    drawSL();
  }

  // ── build board ──
  function buildBoard() {
    const bd = el('sg-board');
    bd.innerHTML = '';
    for(let vr=0;vr<10;vr++){
      for(let vc=0;vc<10;vc++){
        const br=9-vr, bc=br%2===0?vc:9-vc, n=br*10+bc+1;
        const sq=document.createElement('div');
        sq.className=`sg-sq ${(vr+vc)%2===0?'ea':'eb'}`;
        sq.id=`sgq${n}`;
        sq.innerHTML=`<div class="sg-sqn">${n}</div><div class="sg-sqt" id="sgt${n}"></div>`;
        bd.appendChild(sq);
      }
    }
  }

  // ── canvas: snakes & ladders ──
  function drawSL() {
    const cv = el('sg-cv');
    if(!cv) return;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,SQ*10,SQ*10);
    const th=T[curTheme]||T.classic;
    Object.entries(LADDERS).forEach(([a,b])=>drawLadder(ctx,ctr(+a),ctr(+b),th.lc));
    Object.entries(SNAKES).forEach(([h,t])=>drawSnake(ctx,ctr(+h),ctr(+t),th.sc));
  }
  function drawLadder(ctx,a,b,col){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);
    const nx=-dy/len*4.5,ny=dx/len*4.5;
    ctx.globalAlpha=.75; ctx.strokeStyle=col; ctx.lineCap='round';
    [[a.x-nx,a.y-ny,b.x-nx,b.y-ny],[a.x+nx,a.y+ny,b.x+nx,b.y+ny]].forEach(([x1,y1,x2,y2])=>{
      ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    const steps=Math.max(2,Math.floor(len/12));
    ctx.lineWidth=1.8;
    for(let i=1;i<=steps;i++){const t=i/(steps+1),rx=a.x+dx*t,ry=a.y+dy*t;ctx.beginPath();ctx.moveTo(rx-nx,ry-ny);ctx.lineTo(rx+nx,ry+ny);ctx.stroke();}
    ctx.globalAlpha=.92; ctx.beginPath(); ctx.arc(a.x,a.y,3.5,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.globalAlpha=1;
  }
  function drawSnake(ctx,head,tail,col){
    const dx=tail.x-head.x,dy=tail.y-head.y;
    const cx1=head.x+dx*.25+dy*.35,cy1=head.y+dy*.25-dx*.35;
    const cx2=head.x+dx*.75-dy*.35,cy2=head.y+dy*.75+dx*.35;
    ctx.beginPath(); ctx.moveTo(head.x,head.y); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,tail.x,tail.y);
    ctx.strokeStyle='rgba(0,0,0,.2)'; ctx.lineWidth=7; ctx.lineCap='round'; ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(head.x,head.y); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,tail.x,tail.y);
    ctx.strokeStyle=col; ctx.lineWidth=4.5; ctx.globalAlpha=.82; ctx.stroke();
    ctx.beginPath(); ctx.arc(head.x,head.y,5.5,0,Math.PI*2); ctx.fillStyle=col; ctx.globalAlpha=.95; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.globalAlpha=1; ctx.fillStyle='#fff';
    [[head.x+2,head.y-2],[head.x-2,head.y-2]].forEach(([ex,ey])=>{
      ctx.beginPath(); ctx.arc(ex,ey,1.8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(ex,ey,.9,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff';
    });
  }

  // ── dice ──
  function showDice(v){
    const pat=DOTS[v]||DOTS[1], th=T[curTheme]||T.classic;
    for(let i=0;i<9;i++){const d=el(`sgd${i}`);if(d){d.className=`sg-dot${pat[i]?'':' off'}`;if(pat[i])d.style.background=th.dot;}}
  }
  function animDice(v){
    showDice(v);
    const dice=el('sg-dice'); if(!dice) return;
    dice.classList.remove('spin'); void dice.offsetWidth; dice.classList.add('spin');
    setTimeout(()=>dice.classList.remove('spin'),520);
  }

  // ── render tokens ──
  function renderTokens(players){
    panel.querySelectorAll('.sg-sqt').forEach(e=>e.innerHTML='');
    Object.values(players||{}).forEach(pl=>{
      if(!pl.pos||pl.pos<1||pl.pos>100) return;
      const box=el(`sgt${pl.pos}`); if(!box) return;
      const tok=document.createElement('div');
      tok.className=`sg-tok ${pl.color}`; tok.textContent=(pl.name||'?')[0].toUpperCase(); tok.title=pl.name;
      box.appendChild(tok);
    });
  }

  // ── render player cards ──
  function renderCards(players,turn){
    const wrap=el('sg-pcw'); if(!wrap) return;
    const th=T[curTheme]||T.classic;
    wrap.innerHTML='';
    Object.entries(players||{}).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([uid,pl])=>{
      const isTurn=uid===turn, isMe=uid===myUid;
      const card=document.createElement('div');
      card.className='sg-pc'; card.style.background=th.pan; card.style.borderColor=th.crd;
      if(isTurn) card.style.boxShadow=`0 0 0 2px ${th.acc}55,0 0 0 1px ${th.acc}`;
      card.innerHTML=`
        <div class="sg-pct" style="background:${CGRAD[pl.color]||'#999'}">${(pl.name||'?')[0].toUpperCase()}</div>
        <div class="sg-pci">
          <div class="sg-pcn">${pl.name}${isMe?' (You)':''}</div>
          <div class="sg-pcs">${pl.pos>0?`Sq ${pl.pos}`:'Start'}</div>
        </div>
        ${isTurn?`<div class="sg-badge" style="background:${th.acc}22;color:${th.acc};border:1px solid ${th.acc}44">TURN</div>`:''}
      `;
      wrap.appendChild(card);
    });
  }

  // ── log ──
  function addLog(html){
    const log=el('sg-log'); if(!log) return;
    const e=document.createElement('div'); e.className='sg-le'; e.innerHTML=html; log.prepend(e);
    while(log.children.length>20) log.removeChild(log.lastChild);
  }

  // ── render lobby ──
  function renderLobby(d){
    el('sg-lob').style.display='flex';
    el('sg-game')?.classList.remove('on');
    const th=T[curTheme]||T.classic;
    const players=d.players||{};
    const sorted=Object.entries(players).sort((a,b)=>(a[1].order||0)-(b[1].order||0));
    const grid=el('sg-lob-grid'); grid.innerHTML='';
    sorted.forEach(([uid,pl])=>{
      const isMe=uid===myUid, card=document.createElement('div');
      card.className='sg-lp'; card.style.background=th.pan; card.style.borderColor=th.crd;
      card.innerHTML=`
        <div class="sg-lpc" style="background:${CGRAD[pl.color]}">${(pl.name||'?')[0].toUpperCase()}</div>
        <div class="sg-lpn" style="color:${th.txt}">${pl.name}</div>
        ${isMe?`<div class="sg-lpy" style="color:${th.acc}">YOU</div>`:''}
      `;
      grid.appendChild(card);
    });
    for(let i=sorted.length;i<4;i++){
      const e=document.createElement('div'); e.className='sg-lp'; e.style.opacity='.35';
      e.innerHTML=`<div class="sg-lpc" style="background:#bbb;font-size:16px">?</div><div class="sg-lpn" style="color:${th.tx2}">Waiting…</div>`;
      grid.appendChild(e);
    }
    const cnt=sorted.length, isHost=d.createdBy===myUid, sb=el('sg-start');
    sb.disabled=!(isHost&&cnt>=2);
    sb.textContent=isHost?(cnt>=2?'▶ Start Game':`Need ${2-cnt} more`):'Waiting for host…';
    el('sg-lob-st').textContent=cnt<2?`${cnt}/4 joined — need 1 more`:isHost?`${cnt} players ready!`:`Waiting for host…`;
  }

  // ── render game ──
  function renderGame(d){
    el('sg-lob').style.display='none';
    el('sg-game')?.classList.add('on');
    renderTokens(d.players);
    renderCards(d.players,d.currentTurn);
    const isMyTurn=d.currentTurn===myUid, tp=d.players?.[d.currentTurn];
    el('sg-roll').disabled=!isMyTurn;
    el('sg-tmsg').textContent=isMyTurn?'🎲 Your turn — roll!':tp?`${tp.name}'s turn…`:'–';
    if(d.dice?.value&&d.dice.t>lastDT){lastDT=d.dice.t;animDice(d.dice.value);}
    else if(d.dice?.value) showDice(d.dice.value);
    if(d.lastMove&&d.lastMove.t>lastMT){
      lastMT=d.lastMove.t;
      const lm=d.lastMove,mp=d.players?.[lm.uid];
      let msg=`<b>${mp?.name}</b> rolled ${lm.dice}`;
      if(lm.bounced) msg+=` 🔄→${lm.to}`;
      else msg+=`→sq ${lm.to}`;
      if(lm.ladder) msg+=` 🪜→${lm.final}!`;
      if(lm.snake)  msg+=` 🐍→${lm.final}!`;
      addLog(msg);
    }
  }

  // ── render win ──
  function renderWin(d){
    renderGame(d);
    const w=d.players?.[d.winner],isMe=d.winner===myUid,win=el('sg-win');
    win.classList.add('on'); win.style.background=(T[curTheme]||T.classic).win;
    el('sg-we').textContent=isMe?'🏆':'🎊';
    el('sg-wt').textContent=isMe?'You Win! 🎉':`${w?.name||'?'} Wins!`;
    el('sg-ws').textContent=isMe?'Reached square 100!':'Better luck next time!';
    el('sg-pa').style.display=d.createdBy===myUid?'block':'none';
  }

  // ── roll dice ──
  function rollDice(){
    if(!gdata||gdata.currentTurn!==myUid||gdata.state!=='playing') return;
    const me=gdata.players?.[myUid]; if(!me) return;
    el('sg-roll').disabled=true;
    const val=Math.floor(Math.random()*6)+1, cur=me.pos||0;
    let raw=cur+val, bounced=false;
    if(raw>100){raw=200-raw;bounced=true;} if(raw<1) raw=1;
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
    lastMT=0; lastDT=0;
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

  function cleanup(){ if(unsub){unsub();unsub=null;} gdata=null; lastMT=0; lastDT=0; }

  async function joinGame(){
    const { CU } = getState();
    const name = CU?.displayName || 'Player';
    const snap=await dbGet(dbRef(db,`games/${CCI_g}`));
    const d=snap.val();
    if(!d){
      await dbSet(dbRef(db,`games/${CCI_g}`),{state:'lobby',createdBy:myUid,players:{[myUid]:{name,color:COLORS[0],pos:0,order:0}}});
    } else {
      if(!d.players?.[myUid]){
        const cnt=Object.keys(d.players||{}).length;
        if(cnt>=4){toastFn('Game is full!');return;}
        if(d.state!=='lobby'){toastFn('Game already in progress!');return;}
        await dbUpdate(dbRef(db,`games/${CCI_g}/players`),{[myUid]:{name,color:COLORS[cnt%COLORS.length],pos:0,order:cnt}});
      }
    }
    listenGame();
  }

  // ── create panel DOM ──
  function createPanel(){
    injectCSS();
    panel=document.createElement('div');
    panel.id='sg-panel';
    panel.style.cssText='position:fixed;top:52px;left:50%;transform:translateX(-50%);width:710px;z-index:8500;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.6);display:flex;flex-direction:column;font-family:system-ui,sans-serif';
    panel.innerHTML=`
      <div id="sg-hdr">
        <div id="sg-ttl">🐍 Snake &amp; Ladders 🪜</div>
        <div style="display:flex;gap:4px;align-items:center">
          <div class="sg-th on" id="sg-tc" data-t="classic" style="background:linear-gradient(135deg,#9dcc96,#f5ead0)" title="Classic"></div>
          <div class="sg-th"    id="sg-th2" data-t="heaven"  style="background:linear-gradient(135deg,#ffd700,#e3f4ff)" title="Heaven"></div>
          <div class="sg-th"    id="sg-tl"  data-t="love"    style="background:linear-gradient(135deg,#e91e63,#fce4ec)" title="Love"></div>
          <div class="sg-th"    id="sg-tn"  data-t="neon"    style="background:linear-gradient(135deg,#6c63ff,#43e97b)" title="Neon"></div>
        </div>
        <button id="sg-x">✕</button>
      </div>
      <div id="sg-body">
        <div id="sg-lob">
          <div id="sg-lob-ttl">🎲 Snake &amp; Ladders</div>
          <div id="sg-lob-grid"></div>
          <div id="sg-lob-st">Waiting…</div>
          <div style="display:flex;gap:8px">
            <button class="sg-btn" id="sg-start" disabled>Start Game</button>
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
          <div id="sg-ws">Reached square 100!</div>
          <button id="sg-pa">🔄 Play Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Event listeners (no onclick attributes needed)
    el('sg-x').addEventListener('click',()=>{panel.style.display='none';cleanup();});
    el('sg-start').addEventListener('click',startGame);
    el('sg-leave').addEventListener('click',leaveGame);
    el('sg-dice').addEventListener('click',rollDice);
    el('sg-roll').addEventListener('click',rollDice);
    el('sg-pa').addEventListener('click',playAgain);
    panel.querySelectorAll('.sg-th').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.t)));

    // Drag
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
    setTimeout(drawSL,50);
  }

  // ── openGame (toggle) ──
  window.openGame = () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    if (!panel) createPanel();

    if (panel.style.display !== 'none' && panel.style.display !== '') {
      panel.style.display = 'none'; cleanup(); return;
    }
    myUid  = CU?.uid;
    CCI_g  = CCI;
    panel.style.display = 'flex';
    panel.style.left = '50%'; panel.style.top = '52px'; panel.style.transform = 'translateX(-50%)';
    el('sg-win')?.classList.remove('on');
    const log=el('sg-log'); if(log) log.innerHTML='';
    lastMT=0; lastDT=0;
    joinGame();
  };
}
