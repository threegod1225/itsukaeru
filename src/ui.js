(function(){
const PER = DATA.meta.perDot;
const LW = 100, LH = 159, RATE = 6;
const cv = document.getElementById('map'), ctx = cv.getContext('2d');
const stage = document.getElementById('stage');
const $ = id => document.getElementById(id);
let C = {};
function readColors(){const cs=getComputedStyle(document.documentElement);
  ['bg','tokyo','river','road','ink','muted','c0','c1','c2','stuck','panel','jam','wait'].forEach(k=>C[k]=cs.getPropertyValue('--'+k).trim());}
readColors(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change',readColors);

let SC='east', W, N, base, ref, refInfo, shelters=new Set(), seedR=1, forgotSince={};
const SCN={east:{name:'東日本大震災（2011年）の電車の動き'},shuto:{name:'首都直下地震（想定）'}};
let hinted={}, sim, policy, speed=1, paused=true, acc=0, phase='intro', hintUntil=0, flashes=[], anims={}, reach={}, homeTotal={}, prevIwatsuki=null;
const allGo=()=>allPol(W,'go');
const refCache={};
let resultQueued=false,STG=null,showMarks=false,actLog=[],WE=null;
function setWorld(sc,stg){SC=sc;STG=stg||null;seedR=sc==='shuto'?((Math.random()*1e9)|0):1;
  if(STG){W=buildWorld(subsetData(DATA,STAGES[STG]),'east',1);W.startT=tmin(...STAGES[STG].start);}else{W=buildWorld(DATA,sc,seedR);W.startT=0;}N=W.N;
  const key=(STG||sc)+':'+seedR;if(!refCache[key])refCache[key]=computeRef(W);refInfo=refCache[key];base=refInfo.base;ref=refInfo.ref;
  }
function computeBase(){}
function computeReach(){W.homes.forEach(m=>{reach[m]=W.hubs.filter(h=>sim.railRoute(h,m)).length;});}
function newSim(){sim=createSim(W,42,{shelters:W.hubs,startT:W.startT||0});homeTotal={};W.homes.forEach(m=>homeTotal[m]=0);sim.S.dots.forEach(d=>homeTotal[d.home]++);computeReach();updateHUD();}
function reset(){resultQueued=false;showMarks=false;actLog=[];$('bBack').hidden=true;hinted={};forgotSince={};shelters=new Set();newSim();policy=STG?allPol(W,'wait'):allGo();acc=0;flashes=[];anims={};clearTimeout(msgTimer);$('toasts').innerHTML='';
  homeTotal={};W.homes.forEach(m=>homeTotal[m]=0);sim.S.dots.forEach(d=>homeTotal[d.home]++);computeReach();updateHUD();}

// layout
let sc=1,ox=0,oy=0,dpr=1;
function resize(){const r=stage.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=r.width*dpr;cv.height=r.height*dpr;sc=Math.min(r.width/LW,r.height/LH);ox=(r.width-LW*sc)/2;oy=(r.height-LH*sc)/2;}
new ResizeObserver(resize).observe(stage);resize();
const X=x=>ox+x*sc, Y=y=>oy+y*sc;
function edgePoint(eid,u,jit){const e=W.edges[eid],A=N[e.a],B=N[e.b];const t=u/e.km;const dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy);
  return [A.x+dx*t-dy/L*jit,A.y+dy*t+dx/L*jit];}
function segOff(a,b,off){const A=N[a],B=N[b];const dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy);const nx=-dy/L*off,ny=dx/L*off;return [A.x+nx,A.y+ny,B.x+nx,B.y+ny];}
const railSeg=re=>segOff(re.a,re.b,W.D.rails[re.line].off);
function railPoint(leg,t){const re=W.railEdges.find(r=>r.line===leg.line&&((r.a===leg.from&&r.b===leg.to)||(r.b===leg.from&&r.a===leg.to)));
  const [ax,ay,bx,by]=railSeg(re);if(re.a!==leg.from)t=1-t;return [ax+(bx-ax)*t,ay+(by-ay)*t];}
const RIVER=DATA.river;
function line(pts,w,col,dash){ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));
  ctx.lineWidth=w*sc;ctx.strokeStyle=col;ctx.setLineDash(dash?dash.map(v=>v*sc):[]);ctx.stroke();ctx.setLineDash([]);}
function mix(a,b,t){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);return `rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`;}
const clsCol=c=>[C.c0,C.c1,C.c2][c];
function label(t,x,y,size=3.3,col=C.ink){ctx.font=`700 ${size*sc}px "Zen Maru Gothic",sans-serif`;ctx.textAlign='center';ctx.lineJoin='round';
  ctx.lineWidth=1.1*sc;ctx.strokeStyle=C.bg;ctx.strokeText(t,X(x),Y(y));ctx.fillStyle=col;ctx.fillText(t,X(x),Y(y));}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function train(x,y,col,s){const w=4.2*s*sc,h=2.4*s*sc;ctx.fillStyle=col;roundRect(X(x)-w/2,Y(y)-h/2,w,h,0.9*s*sc);ctx.fill();
  ctx.lineWidth=0.35*sc;ctx.strokeStyle=C.ink;ctx.stroke();ctx.fillStyle='#fff';
  for(let i=-1;i<=1;i++)ctx.fillRect(X(x)+i*1.25*s*sc-0.45*s*sc,Y(y)-0.65*s*sc,0.9*s*sc,0.7*s*sc);}
function lineSegs(li){return W.railEdges.filter(r=>r.line===li).map(railSeg);}

function drawRails(now){const S=sim.S;ctx.lineCap='butt';
  W.D.rails.forEach((r,li)=>{const segs=lineSegs(li);const on=S.running[li];const col=r.color;
    if(!on){ctx.globalAlpha=r.urban?0.3:0.45;segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],r.urban?0.6:0.9,col,[1.4,1.2]));ctx.globalAlpha=1;return;}
    if(S.t<S.susp[li]){const blink=0.25+0.2*Math.sin(now/220);ctx.globalAlpha=blink;segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],3.2,C.jam));
      ctx.globalAlpha=0.8;segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],1.1,col,[1.4,1.2]));ctx.globalAlpha=1;return;}
    const age=anims[li]!=null?now-anims[li]:9e9;
    if(age<2600){const f=Math.min(1,age/1500);const lens=segs.map(([ax,ay,bx,by])=>Math.hypot(bx-ax,by-ay));const tot=lens.reduce((a,b)=>a+b,0);
      ctx.globalAlpha=0.28*(1-age/2600);segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],4.2,col));ctx.globalAlpha=0.45;
      segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],0.9,col,[1.4,1.2]));ctx.globalAlpha=1;
      let rem=f*tot,front=null;segs.forEach(([ax,ay,bx,by],i)=>{if(rem<=0)return;const t=Math.min(1,rem/lens[i]);
        line([[ax,ay],[ax+(bx-ax)*t,ay+(by-ay)*t]],1.5,col);front=[ax+(bx-ax)*t,ay+(by-ay)*t];rem-=lens[i];});
      if(front&&f<1)train(front[0],front[1],col,1.15);}
    else segs.forEach(([ax,ay,bx,by])=>line([[ax,ay],[bx,by]],r.urban?0.9:1.4,col));});
  ctx.lineCap='round';}

