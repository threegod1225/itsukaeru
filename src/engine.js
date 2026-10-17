/* ===== かえるタイミング 計算エンジン ===== */
const T0 = 14*60+46;
const tmin = (d,h,m) => (d-1)*1440 + h*60 + m - T0;
const CFG = {
  V0: 4/60, KJ: 240, CELL: 0.5, VMIN: 0.04, RELEASE: 0.2, RUSH: 0.1, HUB_EXIT: 30,
  STATION_IN: 3, JAM_MIN: 40, SHELTER_OPEN: 360, BG_SPREAD: 120, APPROACH_MIN: 10, APPROACH_SPREAD: 20, SUSPEND: 20, GRACE: 15, RAIL_V: 0.6, AMB_V: 0.5, KMU: 0.36,
  RAIL_FACTOR: 0.5, TIRED_V: 0.4, REST_CYCLE: 45, REST_WALK: 30,
  T_END: tmin(3,12,0), T72: tmin(4,14,46), STOCK_GRACE: 360, NEAR_SPREAD: 90
};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function riverY(R,x){for(let i=0;i<R.length-1;i++){const [x0,y0]=R[i],[x1,y1]=R[i+1];if(x>=x0&&x<=x1)return y0+(y1-y0)*(x-x0)/(x1-x0);}return R[R.length-1][1];}

function buildWorld(D, scenario, rngSeed){
  const ids=Object.keys(D.nodes); const N={}; ids.forEach(id=>N[id]={id,...D.nodes[id]});
  const hubs=ids.filter(i=>N[i].type==="hub"), homes=ids.filter(i=>N[i].type==="home");
  const edges=D.roads.map(([a,b,km,name],i)=>({id:i,a,b,km,name,cells:Math.max(1,Math.ceil(km/CFG.CELL))}));
  const adj={}; ids.forEach(i=>adj[i]=[]);
  edges.forEach(e=>{adj[e.a].push({to:e.b,e,dir:1});adj[e.b].push({to:e.a,e,dir:-1});});
  function dij(src){const dist={},prev={};ids.forEach(i=>dist[i]=Infinity);dist[src]=0;const Q=new Set(ids);
    while(Q.size){let u=null;Q.forEach(q=>{if(u===null||dist[q]<dist[u])u=q;});Q.delete(u);if(dist[u]===Infinity)break;
      adj[u].forEach(({to,e,dir})=>{if(N[to].type==="hub"&&to!==src)return;const nd=dist[u]+e.km;if(nd<dist[to]){dist[to]=nd;prev[to]={from:u,e,dir};}});}
    return {dist,prev};}
  const walk={};
  hubs.forEach(h=>{const {dist,prev}=dij(h);walk[h]={};
    homes.forEach(m=>{const path=[];let c=m;while(c!==h){const p=prev[c];path.unshift({e:p.e.id,dir:p.dir});c=p.from;}
      walk[h][m]={path,graphKm:dist[m],km:dist[m]};});});
  // 実測の直通距離で補正（見沼）
  const meas=D.odKmMeasured||{}; const ratios=[];
  Object.entries(meas).forEach(([k,v])=>{const [h,m]=k.split('>');if(!walk[h]||!walk[h][m])return;ratios.push(v/walk[h][m].graphKm);walk[h][m].km=v;});
  const avgR=ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:1;
  hubs.forEach(h=>{if(walk[h].minuma&&!meas[h+'>minuma'])walk[h].minuma.km=walk[h].minuma.graphKm*avgR;});
  const railEdges=[];
  D.rails.forEach((r,li)=>{for(let i=0;i<r.stops.length-1;i++){const a=N[r.stops[i]],b=N[r.stops[i+1]];
    railEdges.push({a:a.id,b:b.id,line:li,km:Math.hypot(a.x-b.x,a.y-b.y)*CFG.KMU});}});
  const corridors={};
  // 救急車の走行ルート：都心の駅から埼玉側入口までの各道路と、埼玉側の幹線
  D.roads.forEach(([a,b,km,name],i)=>{if(name==='ent')corridors['e'+i]={path:[{e:i,dir:1}],km};});
  Object.entries(D.corridors).forEach(([k,stops])=>{if(!stops.every(x=>N[x]))return;const path=[];/*幹線*/for(let i=0;i<stops.length-1;i++){
      const e=edges.find(e=>(e.a===stops[i]&&e.b===stops[i+1])||(e.b===stops[i]&&e.a===stops[i+1]));path.push({e:e.id,dir:e.a===stops[i]?1:-1});}
    corridors[k]={path,km:path.reduce((s,p)=>s+edges[p.e].km,0)};});
  // 近接区の人：川を渡る地点から歩き出す
  const nearStart={};
  homes.forEach(m=>{const h=D.nearRef[m];if(!walk[h])return;const wk=walk[h][m];let acc=0,found=null;
    for(const s of wk.path){const e=edges[s.e];const A=N[s.dir>0?e.a:e.b],B=N[s.dir>0?e.b:e.a];
      for(let k=0;k<=100;k++){const t=k/100;const x=A.x+(B.x-A.x)*t,y=A.y+(B.y-A.y)*t;if(y<=riverY(D.river,x)+1.5){found=acc+e.km*t;break;}}
      if(found!==null)break;acc+=e.km;}
    nearStart[m]={hub:h,g0:found||0};});
  let resume;let subwayT=null;
  if(scenario==='shuto'){const r=mulberry32(rngSeed||1);subwayT=tmin(5,0,0)+Math.floor(r()*3*1440);resume=D.rails.map(x=>x.subway?subwayT:Infinity);}
  else resume=D.rails.map(r=>tmin(...r.resume));
  // 輸送力は「プール」単位（同じ線路を共有する路線は輸送力を分け合う）
  const poolIds=Object.keys(D.pools);const poolIdx={};poolIds.forEach((p,i)=>poolIdx[p]=i);
  const linePool=D.rails.map(r=>poolIdx[r.pool]);
  const poolUnl=poolIds.map(p=>!!D.pools[p].unlimited);
  const poolStages=poolIds.map(p=>D.pools[p].stages.map(st=>({t:scenario==='shuto'?(p==='sr7'?subwayT:Infinity):tmin(...st.t),cap:st.capH*CFG.RAIL_FACTOR/D.meta.perDot/60,label:st.label})));
  const poolFull=poolStages.map(sts=>sts.reduce((a,b)=>a+b.cap,0));
  return {D,N,hubs,homes,edges,walk,railEdges,corridors,resume,linePool,poolIds,poolStages,poolFull,poolUnl,nearStart,scenario};
}
// 都の被害想定：10km以内は全員帰宅可能、20km超は全員帰宅困難（10〜20kmは1km増すごとに帰宅可能な人が10%減る）
// 電車の経路：乗り換え1回を3km相当の負担とみなし、乗り換えの少ない経路を選ぶ（同じ路線に乗り続ける方を優先）
function railPath(W,h,m,isRun){const TR=3;const adj={};
  W.railEdges.forEach(re=>{if(!isRun(re.line))return;[[re.a,re.b],[re.b,re.a]].forEach(([a,b])=>{(adj[a]=adj[a]||[]).push({to:b,line:re.line,km:re.km});});});
  const dist={},prev={};const key=(n,l)=>n+'|'+l;const Q=[];
  (adj[h]||[]).forEach(e=>{const k=key(h,e.line);dist[k]=0;Q.push(k);});
  if(!Q.length)return null;let best=null,bestK=null;const done=new Set();
  while(true){let u=null,ud=Infinity;for(const k in dist){if(!done.has(k)&&dist[k]<ud){ud=dist[k];u=k;}}if(u===null)break;done.add(u);
    const [n,l]=u.split('|');const li=+l;if(n===m){best=ud;bestK=u;break;}
    for(const e of (adj[n]||[])){const k=key(e.to,e.line);const c=ud+e.km+(e.line===li?0:TR);
      // 同じ駅での乗り換え
      if(dist[k]===undefined||c<dist[k]){dist[k]=c;prev[k]={from:u,line:e.line,km:e.km,a:n,b:e.to};}}}
  if(bestK===null)return null;const legs=[];let k=bestK;
  while(prev[k]){const p=prev[k];legs.unshift({from:p.a,to:p.b,km:p.km,line:p.line});k=p.from;}
  return {legs,km:legs.reduce((a,b)=>a+b.km,0)};}