function draw(now){drawCore(now);if(showMarks)drawMarks();}
function drawCore(now){
  const S=sim.S;ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle=C.tokyo;ctx.beginPath();ctx.moveTo(X(-2),Y(LH+4));RIVER.forEach(([x,y])=>ctx.lineTo(X(x),Y(y)));ctx.lineTo(X(102),Y(LH+4));ctx.fill();
  line(RIVER,5,C.river);
  ctx.fillStyle=C.muted;ctx.font=`500 ${2.8*sc}px "Zen Maru Gothic",sans-serif`;ctx.textAlign='left';
  ctx.fillText('荒川',X(2),Y(100));ctx.fillText('東京',X(2),Y(115));ctx.fillText('埼玉',X(2),Y(95));
  ctx.lineCap='round';
  W.edges.forEach(e=>line([[N[e.a].x,N[e.a].y],[N[e.b].x,N[e.b].y]],e.name==='ent'?2.2:3.4,C.road));
  W.edges.forEach((e,ei)=>{const A=N[e.a],B=N[e.b];for(let c=0;c<e.cells;c++){const k=S.dens[ei][c]/CFG.CELL/CFG.KJ;if(k<0.12)continue;
    const t0=c/e.cells,t1=(c+1)/e.cells;line([[A.x+(B.x-A.x)*t0,A.y+(B.y-A.y)*t0],[A.x+(B.x-A.x)*t1,A.y+(B.y-A.y)*t1]],(e.name==='ent'?2.2:3.4)+Math.min(1,k)*2.2,mix(C.road,C.jam,Math.min(1,(k-0.12)/0.5)));}});
  drawRails(now);
  W.hubs.forEach(h=>{const n=N[h];const w=14,hh=11;ctx.fillStyle=C.panel;ctx.strokeStyle=C.ink;ctx.lineWidth=0.5*sc;
    roundRect(X(n.x-w/2),Y(n.y-hh/2),w*sc,hh*sc,1.2*sc);ctx.fill();ctx.stroke();
    // 箱の中：電車で帰れる人は黒い四角で上側に、電車で帰れない人は距離の色で下側に
    const list=[];let railWait=0;W.homes.forEach(m=>{const rp=sim.railRoute(h,m);const lc=rp?C.ink:null;
      S.waiting[h][m].forEach(d=>{list.push([lc?0:1,d.homeless?1:0,lc||clsCol(d.cls),lc?1:0]);if(lc)railWait++;});S.forced[h][m].forEach(d=>list.push([2,1,clsCol(d.cls),0]));});
    list.sort((a,b)=>a[0]-b[0]||(a[2]<b[2]?-1:a[2]>b[2]?1:0)||a[1]-b[1]);
    list.slice(0,252).forEach(([g,hl,col,isRail],i)=>{const cx=n.x-w/2+0.95+(i%18)*0.71,cy=n.y-hh/2+0.95+Math.floor(i/18)*0.69;
      ctx.beginPath();if(isRail){ctx.rect(X(cx-0.29),Y(cy-0.29),0.58*sc,0.58*sc);}else ctx.arc(X(cx),Y(cy),(hl?0.24:0.29)*sc,0,7);
      if(hl&&!isRail){ctx.lineWidth=0.18*sc;ctx.strokeStyle=col;ctx.stroke();}else{ctx.fillStyle=col;ctx.fill();}});
    // 帰し忘れの目印：電車で帰れる人が待っているのに🚃が「待つ」
    const forgot=railWait>0&&!(policy[h]&&policy[h].r==='go');
    if(forgot){const k=0.5+0.5*Math.sin(now/260);ctx.globalAlpha=0.55+0.45*k;ctx.lineWidth=1.1*sc;ctx.strokeStyle=C.c1;roundRect(X(n.x-w/2-1),Y(n.y-hh/2-1),(w+2)*sc,(hh+2)*sc,1.8*sc);ctx.stroke();ctx.globalAlpha=1;
      if(!forgotSince[h])forgotSince[h]=S.t;
      if(phase==='run'&&S.t-forgotSince[h]>=90&&!hinted['forgot'+h]){hinted['forgot'+h]=true;simpleToast(`🚃 ${n.name}駅に、電車で帰れる人が待っています`);}}
    else forgotSince[h]=0;
    if(true){const bx=n.x-w/2-0.6,by=n.y-hh/2-0.6;ctx.beginPath();ctx.arc(X(bx),Y(by),2.6*sc,0,7);ctx.fillStyle=C.panel;ctx.fill();ctx.lineWidth=0.6*sc;ctx.strokeStyle=C.ink;ctx.stroke();
      ctx.font=`${3*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⛺',X(bx),Y(by)+0.1*sc);ctx.textBaseline='alphabetic';}
    // 駅のホームの混み具合
    const q=S.queue[h].length/S.stationMax[h],qa=(S.queue[h].length+S.approach[h].length)/S.stationMax[h];const jammed=S.t<S.hubSusp[h];
    if(qa>0||jammed){const gx=n.x-w/2,gy=n.y-hh/2-3.2,gw=w,gh=2;ctx.fillStyle=C.panel;roundRect(X(gx),Y(gy),gw*sc,gh*sc,1*sc);ctx.fill();
      ctx.globalAlpha=0.3;ctx.fillStyle=C.ink;roundRect(X(gx),Y(gy),Math.max(gh,Math.min(1,qa)*gw)*sc,gh*sc,1*sc);ctx.fill();ctx.globalAlpha=1;
      if(q>0){ctx.fillStyle=q>0.7||jammed?C.jam:C.ink;roundRect(X(gx),Y(gy),Math.max(gh,Math.min(1,q)*gw)*sc,gh*sc,1*sc);ctx.fill();}
      ctx.lineWidth=0.4*sc;ctx.strokeStyle=C.ink;roundRect(X(gx),Y(gy),gw*sc,gh*sc,1*sc);ctx.stroke();}
    if(jammed){ctx.globalAlpha=0.5+0.5*Math.sin(now/200);ctx.lineWidth=1.2*sc;ctx.strokeStyle=C.jam;roundRect(X(n.x-w/2-0.8),Y(n.y-hh/2-0.8),(w+1.6)*sc,(hh+1.6)*sc,1.6*sc);ctx.stroke();ctx.globalAlpha=1;}
    if(q>0.6&&!hinted.crowd){hinted.crowd=true;simpleToast('🚉 駅が混んできた。あふれると電車が止まる');}
    label(n.name,n.x,n.y+hh/2+4);
    // ランプ：左が電車、右の3つが歩き（色ごと）。点灯＝帰している
    {const ly=n.y+hh/2+7.6;const p_=policy[h]||{};
     const ron=p_.r==='go';ctx.beginPath();roundRect(X(n.x-7.2),Y(ly-1.5),4.6*sc,3*sc,1*sc);ctx.fillStyle=ron?C.ink:C.panel;ctx.fill();ctx.lineWidth=0.45*sc;ctx.strokeStyle=ron?C.ink:C.stuck;ctx.stroke();
     ctx.font=`${2.1*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🚃',X(n.x-4.9),Y(ly+0.1));
     [0,1,2].forEach(c=>{const lx=n.x-0.2+c*3.4;ctx.beginPath();ctx.arc(X(lx),Y(ly),1.35*sc,0,7);const on=p_[c]==='go';
       ctx.fillStyle=on?clsCol(c):C.panel;ctx.fill();ctx.lineWidth=0.45*sc;ctx.strokeStyle=on?C.ink:C.stuck;ctx.stroke();});}
    if(phase==='setup'&&now<hintUntil){const k=(now%1200)/1200;ctx.beginPath();roundRect(X(n.x-w/2-1-k*2),Y(n.y-hh/2-1-k*2),(w+2+k*4)*sc,(hh+2+k*4)*sc,2*sc);ctx.globalAlpha=1-k;ctx.lineWidth=0.6*sc;ctx.strokeStyle=C.ink;ctx.stroke();ctx.globalAlpha=1;}
    if(popHub===h){ctx.lineWidth=1*sc;ctx.strokeStyle=C.c0;roundRect(X(n.x-w/2-1),Y(n.y-hh/2-1),(w+2)*sc,(hh+2)*sc,1.8*sc);ctx.stroke();}});
  Object.values(N).filter(n=>n.type==='via').forEach(n=>{ctx.beginPath();ctx.arc(X(n.x),Y(n.y),1.6*sc,0,7);ctx.fillStyle=C.panel;ctx.fill();ctx.lineWidth=0.6*sc;ctx.strokeStyle=C.ink;ctx.stroke();label(n.name,n.x-6,n.y+1.2,2.8,C.muted);});
  (()=>{})();
  for(const d of S.dots){
    if(d.mode==='walk'||d.mode==='stuck'){const s=d.path[d.pi];const e=W.edges[s.e];let u=s.dir>0?d.p:e.km-d.p;
      u=Math.max(0,Math.min(e.km,u+((d.id*7919)%100/100-0.5)*0.9));const [x,y]=edgePoint(s.e,u,d.jit*2.6);
      ctx.beginPath();ctx.arc(X(x),Y(y),(d.mode==='stuck'?0.85:0.75)*sc,0,7);
      if(d.mode==='stuck'){ctx.fillStyle=C.stuck;ctx.fill();ctx.lineWidth=0.35*sc;ctx.strokeStyle=C.ink;ctx.stroke();}
      else{ctx.fillStyle=clsCol(d.cls);ctx.fill();}}
    else if(d.mode==='rail'){let r=d.rp,i=0;while(i<d.legs.length-1&&r>d.legs[i].km){r-=d.legs[i].km;i++;}
      const [x,y]=railPoint(d.legs[i],Math.min(1,r/d.legs[i].km));ctx.beginPath();ctx.arc(X(x),Y(y),0.9*sc,0,7);
      ctx.fillStyle=clsCol(d.cls);ctx.fill();ctx.lineWidth=0.4*sc;ctx.strokeStyle=C.panel;ctx.stroke();}}
  for(const a of S.amb){if(a.done)continue;const s=a.path[a.pi];const e=W.edges[s.e];const u=s.dir>0?a.p:e.km-a.p;const [x,y]=edgePoint(s.e,u,0);
    const w=3.6*sc,h=2.6*sc;ctx.fillStyle='#FFFFFF';ctx.strokeStyle=C.ink;ctx.lineWidth=0.4*sc;roundRect(X(x)-w/2,Y(y)-h/2,w,h,0.6*sc);ctx.fill();ctx.stroke();
    ctx.fillStyle='#D33';ctx.fillRect(X(x)-0.3*sc,Y(y)-0.9*sc,0.6*sc,1.8*sc);ctx.fillRect(X(x)-0.9*sc,Y(y)-0.3*sc,1.8*sc,0.6*sc);}
  W.homes.forEach(m=>{const n=N[m];const r=5.2;const go=true;
    const pulse=now<hintUntil?(1+0.12*Math.sin(now/180)):1;
    ctx.beginPath();ctx.arc(X(n.x),Y(n.y),r*sc,0,7);ctx.fillStyle=C.panel;ctx.fill();ctx.lineWidth=0.6*sc;ctx.strokeStyle=C.ink;ctx.stroke();
    const arr=S.dots.reduce((s,d)=>s+(d.home===m&&d.mode==='home'?1:0),0);const fr=arr/homeTotal[m];
    if(fr>0){ctx.beginPath();ctx.arc(X(n.x),Y(n.y),(r+1.1)*sc,-Math.PI/2,-Math.PI/2+fr*Math.PI*2);ctx.lineWidth=1.1*sc;ctx.strokeStyle=C.ink;ctx.stroke();}
    const cx=X(n.x),cy=Y(n.y);
    if(go){const s=sc*1.6;ctx.fillStyle=C.ink;ctx.beginPath();ctx.moveTo(cx-1.6*s,cy-0.1*s);ctx.lineTo(cx,cy-1.6*s);ctx.lineTo(cx+1.6*s,cy-0.1*s);
      ctx.lineTo(cx+1.1*s,cy-0.1*s);ctx.lineTo(cx+1.1*s,cy+1.3*s);ctx.lineTo(cx-1.1*s,cy+1.3*s);ctx.lineTo(cx-1.1*s,cy-0.1*s);ctx.closePath();ctx.fill();}
    else{ctx.fillStyle=C.panel;ctx.fillRect(X(n.x-1.7),Y(n.y-2.2),1.2*sc,4.4*sc);ctx.fillRect(X(n.x+0.5),Y(n.y-2.2),1.2*sc,4.4*sc);}
    // 電車で帰れるマーク：全部の駅から＝塗り、一部の駅から＝白抜き
    const k=reach[m]||0;if(k>0){const bx=n.x+4.4,by=n.y-4.4;const full=k===W.hubs.length;
      ctx.globalAlpha=full?1:0.75;ctx.beginPath();ctx.arc(X(bx),Y(by),2.7*sc,0,7);ctx.fillStyle=C.panel;ctx.fill();
      ctx.lineWidth=(full?0.8:0.5)*sc;ctx.strokeStyle=C.ink;ctx.setLineDash(full?[]:[0.8*sc,0.6*sc]);ctx.stroke();ctx.setLineDash([]);
      ctx.font=`${3.1*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=C.ink;ctx.fillText('🚃',X(bx),Y(by)+0.15*sc);
      ctx.textBaseline='alphabetic';ctx.globalAlpha=1;}
    label(n.name,n.x,n.y+r+4.6);});
  flashes=flashes.filter(f=>now-f.t<(f.long?1400:450));flashes.forEach(f=>{const n=N[f.m];const dur=f.long?1400:450;const k=(now-f.t)/dur;
    ctx.beginPath();ctx.arc(X(n.x),Y(n.y),(5.2+k*(f.long?8:5))*sc,0,7);ctx.globalAlpha=1-k;ctx.lineWidth=(f.long?1.2:0.6)*sc;ctx.strokeStyle=f.col||C.ink;ctx.stroke();ctx.globalAlpha=1;});
}

// HUD
const fmtClock=t=>{const a=t+T0;const d=Math.floor(a/1440)+1;const m=a%1440;return [d,`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`];};
const fmtWhen=t=>{const [d,c]=fmtClock(t);return (d===1?'当日 ':d===2?'翌日 ':`${d}日目 `)+c;};
const fmtPeople=n=>{const p=n*PER;return p>=10000?`${(p/10000).toFixed(p>=100000?0:1)}万人`:`${p.toLocaleString()}人`;};
const fmtMin=m=>{m=Math.round(m);return m>=60?`${Math.floor(m/60)}時間${m%60?m%60+'分':''}`:`${m}分`;};
function liveAmb(){const S=sim.S;let x=S.stats.ambDelay;if(!S.done)for(const a of S.amb)if(!a.done){let done=0;for(let i=0;i<a.pi;i++)done+=W.edges[a.path[i].e].km;done+=a.p;x+=Math.max(0,(S.t-a.t0)-done/CFG.AMB_V);}return x;}
function updateHUD(){const S=sim.S;const [d,c]=fmtClock(S.t);
  $('day').textContent=`${d}日目・${STG?STAGES[STG].short:(SC==='east'?'3.11の電車の動き':'首都直下地震（想定）')}`;$('clock').textContent=c;
  $('sHome').textContent=`${Math.round(S.stats.home/S.dots.length*100)}%`;
  $('sStuck').textContent=fmtPeople(S.stats.stuckNow);$('sAmb').textContent=fmtMin(liveAmb());}

const msgQ=[];let msgBusy=false;let msgTimer=null;
function pushMsg(el,ms){const band=$('toasts');band.innerHTML='';if(sim){const tm=document.createElement('em');tm.className='tm';tm.textContent=fmtClock(sim.S.t).join('日目 ');el.prepend(tm);}band.appendChild(el);clearTimeout(msgTimer);
  msgTimer=setTimeout(()=>{el.classList.add('out');},(ms||3800));}
function simpleToast(msg,cls){const el=document.createElement('div');el.className='toast '+(cls||'');el.textContent=msg;pushMsg(el);}
function jamToast(h,gaveUp){const el=document.createElement('div');el.className='toast rail jam';el.style.setProperty('--lc',C.jam);
  el.innerHTML=`<b>⚠ ${N[h].name}駅に人があふれた</b><span class="route">20分間 入場規制${gaveUp?`・あきらめて歩き出した人 ${fmtPeople(gaveUp)}`:''}</span>`;pushMsg(el,4200);}
function railToastMulti(lines){const toHome=lines.filter(li=>!W.D.rails[li].urban),city=lines.filter(li=>W.D.rails[li].urban);
  if(!toHome.length){return simpleToast(`🚇 ${city.map(li=>W.D.rails[li].name).join('・')}が動いた（都内の乗り継ぎに使える）`);}
  lines=toHome;if(lines.length===1)return railToast(lines[0]);
  const el=document.createElement('div');el.className='toast rail';el.style.setProperty('--lc',W.D.rails[lines[0]].color);
  const towns=[...new Set(lines.flatMap(li=>W.D.rails[li].stops.filter(s=>N[s].type==='home').map(s=>N[s].name)))];
  el.innerHTML=`<b>🚃 電車が${lines.length}路線で動いた</b><span class="route">${towns.join('・')}へ</span>`;pushMsg(el,3800);}
function railToast(li,again){const r=W.D.rails[li];const names=r.stops.map(s=>N[s].name);
  const el=document.createElement('div');el.className='toast rail';el.style.setProperty('--lc',r.color);
  el.innerHTML=`<b>🚃 ${again?'また動きだした':'電車が動いた'}</b><span class="route">${names.join('<i>→</i>')}</span>`;
  pushMsg(el,3800);}

// input：駅（滞在先）をタップ → 距離の色ごとに「帰す／待たせる」
let popHub=null;
const CLS_LABEL=['歩けるかも','きびしい','歩けない'];
const canToggle=()=>phase==='setup'||phase==='run';
function updateSetupText(){}
function setCls(h,c,v){policy[h][c]=v;if(phase==='setup')allWaitLabel();if(phase==='run')actLog.push({t:sim.S.t,txt:`あなた：${N[h].name}駅の${c==='r'?'🚃電車で帰す':['青','橙','赤'][c]+'の歩いて帰す'}を「${v==='go'?'帰す':'待つ'}」に`});flashes.push({m:h,t:performance.now()});renderPop();}
let pausedByPop=false;
function openPop(h){if(phase==='run'&&!paused){setPaused(true);pausedByPop=true;}popHub=h;renderPop();}
function closePop(){popHub=null;renderPop();if(pausedByPop&&phase==='run'){setPaused(false);}pausedByPop=false;}
function renderPop(){const pop=$('pop');if(!popHub){pop.hidden=true;document.body.classList.remove('popopen');return;}const h=popHub,n=N[h];
  let rail=0;const cnt=[0,0,0];W.homes.forEach(m=>{const k=sim.S.waiting[h][m].length;if(!k)return;if(sim.railRoute(h,m))rail+=k;else cnt[cls(W.walk[h][m].km)]+=k;});
  const p_=policy[h];const btn=(key,on,ico,lab,num)=>`<button class="pb ${on?'on':''}" data-k="${key}" aria-pressed="${on}">${ico}<span>${lab}</span><small>${num}</small><b>${on?'帰す':'待つ'}</b></button>`;
  const q=Math.min(1,sim.S.queue[h].length/sim.S.stationMax[h]);let html=`<div class="ph"><b>${n.name}駅周辺</b><span class="pg" title="駅の混み具合"><i style="width:${Math.round(q*100)}%;background:${q>0.75?C.jam:(q>0.4?C.c1:C.c0)}"></i></span><span class="pgt">混雑目安 ${Math.round(q*100)}%</span>${phase==='run'?'<span class="pz">⏸ 停止中</span>':''}<button class="px">閉じる</button></div>`;
  html+=`<div class="pgrid">${btn('r',p_.r==='go','<i class="tr">🚃</i>','電車で帰す',rail?fmtPeople(rail):'今は0人')}`;
  const KM=['家まで10km未満','10〜20km','20km超'];[0,1,2].forEach(c=>html+=btn(c,p_[c]==='go',`<i class="dot d${c}"></i>`,`歩いて帰す<br><em>${KM[c]}</em>`,fmtPeople(cnt[c])));
  const hlAll=sim.S.dots.filter(d=>d.homeless&&d.hub===h).length,hlIn=sim.S.dots.filter(d=>d.homeless&&d.hub===h&&d.sheltered).length;
  html+=`</div><p class="pnote">箱＝この地域の職場などで待つ人。ゲージ＝駅へ向かう・乗車を待つ人（ゲーム上の混雑目安）。<br>🚃は、家まで電車が通じている人だけ。歩くのは、電車で帰れない人のうち選んだ色の人だけ。<br>⛺ 一時滞在施設${sim.S.t<CFG.SHELTER_OPEN?'（約6時間後に開設）':''}：待つ場所のない${fmtPeople(hlAll)}のうち${fmtPeople(hlIn)}が入れる${hlAll>hlIn?`（${fmtPeople(hlAll-hlIn)}は入れず歩き出す）`:''}</p><div class="prow"><button class="pa" data-all="wait">全部待たせる</button>`;

  html+='</div>';pop.innerHTML=html;pop.hidden=false;document.body.classList.add('popopen');}
$('pop').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b||!popHub)return;
  if(b.classList.contains('px')){closePop();return;}
  if(b.dataset.k!=null){const k=b.dataset.k==='r'?'r':+b.dataset.k;setCls(popHub,k,policy[popHub][k]==='go'?'wait':'go');return;}
  if(b.dataset.all){['r',0,1,2].forEach(c=>policy[popHub][c]=b.dataset.all);if(phase==='run')actLog.push({t:sim.S.t,txt:`あなた：${N[popHub].name}駅を全部「待つ」に`});flashes.push({m:popHub,t:performance.now()});renderPop();return;}
});
// フリック操作：駅に触れて、行きたい方向へ指をすべらせて離す。触れてすぐ離すと、くわしいパネルが開く
// 指で隠れないよう、選択肢は指の上に横一列で出す（左から 全部待つ・電車・青・橙・赤）。指をすべらせて選び、離すと決定
const FLICK=[{k:'all',ico:'✋',lab:'全部待つ'},{k:'r',ico:'🚃',lab:'電車'},{k:0,ico:'<i class="dot d0"></i>',lab:'青 歩く'},{k:1,ico:'<i class="dot d1"></i>',lab:'橙 歩く'},{k:2,ico:'<i class="dot d2"></i>',lab:'赤 歩く'}];
const FW=62,FUP=92;let fl=null,flPos=[];const fx=$('flick');
function flickRender(sel){const h=fl.h,p_=policy[h];
  let html=`<div class="fc" style="left:${fl.px}px;top:${fl.py}px"></div>`;
  FLICK.forEach((f,i)=>{const on=f.k==='all'?false:p_[f.k]==='go';const [x,y]=flPos[i];
    html+=`<div class="fp ${on?'on':''} ${sel===i?'sel':''}" style="left:${x}px;top:${y}px">${f.ico}<span>${f.lab}</span><em>${f.k==='all'?'':on?'帰す':'待つ'}</em></div>`;});
  html+=`<div class="fn" style="left:${flPos[2][0]}px;top:${flPos[2][1]-48}px">${N[h].name}駅：上へすべらせて選ぶ</div>`;
  fx.innerHTML=html;}
function flickSel(px,py){let best=-1,bd=40;flPos.forEach(([x,y],i)=>{const d=Math.hypot(px-x,py-y);if(d<bd){bd=d;best=i;}});
  // 列の高さまで指を上げたら、横の位置で最も近いものを選ぶ
  if(best<0&&py<flPos[0][1]+30){let bx=999;flPos.forEach(([x],i)=>{const d=Math.abs(px-x);if(d<bx){bx=d;best=i;}});}
  return best;}
function flickToast(h,txt){const r=stage.getBoundingClientRect();const el=document.createElement('div');el.className='fltoast';el.textContent=txt;
  el.style.left=X(N[h].x)+'px';el.style.top=Y(N[h].y-9)+'px';stage.appendChild(el);setTimeout(()=>el.remove(),1100);}
cv.addEventListener('pointerdown',ev=>{if(!canToggle())return;const r=cv.getBoundingClientRect();const x=(ev.clientX-r.left-ox)/sc,y=(ev.clientY-r.top-oy)/sc;
  const hb=W.hubs.find(h=>Math.abs(N[h].x-x)<9.5&&y>N[h].y-9&&y<N[h].y+13);
  if(!hb){closePop();return;}
  if(popHub){closePop();}
  fl={h:hb,x0:ev.clientX,y0:ev.clientY,sel:-1,id:ev.pointerId};try{cv.setPointerCapture(ev.pointerId);}catch(e){}
  const sr=stage.getBoundingClientRect();const px=ev.clientX-sr.left,py=ev.clientY-sr.top;
  const half=FW*2;const cx=Math.max(half+FW/2+4,Math.min(sr.width-half-FW/2-4,px));const ry=Math.max(70,py-FUP);
  flPos=FLICK.map((f,i)=>[cx+(i-2)*FW,ry]);fl.px=px;fl.py=py;
  fx.style.left='0px';fx.style.top='0px';flickRender(-1);fx.hidden=false;ev.preventDefault();});
cv.addEventListener('pointermove',ev=>{if(!fl||ev.pointerId!==fl.id)return;const sr=stage.getBoundingClientRect();const s=Math.hypot(ev.clientX-fl.x0,ev.clientY-fl.y0)<18?-1:flickSel(ev.clientX-sr.left,ev.clientY-sr.top);if(s!==fl.sel){fl.sel=s;flickRender(s);}});
function flickEnd(ev,cancel){if(!fl)return;const f=fl;fl=null;fx.hidden=true;if(cancel)return;const moved=Math.hypot(ev.clientX-f.x0,ev.clientY-f.y0);
  if(f.sel<0){if(moved<14)openPop(f.h);return;}
  const it=FLICK[f.sel];const h=f.h;
  if(it.k==='all'){['r',0,1,2].forEach(c=>policy[h][c]='wait');if(phase==='run')actLog.push({t:sim.S.t,txt:`あなた：${N[h].name}駅を全部「待つ」に`});flashes.push({m:h,t:performance.now()});flickToast(h,'✋ 全部待つ');}
  else{const v=policy[h][it.k]==='go'?'wait':'go';setCls(h,it.k,v);flickToast(h,`${it.k==='r'?'🚃 電車':['青','橙','赤'][it.k]+' 歩く'}：${v==='go'?'帰す':'待つ'}`);}}
cv.addEventListener('pointerup',ev=>flickEnd(ev,false));cv.addEventListener('pointercancel',ev=>flickEnd(ev,true));
function allWaitLabel(){const allW=W.hubs.every(h=>['r',0,1,2].every(c=>policy[h][c]==='wait'));$('bAllWait').innerHTML=allW?'全部の駅を<b>【帰す】</b>に':'全部の駅を<b>【待つ】</b>に';}
$('bAllWait').onclick=()=>{const allW=W.hubs.every(h=>['r',0,1,2].every(c=>policy[h][c]==='wait'));policy=allPol(W,allW?'go':'wait');renderPop();allWaitLabel();W.hubs.forEach(h=>flashes.push({m:h,t:performance.now()}));};
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){closePop();}
  if(ev.key===' '&&phase==='run'){ev.preventDefault();setPaused(!paused);}});

const bPlay=$('bPlay'),bSpeed=$('bSpeed');
function setPaused(p){paused=p;bPlay.dataset.state=p?'paused':'playing';bPlay.setAttribute('aria-label',p?'再生':'一時停止');}
bPlay.onclick=()=>{if(phase!=='run')return;if(popHub){popHub=null;renderPop();pausedByPop=false;}setPaused(!paused);};
bSpeed.onclick=()=>{const seq=SC==='shuto'?[1,3,10,30]:[1,3,10];speed=seq[(seq.indexOf(speed)+1)%seq.length];bSpeed.textContent=`×${speed}`;bSpeed.setAttribute('aria-pressed',speed>1);};

function toSetup(){setTimeout(allWaitLabel,0);['intro','result'].forEach(id=>$(id).hidden=true);$('stText').textContent=STG?STAGES[STG].goal:'都内の駅に触れて、指をすべらせて選ぶ（触れてすぐ離すとくわしいパネル）';popHub=null;pausedByPop=false;reset();renderPop();updateSetupText();phase='setup';setPaused(true);bPlay.disabled=true;
  $('setup').hidden=false;$('bar').classList.add('setting');hintUntil=performance.now()+4000;}
function run(){popHub=null;pausedByPop=false;renderPop();$('setup').hidden=true;$('bar').classList.remove('setting');phase='run';bPlay.disabled=false;setPaused(false);
  const hlAll=sim.S.dots.filter(d=>d.homeless).length,hlOut=sim.S.dots.filter(d=>d.homeless&&!d.sheltered).length;
  setTimeout(()=>simpleToast(`⛺ 一時滞在施設は開設の準備中（約6時間）。待つ場所のない${fmtPeople(hlAll)}は、駅前の広場などで待つ`),700);
  if(SC==='shuto')setTimeout(()=>simpleToast('🚃 首都直下地震では、地下鉄は1週間、JR・私鉄は1か月ほど止まるおそれ'),5200);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){stage.classList.remove('shake');void stage.offsetWidth;stage.classList.add('shake');}}
$('bEast').onclick=()=>{setWorld('east');toSetup();};
$('bShuto').onclick=()=>{setWorld('shuto');toSetup();};
$('bGo').onclick=run;
$('bOther').onclick=()=>{if(STG==='p1')setWorld('east','p2');else setWorld('east');toSetup();};
$('bP1').onclick=()=>{setWorld('east','p1');toSetup();};$('bP2').onclick=()=>{setWorld('east','p2');toSetup();};
$('bAgain').onclick=()=>{setWorld(SC,STG);toSetup();};
$('bMap').onclick=()=>{$('result').hidden=true;showMarks=true;$('bBack').hidden=false;};
$('bBack').onclick=()=>{$('result').hidden=false;showMarks=false;$('bBack').hidden=true;};
// 次の出来事まで早送り
function nextEventT(){const S=sim.S,c=[];W.resume.forEach(t=>{if(isFinite(t)&&t>S.t)c.push(t);});W.poolStages.forEach(st=>st.forEach(x=>{if(isFinite(x.t)&&x.t>S.t)c.push(x.t);}));
  if(CFG.SHELTER_OPEN>S.t)c.push(CFG.SHELTER_OPEN);if(SC==='shuto'&&CFG.T72>S.t)c.push(CFG.T72);return c.length?Math.min(...c):S.t+60;}
$('bSkip').onclick=()=>{if(phase!=='run'||sim.S.done)return;if(popHub){popHub=null;renderPop();pausedByPop=false;}const target=nextEventT();
  while(sim.S.t<target&&!sim.S.done){sim.step(policy);if(sim.S.events.some(e=>e.type==='jam'))break;}updateHUD();};
const STARS=[[85,5],[65,4],[45,3],[25,2],[0,1]];
const TITLES={5:'混乱をとても小さくできた',4:'混乱をかなり小さくできた',3:'混乱を小さくできた',2:'改善の余地がある帰し方',1:'道も駅も大きく混乱した'};
const HINTS={
 east:{tired:['途中でへとへとになった人が多くいます。遠くに住む人を歩かせていませんか。','電車で帰れない人は、駅で待たせましょう。「歩いて帰す」は色を選んで使います。','家まで電車が通じた人から、🚃「電車で帰す」で帰しましょう。'],
  amb:['救急車が人の波で止められています。地震の直後に一斉に帰していませんか。','スタート前に「全部の駅を待つに」を押しておきましょう。','夜のあいだは「歩いて帰す」を使わないと、道が空きます。'],
  gaveUp:['駅に人があふれ、あきらめて歩き出した人がいます。','🚃「電車で帰す」を入れっぱなしにすると、駅があふれます。','駅の箱の上のゲージが半分に近づいたら、🚃を「待つ」に戻し、下がったらまた「帰す」に。'],
  last:['全員が帰り終わるまで時間がかかっています。','ゲージが低い駅は、🚃「電車で帰す」にして構いません。','南北線（埼玉高速鉄道直通）は当日の夜に動きます。永田町の🚃を使いましょう。']},
 shuto:{amb:['救急車が人の波で止められています。救助の需要が大きい時期に歩かせていませんか。','救命・救助の需要が大きい最初の3日ほどは、待つことを考えましょう。','一度に全員を歩かせず、駅ごと・色ごとに少しずつ帰しましょう。'],
  over:['会社の備蓄が切れた人がいます。待たせすぎです。','備蓄は3日分です。それを過ぎる前に、帰し始めましょう。','3日が近づいたら、駅ごと・色ごとに少しずつ「歩いて帰す」にしましょう。'],
  last:['帰し終わるまでに時間がかかっています。','帰し始めたら、間をあけすぎないようにしましょう。','10分おきくらいに、駅と色を1つずつ「歩いて帰す」にしましょう。']}};
function recipeText(){const sh=refInfo.shel.map(h=>N[h].name).join('・');
  if(STG==='p1')return `【好成績だった帰し方の一例】①スタート時は全部「待つ」になっています。②21:20に南北線（埼玉高速鉄道直通）が動いたら、🚃「電車で帰す」にする。③箱の上のゲージが${Math.round(refInfo.g*10)}割を超えたら🚃を「待つ」に戻し、下がったら「帰す」に。迷ったら一時停止して構いません。`;
  if(STG==='p2')return `【好成績だった帰し方の一例】①スタート時は全部「待つ」になっています。②池袋・永田町の両方で、ゲージが${Math.round(refInfo.g*10)}割を超えたら🚃を「待つ」に、下がったら「帰す」に。③池袋の青（家まで10km未満）の人は、歩いて帰して構わない。`;
  if(SC==='east')return `【好成績だった帰し方の一例】①スタート前に「全部の駅を待つに」を押す。②当日の夜、南北線（埼玉高速鉄道直通）が動いたら、永田町の🚃「電車で帰す」を使う。③翌朝、各駅で🚃「電車で帰す」を使う。④どの駅も、箱の上のゲージが${Math.round(refInfo.g*10)}割を超えたら🚃を「待つ」に戻し、下がったら「帰す」に。迷ったら一時停止して構いません。⑤青（家まで10km未満）の人は、道が混んでいなければ、早めに「歩いて帰す」にして構わない。電車が動くのを待つ必要はない。橙・赤の人は歩かせない。`;
  const [d,c]=fmtClock(refInfo.st);
  return `【好成績だった帰し方の一例】①スタート前に「全部の駅を待つに」を押す。②${d}日目 ${c}ごろから、${refInfo.g}分おきに、駅と色を1つずつ「歩いて帰す」にする（青→橙→赤の順）。③地下鉄が動いたら、その駅の🚃「電車で帰す」も使う。被害の状況によって、適した時期は変わります。`;}
function playsKey(){return 'kaeru_plays_'+(STG||SC);}
function getPlays(){try{return parseInt(localStorage.getItem(playsKey())||'0',10)||0;}catch(e){return 0;}}
function setPlays(n){try{localStorage.setItem(playsKey(),String(n));}catch(e){}}
function showResult(){phase='end';setPaused(true);clearTimeout(msgTimer);$('toasts').innerHTML='';popHub=null;pausedByPop=false;renderPop();
  const NN=sim.S.dots.length;const you=metricsOf(W,sim);const sc_=scoreOf(SC,you,base,ref,sim.T_END);const pts=Math.round(sc_.total);
  const stars=STARS.find(([th])=>pts>=th)[1];
  const when=m=>m.last>sim.T_END?`${fmtPeople(NN-sim.S.stats.home)}が<br>まだ帰れない`:fmtWhen(m.last);
  const P=n=>fmtPeople(n);
  const good=k=>sc_.parts[k]>=0.85?'good':(sc_.parts[k]<0.4?'bad':'');
  let rows;
  if(SC==='east')rows=[['全員帰宅',when(you),when(base),good('last')],['途中でへとへとに',P(you.tired),P(base.tired),good('tired')],
    ['救急車の遅れ',fmtMin(you.amb),fmtMin(base.amb),good('amb')],['駅であきらめて歩いた人',P(you.gaveUp),P(base.gaveUp),good('gaveUp')],
    ['施設に入れず歩いた人（参考）',P(you.forced),P(base.forced),'']];
  else rows=[['全員帰宅',when(you),when(base),good('last')],['救急車の遅れ',fmtMin(you.amb),fmtMin(base.amb),good('amb')],['途中でへとへとに（参考）',P(you.tired),P(base.tired),''],
['備蓄が切れた人',P(you.over),P(base.over),good('over')],
    ['施設に入れず歩いた人（参考）',P(you.forced),P(base.forced),'']];
  $('stars').textContent='★'.repeat(stars)+'☆'.repeat(5-stars);$('stars').setAttribute('aria-label',`評価 5段階中${stars}`);
  $('score').textContent=`${pts}点`;
  $('rTitle').textContent=TITLES[stars];
  const tl=SC==='east'?[['🏠','全員帰宅',when(you),when(base),good('last')],['🧍','へとへと',P(you.tired),P(base.tired),good('tired')],['🚑','救急車の遅れ',fmtMin(you.amb),fmtMin(base.amb),good('amb')],['⚠','駅であきらめた人',P(you.gaveUp),P(base.gaveUp),good('gaveUp')]]
    :[['🏠','全員帰宅',when(you),when(base),good('last')],['🚑','救急車の遅れ',fmtMin(you.amb),fmtMin(base.amb),good('amb')],['🍙','備蓄が切れた人',P(you.over),P(base.over),good('over')],['⛺','施設に入れず',P(you.forced),P(base.forced),'']];
  $('rTiles').innerHTML=tl.map(t=>`<div class="tile ${t[4]}"><span class="ti">${t[0]}</span><span class="tl">${t[1]}</span><span class="tv">${t[2]}</span><span class="tb">すぐ帰すと ${String(t[3]).replace('<br>','')}</span></div>`).join('');
  $('rRows').innerHTML=rows.map(r=>`<tr class="${r[3]}"><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  // ヒント：回を重ねるほど具体的に、4回目以降は手順の完全版
  const plays=getPlays()+1;setPlays(plays);
  let hint;
  $('dRecipe').hidden=!(plays>=4||stars===5);$('rRecipe').textContent=recipeText().replace('【好成績だった帰し方の一例】','');
  if(stars===5)hint='会社で待ち、少しずつ帰すことが、道と駅と救急車を守ります。';
  else if(plays>=4)hint='下の「帰し方の例」を開いてみましょう。';
  else{const w=WEIGHTS[SC];const worst=Object.keys(w).sort((a,b)=>w[b]*(1-sc_.parts[b])-w[a]*(1-sc_.parts[a]))[0];
    hint=HINTS[SC][worst][Math.min(plays,3)-1].replace('{SHEL}',refInfo.shel.map(h=>N[h].name).join('・'));}
  $('rHint').innerHTML=`${stars===5?'✨ ':'💡 '}${hint}`;
  let fact=SC==='east'
    ?(you.gaveUp>0?'電車が動いても、一度に駅へ向かうとホームがあふれます。東日本大震災の夜も、銀座線は渋谷駅のホーム混雑で2回運転を見合わせました。':'東日本大震災では、首都圏で約515万人が帰宅困難になりました。会社や学校で待つことが、道と救急車を空けます。')
    :'国や都は、首都直下地震では原則3日間、会社などで待つよう呼びかけています。待つ間に道や電車の状況を確かめ、帰れる人から少しずつ帰すのが基本です。';
  if(you.last>base.last&&base.tired>you.tired)fact=`全員が帰り終わる時刻は、すぐ帰した場合より遅くなりました。その代わり、へとへとになった人や救急車の遅れを減らせています。`+fact;
  else if(you.last<=base.last&&pts>=65)fact=`すぐ帰した場合より、全員が早く帰り終わりました。電車の動きに合わせて少しずつ帰すと、混雑が減って早く帰れることがあります。`+fact;
  $('rFact').textContent=fact;
  const WL={tired:'へとへと',amb:'救急車',gaveUp:'駅のあふれ',forced:'施設に入れず',last:'帰宅完了',over:'備蓄切れ'};
  $('rWeights').textContent='評価の内訳：'+Object.entries(WEIGHTS[SC]).map(([k,v])=>`${WL[k]}${Math.round(v*100)}%`).join('・');
  $('bOther').textContent=STG==='p1'?'次へ：練習2':STG==='p2'?'本番：東日本大震災（2011年）':'';$('bOther').hidden=!STG;
  $('rLog').innerHTML=buildLog();fillMine();
  $('rFine').innerHTML=FINE[SC];
  $('result').querySelector('.card').scrollTop=0;$('result').hidden=false;}
function edgeName(eid){const e=W.edges[eid];return `${N[e.a].name}〜${N[e.b].name}`;}
function buildLog(){const S=sim.S,items=[];
  W.resume.forEach((t,li)=>{const r=W.D.rails[li];if(r.urban||!isFinite(t)||t>S.t||t<(W.startT||0))return;items.push({t,txt:`🚃 ${r.name}が動いた`});});
  if(CFG.SHELTER_OPEN>(W.startT||0)&&CFG.SHELTER_OPEN<=S.t)items.push({t:CFG.SHELTER_OPEN,txt:'⛺ 一時滞在施設が開いた'});
  let a=false,ti=false;S.log.forEach(g=>{if(g.type==='amb'&&!a){a=true;items.push({t:g.t,txt:`🚑 ${edgeName(g.e)}の道で、救急車が人の波に止められた`,bad:1});}
    if(g.type==='tired'&&!ti){ti=true;items.push({t:g.t,txt:`🧍 ${edgeName(g.e)}の道で、へとへとになる人が出はじめた`,bad:1});}
    if(g.type==='jam')items.push({t:g.t,txt:`⚠ ${N[g.hub].name}駅のホームがあふれ、入場規制${g.gaveUp?`（${fmtPeople(g.gaveUp)}があきらめて歩き出した）`:''}`,bad:1});});
  actLog.forEach(x=>items.push({t:x.t,txt:x.txt,me:1}));
  items.sort((p,q)=>p.t-q.t||(q.me||0)-(p.me||0));
  // 長すぎる場合は、自分の操作を間引き、出来事を優先
  let list=items;if(list.length>12){const ev=list.filter(x=>!x.me);const me=list.filter(x=>x.me);list=[...ev,...me.slice(0,Math.max(0,12-ev.length))].sort((p,q)=>p.t-q.t).slice(0,12);}
  if(!list.length)return '';
  return '<b>ふりかえり（時刻順）</b><ul>'+list.map(x=>{const [d,c]=fmtClock(x.t);return `<li class="${x.bad?'bad':x.me?'me':''}"><span>${d}日目 ${c}</span>${x.txt}</li>`;}).join('')+'</ul><p class="lgnote">「地図でふりかえる」で、問題が起きた場所を地図に表示します。</p>';}
function drawMarks(){const S=sim.S;
  const byEdge=(obj)=>{const m={};Object.entries(obj).forEach(([k,v])=>{const [e,c]=k.split(':').map(Number);if(!m[e])m[e]={n:0,cs:0,best:c,bv:0};m[e].n+=v;if(v>m[e].bv){m[e].bv=v;m[e].best=c;}});return m;};
  const tired=byEdge(S.marks.tired),amb=byEdge(S.marks.amb);
  Object.entries(tired).forEach(([e,o])=>{const [x,y]=edgePoint(+e,(o.best+0.5)*CFG.CELL,0);const r=Math.min(5,1.6+Math.sqrt(o.n)*0.5);
    ctx.beginPath();ctx.arc(X(x),Y(y),r*sc,0,7);ctx.fillStyle='rgba(120,128,138,.85)';ctx.fill();ctx.lineWidth=0.5*sc;ctx.strokeStyle=C.panel;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=`900 ${1.9*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(fmtPeople(o.n).replace('人',''),X(x),Y(y));});
  Object.entries(amb).forEach(([e,o])=>{const [x,y]=edgePoint(+e,(o.best+0.5)*CFG.CELL,2.5);ctx.beginPath();ctx.arc(X(x),Y(y),2.6*sc,0,7);ctx.fillStyle=C.panel;ctx.fill();ctx.lineWidth=0.7*sc;ctx.strokeStyle=C.jam;ctx.stroke();
    ctx.font=`${2.6*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🚑',X(x),Y(y)+0.1*sc);});
  Object.entries(S.marks.jam).forEach(([h,n])=>{const nn=N[h];ctx.beginPath();ctx.arc(X(nn.x+7),Y(nn.y-6),2.8*sc,0,7);ctx.fillStyle=C.jam;ctx.fill();
    ctx.fillStyle='#fff';ctx.font=`900 ${2.2*sc}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⚠'+n,X(nn.x+7),Y(nn.y-6));});
  ctx.fillStyle=C.ink;ctx.font=`700 ${2.3*sc}px sans-serif`;ctx.textAlign='left';ctx.textBaseline='top';
  ctx.fillText('灰色の丸＝へとへとになった人　🚑＝救急車が止められた所　⚠＝駅があふれた回数',X(1),Y(1));}
// あなたの場合
function earliestRail(h,m){const E_=WE;const ts=[...new Set(E_.resume.filter(isFinite))].sort((a,b)=>a-b);
  for(const t of ts){const r=railPath(E_,h,m,li=>E_.resume[li]<=t);if(r){const ls=[];r.legs.forEach(l=>{const nm=E_.D.rails[l.line].name;if(ls[ls.length-1]!==nm)ls.push(nm);});return {t,lines:ls};}}
  return null;}
function fillMine(){if(!WE)WE=buildWorld(DATA,'east',1);const sh=$('mHub'),sm=$('mHome');
  if(!sh.options.length){WE.hubs.forEach(h=>sh.add(new Option(WE.N[h].name+'駅のあたり',h)));WE.homes.forEach(m=>sm.add(new Option(WE.N[m].name,m)));sh.onchange=sm.onchange=mineText;}
  mineText();}
function mineText(){const h=$('mHub').value,m=$('mHome').value;const km=WE.walk[h][m].km;const c=cls(km);const col=['青','橙','赤'][c];
  // ゲームの条件に当てはめた目安。個人に合った行動を判定するものではない
  let t=`ゲームの条件では、家まで約${km.toFixed(0)}km（${col}）、休まずに歩いて約${Math.round(km/4*10)/10}時間です。`;
  if(c===0)t+='都の被害想定の考え方では、歩いて帰れる距離とされています。';
  else if(c===1)t+='都の被害想定の考え方では、途中で歩けなくなる人も出る距離とされています。';
  else t+='都の被害想定の考え方では、歩いて帰るのが難しい距離とされています。';
  {const r=earliestRail(h,m);if(r){const [d,cl]=fmtClock(r.t);t+=`東日本大震災の記録に当てはめると、家まで電車が通じたのは${d===1?'当日':d===2?'翌日':d+'日目'} ${cl}ごろでした（${r.lines.join('→')}）。`;}}
  t+='実際の行動は、被害の状況や勤務先・自治体の指示によって変わります。国や都は、一斉に帰らず会社などで待つこと（被害が大きいときは原則3日間）、会社での水・食料の備えや、家族との連絡方法（災害用伝言ダイヤル171など）を決めておくことを呼びかけています。';$('mOut').textContent=t;}

const FINE={east:'このゲームは、電車の止まり方・再開時刻は2011年の実績、人数と一時滞在施設は現在の値を使い、条件を簡略化したものです。現実の被害を予測するものではありません。評価は、このゲームで扱う条件（道や駅の混雑、救急車の通りやすさ、疲れ）だけで付けています。余震・火災・落下物などによる道の安全や、救助活動への影響は省いているため、ゲームで翌日に帰した方が高得点でも、現実にそうすべき根拠にはなりません。原則として3日間の待機を踏まえ、目的地までの全区間が動いているか、道が安全か、移動が新たな混乱を生まないかなど、帰宅できる条件が整ったかを確かめて判断することが大切です。電車の再開時刻と路線網は東日本大震災（2011年3月11日）当時のもの（国土交通省の検証報告書）で、上野東京ライン（2015年開業）はありません。銀座線は20:40に再開した後、駅のホーム混雑で運転見合わせがありましたが、ここでは反映していません。都心の揺れは震度5強で、首都直下地震ではさらに遅れるおそれがあります。',
  shuto:'電車の止まる期間は国の首都直下地震の被害想定（地下鉄は1週間、JR・私鉄は1か月程度）によります。地下鉄が動きだす日はこの範囲で毎回変わります。会社での待機は原則3日間（国・都の呼びかけ）、備蓄は3日分として計算しています。救急車は、発災後72時間は20分おき、その後は40分おきに出動すると想定しています。道路の損壊や火災による通行止めは、まだ組み込んでいません。待つ場所のない人は、都の被害想定の割合（帰宅困難者453万人のうち66万人）に合わせています。'};
const FINE_COMMON='<br>【使ったデータ】通勤・通学者：令和2年国勢調査（不詳補完、従業地・通学地）。14時台に都内にいる割合・待つ場所のない人：出典：第6回東京都市圏パーソントリップ調査（東京都市圏交通計画協議会、平成30年）のデータ集計システムによる集計結果を加工して作成。一時滞在施設：特別区長会調査研究機構 令和5年度報告書ほか各区資料。区の数字に都立施設が含まれない区（含むと確認できた新宿・豊島・練馬以外）は、都立一時滞在施設の数×1施設約350人（都が当初200施設で約7万人と想定）を上乗せ（暫定）。帰宅困難者数：東京都の被害想定（令和4年）。徒歩の距離：Googleマップの徒歩経路による実測（2026年10月）。電車の輸送力：国交省 都市鉄道の混雑率調査（令和7年度）の朝ピーク1時間の輸送力（都心へ向かう上り方向の値を、帰宅方向の運転能力の目安として使用）に、再開直後の運転本数の減少を見込んで50%を掛けた値（減少率は仮定）。人は500人単位で乗るため、枠の端数は次の分に繰り越します（最大500人分まで。空席のまま出た列車の枠をためておくことはしません）。全員帰宅の時刻はこの簡略モデルでの値で、現実の予測値ではありません。高崎線・宇都宮線は2011年当時の上野発着として扱います。駅の箱は、その駅の周辺の区で働く・学ぶ対象者のうち、地域内で待っている人の数で、実際の駅全体の人数ではありません。箱の上のゲージは、駅へ向かう・乗車を待つ対象者の数を、その駅に発着する埼玉方面の路線の輸送力（40分ぶん）と比べたゲーム上の混雑目安で、ホームの収容人数ではありません。電車は、複数の駅で路線の輸送枠を分け合う簡略モデルです。すべての駅の乗車待ちを駅に着いた順に並べて枠を割り当てるもので、実際の乗車順や区間ごとの混み方を再現したものではありません。上野の箱は、北千住で東武線に乗り換える経路も含めて扱っています（東武線の起点は浅草）。県境近くの区で働き、家まで10kmを超える約3.3万人は、画面には出さず、赤羽（北・板橋・荒川区）と北千住（足立・葛飾・江戸川区）を地域の代表地点として、そこから乗る人が埼玉方面の列車の枠を使う扱いです。代表地点までの乗り継ぎ（例：赤羽から北千住へ）は省いています。全員が電車を使い、路線が動いてから120分のうちに駅に着く、という電車の負荷を大きく置いた一つの条件です。東武線へは千代田線・日比谷線で北千住に出て乗り換える扱いで（東武の再開8:57から）、東武線の輸送力の範囲内です。半蔵門線（押上で東武へ）は、押上を含む区間の再開が3/12 13:00だったため使いません。都内の駅どうしは丸ノ内線・有楽町線・銀座線・山手線で乗り継げます（都内の区間で埼玉へ向かう路線の座席を使わないよう、乗り継ぎ用の路線を優先）（3.11の再開時刻どおり。輸送力の制約は埼玉へ向かう路線で見ます）。乗り継ぎ先の路線が動くまでは、出発駅で待ちます。県境近くの区（北・板橋・足立・荒川・葛飾・江戸川）で働く人のうち、家まで10km以内の人は地震直後から自分で歩いて帰ります（それより遠い人は職場で待つ扱いで、画面には出しません）。1つの点は500人です。一時滞在施設は、国のガイドラインに沿って発災から約6時間後に開設し、全駅で受入能力いっぱいまで受け入れます。入れなかった待つ場所のない人は、開設時に歩き出します。点の色は、都の被害想定の考え方（家まで10km以内は全員歩いて帰れる、20km超は全員帰れない）によります。会社などの帰す・待たせるの判断には、全員が従う前提です（実際には、子どもの迎えなどで自分の判断で帰る人もいます）。県境近くの区で働く人は地震直後から歩いて帰る扱いですが、国の指針は近距離の人にも分散して帰ることを求めており、それが守られれば道はもう少しすく可能性があります。<br>試作版 v0.1　制作：さいたま市議会議員 三神たかし';
Object.keys(FINE).forEach(k=>FINE[k]+=FINE_COMMON);
setWorld('east');reset();
let last=performance.now();
function frame(now){const dt=Math.min(0.1,(now-last)/1000);last=now;
  if(phase==='run'&&!paused&&!sim.S.done){acc+=dt*RATE*speed;let n=0;while(acc>=1&&n<120){sim.step(policy);acc--;n++;}}
  if(phase==='run'){
    let resumed=false;const railNow=[];let jamMsg=null,stageMsg=null,otherMsg=null;
    while(sim.S.events.length){const e=sim.S.events.shift();
      if(e.type==='jam'){jamMsg=e;flashes.push({m:e.hub,t:now,long:true,col:C.jam});}
      else if(e.type==='unjam'){}
      else if(e.type==='stage'){stageMsg=e;}
      else if(e.type==='shelter'){const hlOut=sim.S.dots.filter(d=>d.homeless&&!d.sheltered).length;
        otherMsg=hlOut>0?`⛺ 一時滞在施設が開いた。受入枠を超えた${fmtPeople(hlOut)}は歩き出す（白抜きの点）`:'⛺ 一時滞在施設が開いた。待つ場所のない人は全員入れた';}
      else if(e.type==='t72'){otherMsg='⏱ 3日たった。救助のピークが過ぎた。会社の備蓄も残りわずか';}
      else if(e.type==='rail'){resumed=true;anims[e.line]=now;railNow.push(e.line);
        const r=W.D.rails[e.line];r.stops.forEach(s=>{if(N[s].type==='home')flashes.push({m:s,t:now,long:true,col:r.color});});}}
    if(jamMsg)jamToast(jamMsg.hub,jamMsg.gaveUp);
    else if(railNow.length)railToastMulti(railNow);
    else if(stageMsg)simpleToast(`🚃 ${stageMsg.label}も動きだした（本数が増えた）`);
    else if(otherMsg)simpleToast(otherMsg);
    if(resumed)computeReach();
    updateHUD();if(sim.S.done&&!resultQueued){resultQueued=true;setTimeout(showResult,600);}}
  draw(now);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
})();