function cls(km){ return km<10?0:(km<=20?1:2); }

function lrRound(items){ // largest remainder
  const tot=Math.round(items.reduce((s,x)=>s+x.v,0));let fl=items.map(x=>({...x,n:Math.floor(x.v),f:x.v-Math.floor(x.v)}));
  let rem=tot-fl.reduce((s,x)=>s+x.n,0);fl.sort((a,b)=>b.f-a.f);for(let i=0;i<rem&&i<fl.length;i++)fl[i].n++;return fl;}

function createSim(W, seed, opt){
  opt=opt||{};const SC=W.scenario;const shelters=new Set(opt.shelters||W.hubs);const D=W.D,PER=D.meta.perDot;
  const T_END=SC==='shuto'?tmin(8,24,0):CFG.T_END;
  const rng=mulberry32(seed);
  // 待つ場所のない人：東日本＝PT調査の私用目的の滞留者／首都直下＝都の想定（帰宅困難者の約15％）に合わせて拡大
  const wItems=[],hItems=[],nItems=[];
  W.hubs.forEach(h=>{const P=D.hubParams[h];W.homes.forEach(m=>{const w=D.workers[h][m]||0;
    let hl=w*P.r, wk=w;
    if(SC==='shuto'){const tot=w*(1+P.r);hl=tot*(P.r/(1+P.r))*D.shuto.K;wk=tot-hl;}
    wItems.push({h,m,v:wk/PER});hItems.push({h,m,v:hl/PER});});});
  W.homes.forEach(m=>{if(W.nearStart[m])nItems.push({m,v:(D.near[m]||0)/PER});});
  const dots=[],waiting={},forced={},queue={},approach={};
  W.hubs.forEach(h=>{waiting[h]={};forced[h]={};queue[h]=[];approach[h]=[];W.homes.forEach(m=>{waiting[h][m]=[];forced[h][m]=[];});});
  const shelterLeft={};W.hubs.forEach(h=>shelterLeft[h]=shelters.has(h)?Math.round(D.hubParams[h].capSaitama/PER):0);
  const mk=(h,m,extra)=>{const wk=W.walk[h][m];const d={id:dots.length,hub:h,home:m,km:wk.km,cls:cls(wk.km),scale:wk.graphKm/wk.km,
    stamina:10+rng()*10,phase:Math.floor(rng()*45),walked:0,mode:"wait",pi:0,p:0,jit:(rng()-0.5)*2,everStuck:false,...extra};dots.push(d);return d;};
  lrRound(wItems).forEach(x=>{for(let i=0;i<x.n;i++)waiting[x.h][x.m].push(mk(x.h,x.m,{}));});
  lrRound(hItems).forEach(x=>{for(let i=0;i<x.n;i++){const d=mk(x.h,x.m,{homeless:true});
    if(shelterLeft[x.h]>0){shelterLeft[x.h]--;d.sheltered=true;waiting[x.h][x.m].push(d);}else forced[x.h][x.m].push(d);}});
  // 背景の利用者：県境近くの区で働き、家まで10kmを超える人。画面には出さず、赤羽・北千住から乗って埼玉方面の列車の空きを使う
  const bg=[];const poolIx={};W.poolIds.forEach((p,i)=>poolIx[p]=i);
  if(D.nearGroup&&D.bgRoute)W.homes.forEach(m=>{const ns=W.nearStart[m];if(!ns)return;const wk=W.walk[ns.hub][m];const sc_=wk.graphKm/wk.km;const rem=(wk.graphKm-ns.g0)/sc_;
    if(rem<=10)return;const tot=(D.near[m]||0)/PER;['akabane','kitasenju'].forEach(g=>{const n=tot*(D.nearGroup[m][g]||0);if(n<=0)return;
      const ps=D.bgRoute[g][m].map(p=>poolIx[p]);const start=Math.max(...ps.map(p=>W.poolStages[p].length?W.poolStages[p][0].t:Infinity));
      const nTok=Math.round(n);const times=[];if(isFinite(start))for(let q=0;q<nTok;q++)times.push(start+Math.floor((q+rng())*CFG.BG_SPREAD/Math.max(1,nTok)));
      bg.push({g,m,ps,total:nTok,boarded:0,start,times,next:0,wait:[]});});});
  const nearPending=[];
  lrRound(nItems).forEach(x=>{const ns=W.nearStart[x.m];for(let i=0;i<x.n;i++){const d=mk(ns.hub,x.m,{near:true});
    const wk=W.walk[ns.hub][x.m];const remReal=(wk.graphKm-ns.g0)/d.scale;if(remReal>10){dots.pop();continue;}d.km=remReal;d.cls=cls(remReal);
    d.mode="pending";d.startT=1+Math.floor(rng()*CFG.NEAR_SPREAD);d.g0=ns.g0;nearPending.push(d);}});
  const relAcc={};W.hubs.forEach(h=>relAcc[h]={});
  const poolAcc=W.poolIds.map(()=>0);const poolCap=W.poolIds.map(()=>0);
  const stationMax={};
  const dens=W.edges.map(e=>new Float32Array(e.cells));
  const amb=[],ambSched=[],ck=Object.keys(W.corridors);
  // 救急・救助の出動は期間を区切らず、一定の間隔で続く（72時間で終わる区切りは置かない）
  // 首都直下は、救命・救助の需要が大きい発災後72時間は20分おき、その後は40分おき（想定）
  {let i=0;const t0_=opt.startT||0;for(let t=20;t<=T_END;i++){if(t>t0_)ambSched.push({t,c:ck[i%ck.length]});t+=(SC==='shuto'?(t<CFG.T72?20:40):30);}}
  const hubSusp={},hubGrace={};W.hubs.forEach(h=>{hubSusp[h]=-1;hubGrace[h]=-1;});
  const S={discard:W.poolIds.map(()=>0),accMax:W.poolIds.map(()=>0),borrow:W.poolIds.map(()=>0),capSum:W.poolIds.map(()=>0),used:W.poolIds.map(()=>0),usedMin:W.poolIds.map(()=>0),usedMax:W.poolIds.map(()=>0),capMax:W.poolIds.map(()=>0),bg,t:opt.startT||0,marks:{tired:{},amb:{},jam:{}},log:[],hubSusp,hubGrace,SC,shelters,dots,waiting,forced,queue,approach,stationMax,dens,amb,running:W.resume.map(()=>false),susp:W.resume.map(()=>-1),grace:W.resume.map(()=>-1),
    events:[],stats:{early:0,gaveUp:0,jams:0,over:0,home:0,stuckEver:0,stuckNow:0,ambDelay:0,ambDone:0,last:0,forcedWalk:0},done:false,rot:0};
  let railCache={};
  function railRoute(h,m){const key=h+">"+m;if(key in railCache)return railCache[key];
    const r=railPath(W,h,m,li=>S.running[li]);return railCache[key]=r;}
  // 駅のホームの許容量：その駅に発着する、埼玉へ向かう路線の輸送力（40分ぶん）
  {const saved=S.running.slice();S.running=S.running.map(()=>true);
   W.hubs.forEach(h=>{const ps=new Set();D.rails.forEach((r,li)=>{const p=W.linePool[li];if(r.stops.includes(h)&&!W.poolUnl[p])ps.add(p);});
     let c=0;ps.forEach(p=>c+=W.poolFull[p]);stationMax[h]=Math.max(6,c*CFG.JAM_MIN);});
   S.running=saved;railCache={};}
  function arrive(d){d.mode="home";d.at=S.t;S.stats.home++;S.stats.last=S.t;}
  function cellOf(d){const s=d.path[d.pi];const e=W.edges[s.e];const u=s.dir>0?d.p:e.km-d.p;return [s.e,Math.min(e.cells-1,Math.max(0,Math.floor(u/CFG.CELL)))];}
  function speedAt(eid,c){const k=S.dens[eid][c]/CFG.CELL;return Math.max(CFG.VMIN,1-k/CFG.KJ);}
  function advance(o,dist){while(dist>0&&o.pi<o.path.length){const e=W.edges[o.path[o.pi].e];const rem=e.km-o.p;if(dist<rem){o.p+=dist;dist=0;}else{dist-=rem;o.pi++;o.p=0;}}return o.pi>=o.path.length;}
  function startWalk(d){if(S.SC==='shuto'&&S.t<CFG.T72&&!d.near)S.stats.early++;d.mode="walk";d.path=W.walk[d.hub][d.home].path;d.pi=0;d.p=0;}
  const suspended=li=>false;
  function step(policy){
    if(S.done)return;S.t++;
    if(S.t===CFG.SHELTER_OPEN)S.events.push({t:S.t,type:"shelter"});
    W.resume.forEach((rt,i)=>{if(!S.running[i]&&S.t>=rt){S.running[i]=true;railCache={};S.events.push({t:S.t,type:"rail",line:i});}});
    // 近接区の人が歩き出す
    for(const d of nearPending){if(d.mode==="pending"&&S.t>=d.startT){startWalk(d);advance(d,d.g0);}}
    S.dens.forEach(a=>a.fill(0));
    for(const d of S.dots){if(d.mode==="walk"||d.mode==="stuck"){const [e,c]=cellOf(d);S.dens[e][c]+=1;}}
    S.rot=(S.rot+1)%W.homes.length;
    W.poolStages.forEach((sts,pi)=>{let c=0;sts.forEach((st,k)=>{if(S.t>=st.t){c+=st.cap;if(S.t===st.t&&k>0)S.events.push({t:S.t,type:"stage",pool:pi,label:st.label});}});poolCap[pi]=c;S.capSum[pi]+=c;S.usedMin[pi]=0;
      // 枠の繰り越しは500人単位の端数調整に必要な分（1点＝500人ぶん）までに限る。空席で出た列車の枠を長くためておくことはしない
      const lim=Math.max(1,c);const nv=poolAcc[pi]+c;if(nv>lim){S.discard[pi]+=nv-lim;}poolAcc[pi]=Math.min(nv,lim);
      if(poolAcc[pi]>S.accMax[pi])S.accMax[pi]=poolAcc[pi];
      if(S.used[pi]>S.capSum[pi]+1e-9)S.borrow[pi]++;});
    for(const h of W.hubs){
      let exitB=CFG.HUB_EXIT,inB=CFG.STATION_IN;
      for(let j=0;j<W.homes.length*2;j++){const m=W.homes[(j+S.rot)%W.homes.length];const isF=j>=W.homes.length;const L=(isF?S.forced:S.waiting)[h][m];const key=isF?m+'*':m;
        if(relAcc[h][key]==null)relAcc[h][key]=0;
        const cl=cls(W.walk[h][m].km);const rp=railRoute(h,m);const ph=policy[h]||{};
        // 電車で帰れる人は「電車で帰す」のときだけ駅へ。電車で帰れない人は、その色が「歩いて帰す」のときだけ歩く
        // 待つ場所のない人：一時滞在施設が開く（発災から約6時間）までは駅前の広場などで待ち、開いたときに入れなかった人が歩き出す
        const allowed=isF?S.t>=CFG.SHELTER_OPEN:(rp?ph.r==="go":ph[cl]==="go");
        if(!L.length||!allowed){relAcc[h][key]=0;continue;}relAcc[h][key]+=Math.max(0.5,(rp?CFG.RUSH:CFG.RELEASE)*L.length);
        if(rp){while(relAcc[h][key]>=1&&L.length&&inB>=1){relAcc[h][key]--;inB--;const d=L.shift();d.mode="approach";d.legs=rp.legs;d.rkm=rp.km;d.rp=0;
            d.qAt=S.t+CFG.APPROACH_MIN+Math.floor(rng()*CFG.APPROACH_SPREAD);S.approach[h].push(d);}}
        else{while(relAcc[h][key]>=1&&L.length&&exitB>=1){relAcc[h][key]--;exitB--;const d=L.shift();if(d.homeless&&!d.sheltered&&!d.counted){d.counted=true;S.stats.forcedWalk++;}startWalk(d);}}
      }
      const A=S.approach[h];for(let i=0;i<A.length;){if(S.t>=A[i].qAt){const d=A.splice(i,1)[0];d.mode="queue";d.qAt=S.t;S.queue[h].push(d);}else i++;}
    }
    // ---- 乗車：駅の処理順で有利不利が出ないよう、すべての駅（と背景の利用者）の乗車待ちを、ホームに着いた順に並べて乗せる（先着順）
    {const cand=[];for(const h of W.hubs)if(S.t>=S.hubSusp[h])S.queue[h].forEach(d=>cand.push(d));
     for(const b of S.bg)while(b.next<b.times.length&&b.times[b.next]<=S.t){b.wait.push({qAt:b.times[b.next],ps:b.ps,bg:b});b.next++;}
     for(const b of S.bg)b.wait.forEach(x=>cand.push(x));
     cand.sort((a,b)=>a.qAt-b.qAt||(a.id||0)-(b.id||0));
     const psOf=d=>d.ps||(d.ps=[...new Set(d.legs.map(l=>W.linePool[l.line]))].filter(p=>!W.poolUnl[p]));
     for(const d of cand){const ps=psOf(d);if(ps.some(p=>poolAcc[p]<1))continue;ps.forEach(p=>{poolAcc[p]--;S.used[p]++;S.usedMin[p]++;});
       if(d.bg){d.bg.wait.splice(d.bg.wait.indexOf(d),1);d.bg.boarded++;S.stats.boardBg=(S.stats.boardBg||0)+1;}
       else{const Q=S.queue[d.hub];Q.splice(Q.indexOf(d),1);d.mode="rail";S.stats.boardHub=(S.stats.boardHub||0)+1;}}}
    for(const h of W.hubs){const Q=S.queue[h];
      if(Q.length>S.stationMax[h]&&S.t>=S.hubGrace[h]){S.hubSusp[h]=S.t+CFG.SUSPEND;S.hubGrace[h]=S.t+CFG.SUSPEND+CFG.GRACE;
        // あふれた人はあきらめて歩き出す
        const over=Q.splice(Math.floor(S.stationMax[h]*0.6));over.forEach(d=>{d.gaveUp=true;S.stats.gaveUp=(S.stats.gaveUp||0)+1;startWalk(d);});
        S.stats.jams++;S.events.push({t:S.t,type:"jam",hub:h,gaveUp:over.length});S.marks.jam[h]=(S.marks.jam[h]||0)+1;S.log.push({t:S.t,type:'jam',hub:h,gaveUp:over.length});}
      if(S.hubSusp[h]===S.t)S.events.push({t:S.t,type:"unjam",hub:h});
    }
    W.poolIds.forEach((_,p)=>{if(S.used[p]>S.capSum[p]+1e-9)S.borrow[p]++;if(S.usedMin[p]>S.usedMax[p])S.usedMax[p]=S.usedMin[p];if(poolCap[p]>S.capMax[p])S.capMax[p]=poolCap[p];});
    let stuckNow=0;
    for(const d of S.dots){
      if(d.mode==="walk"||d.mode==="stuck"){const [e,c]=cellOf(d);let f=speedAt(e,c);
        if(d.mode==="stuck"){const resting=((S.t+d.phase)%CFG.REST_CYCLE)>=CFG.REST_WALK;f=resting?0:f*CFG.TIRED_V;}
        const mv=CFG.V0*f;d.walked+=mv;const pi0=d.pi;if(advance(d,mv*d.scale)){arrive(d);continue;}
        if(d.mode==="walk"&&d.walked>=d.stamina){d.mode="stuck";if(!d.everStuck){d.everStuck=true;S.stats.stuckEver++;
          const [ee,cc]=cellOf(d);const k=ee+':'+cc;S.marks.tired[k]=(S.marks.tired[k]||0)+1;if(S.stats.stuckEver===1)S.log.push({t:S.t,type:'tired',e:ee});}}
        if(d.pi>pi0&&S.running.some(x=>x)){const ps=d.path[d.pi-1];const pe=W.edges[ps.e];const node=ps.dir>0?pe.b:pe.a;
          const rp=railRoute(node,d.home);if(rp){const ps=[...new Set(rp.legs.map(l=>W.linePool[l.line]))].filter(p=>!W.poolUnl[p]);
            // 途中の駅から乗る人も、その先の列車の空きを使う（空きがなければ歩き続ける）
            if(!ps.some(p=>poolAcc[p]<1)){ps.forEach(p=>{poolAcc[p]--;S.used[p]++;S.usedMin[p]++;});S.stats.boardMid=(S.stats.boardMid||0)+1;d.mode="rail";d.legs=rp.legs;d.rkm=rp.km;d.rp=0;continue;}}}}
      else if(d.mode==="rail"){d.rp+=CFG.RAIL_V;if(d.rp>=d.rkm)arrive(d);}
      if(d.mode==="stuck")stuckNow++;
    }
    S.stats.stuckNow=stuckNow;
    if(S.SC==='shuto'){if(S.t===CFG.T72)S.events.push({t:S.t,type:"t72"});
      if(S.t>=CFG.T72+CFG.STOCK_GRACE)for(const h of W.hubs)for(const m of W.homes)for(const d of S.waiting[h][m])if(!d.over){d.over=true;S.stats.over++;}}
    while(ambSched.length&&ambSched[0].t<=S.t){const s=ambSched.shift();const c=W.corridors[s.c];amb.push({path:c.path,pi:0,p:0,km:c.km,t0:S.t,c:s.c,done:false});}
    for(const a of amb){if(a.done)continue;const s=a.path[a.pi];const e=W.edges[s.e];const u=s.dir>0?a.p:e.km-a.p;
      const cc=Math.min(e.cells-1,Math.floor(u/CFG.CELL));const v=CFG.AMB_V*Math.max(0.03,1-(S.dens[s.e][cc]/CFG.CELL)/(CFG.KJ*0.5));
      if(v<CFG.AMB_V*0.5){const k=s.e+':'+cc;if(!S.marks.amb[k])S.log.push({t:S.t,type:'amb',e:s.e});S.marks.amb[k]=(S.marks.amb[k]||0)+1;}
      if(advance(a,v)){a.done=true;S.stats.ambDone++;S.stats.ambDelay+=Math.max(0,(S.t-a.t0)-a.km/CFG.AMB_V);}}
    if(S.stats.home===S.dots.length||S.t>=T_END){S.done=true;for(const a of amb)if(!a.done)S.stats.ambDelay+=Math.max(0,(S.t-a.t0)-a.km/CFG.AMB_V);}
  }
  // 最初の時点で施設に入れなかった待つ場所のない人を数える
  return {S,step,railRoute,cellOf,T_END};
}
if(typeof module!=="undefined")module.exports={CFG,buildWorld,createSim,tmin,T0,mulberry32,railPath};
