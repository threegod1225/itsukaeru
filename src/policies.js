/* 参考解（最善に近い帰し方）の候補と、採点 */
function greedyShelters(W,sim){const hl={};W.hubs.forEach(h=>hl[h]=0);sim.S.dots.forEach(d=>{if(d.homeless)hl[d.hub]++;});
  const cap=h=>Math.round(W.D.hubParams[h].capSaitama/W.D.meta.perDot);
  return [...W.hubs].sort((a,b)=>Math.min(hl[b],cap(b))-Math.min(hl[a],cap(a))).slice(0,3);}
function townOrder(W){return [...W.homes].sort((a,b)=>W.walk.tokyo[a].km-W.walk.tokyo[b].km);}

// 練習ステージ：地図の一部だけを切り出す
const STAGES={
  p1:{name:'練習1：南北線（埼玉高速鉄道直通）だけで帰す',short:'練習1',hubs:['nagatacho'],homes:['kawaguchi','misono'],rails:['sr7'],start:[1,21,0],
      goal:'21:20に南北線（埼玉高速鉄道直通）が動きます。永田町駅の🚃を入れたり切ったりして、駅をあふれさせずに帰しましょう。'},
  p2:{name:'練習2：2つの駅で路線を分け合う',short:'練習2',hubs:['ikebukuro','nagatacho'],homes:['toda','warabi','urawa','omiya','kawaguchi','misono'],rails:['sr7','yurakucho','saikyo','shonan','keihin'],start:[2,8,30],
      goal:'池袋と永田町（有楽町線で池袋へ）の人が、同じ埼京線・湘南新宿ラインを使います。両方の駅のゲージを見て帰しましょう。家まで10km未満（青）の人は歩いても帰れます。'}};
function subsetData(D,st){const keepN=new Set([...st.hubs,...st.homes]);const d=JSON.parse(JSON.stringify(D));
  Object.keys(d.nodes).forEach(k=>{if(!keepN.has(k))delete d.nodes[k];});
  d.roads=d.roads.filter(([a,b])=>keepN.has(a)&&keepN.has(b));
  d.rails=d.rails.filter(r=>st.rails.includes(r.id)).map(r=>({...r,stops:r.stops.filter(x=>keepN.has(x))})).filter(r=>r.stops.length>=2);
  const w={};st.hubs.forEach(h=>{w[h]={};st.homes.forEach(m=>w[h][m]=D.workers[h][m]||0);});d.workers=w;d.near={};
  const hp={};st.hubs.forEach(h=>hp[h]=D.hubParams[h]);d.hubParams=hp;d.odKmMeasured={};
  const nr={};st.homes.forEach(m=>{if(st.hubs.includes(D.nearRef[m]))nr[m]=D.nearRef[m];});d.nearRef=nr;return d;}
function allPol(W,v){const p={};W.hubs.forEach(h=>{p[h]={r:v,0:v,1:v,2:v};});return p;}
// 駅ごと：電車で帰れる人を、駅のゲージがしきい値未満のときだけ駅へ向かわせる。歩いて帰すのは walkCls の色だけ（walkFrom 以降）
function polFeedback(W,th,walkCls,walkFrom){return (S)=>{const p=allPol(W,'wait');
  for(const h of W.hubs){if((S.queue[h].length+S.approach[h].length)/S.stationMax[h]<th)p[h].r='go';
    if(walkCls)for(const c of walkCls)if(S.t>=walkFrom)p[h][c]='go';}
  return p;};}
// 首都直下：start以降、gap分おきに駅×色を1つずつ「歩いて帰す」に。電車はゲージを見て
function polStagger(W,start,gap,th){const order=[];[0,1,2].forEach(c=>W.hubs.forEach(h=>order.push([h,c])));
  return (S)=>{const p=allPol(W,'wait');W.hubs.forEach(h=>{if((S.queue[h].length+S.approach[h].length)/S.stationMax[h]<th)p[h].r='go';});
    order.forEach(([h,c],i)=>{if(S.t>=start+i*gap)p[h][c]='go';});return p;};}
function runSim(W,shel,pol,startT){const sim=createSim(W,42,{shelters:shel,startT:startT||W.startT||0});while(!sim.S.done)sim.step(pol(sim.S,sim));return sim;}
function homelessTotal(sim){return sim.S.dots.filter(d=>d.homeless).length;}
function metricsOf(W,sim){const s=sim.S.stats;return {homeN:s.home,last:sim.S.stats.home===sim.S.dots.length?s.last:sim.T_END+600,tired:s.stuckEver,amb:s.ambDelay,gaveUp:s.gaveUp,forced:s.forcedWalk,over:s.over,early:s.early,N:sim.S.dots.length,HL:homelessTotal(sim)};}
const WEIGHTS={east:{tired:.35,amb:.25,gaveUp:.25,last:.15},shuto:{amb:.5,over:.3,last:.2}};
function scoreOf(sc,you,base,ref,T_END){const w=WEIGHTS[sc];const parts={};
  const lin=(v,best,worst)=>worst<=best?(v<=best?1:0):Math.max(0,Math.min(1,(worst-v)/(worst-best)));
  for(const k of Object.keys(w)){let sc_;
    if(k==='last')sc_=lin(you.last,ref.last,T_END+600);
    else if(k==='gaveUp')sc_=lin(you.gaveUp,0,you.N*0.3);
    else if(k==='over')sc_=lin(you.over,0,you.N*0.2);
    else if(k==='forced')sc_=lin(you.forced,ref.forced,you.HL);
    else sc_=lin(you[k],ref[k],Math.max(base[k],ref[k]+1));
    parts[k]=sc_;}
  // 帰り着けなかった人がいる場合は、その割合だけ評価を下げる（待たせたままでは高得点にならない）
  const homeShare=you.homeN!=null?you.homeN/you.N:1;
  const total=Object.keys(w).reduce((a,k)=>a+w[k]*parts[k],0)*100*homeShare;return {total,parts,homeShare};}
function computeRef(W){
  const shel=W.hubs;
  const base=metricsOf(W,runSim(W,shel,()=>allPol(W,'go')));
  let cands;
  if(W.scenario==='shuto')cands=[[CFG.T72-1440,10],[CFG.T72-720,10],[CFG.T72,10],[CFG.T72,30]].map(([st,g])=>({g,st,pol:polStagger(W,st,g,0.5)}));
  else{const r0=Math.min(...W.resume.filter(x=>isFinite(x)&&x>0&&x>=tmin(2,0,0)));
    // 青（家まで10km未満）の人を歩かせる時刻は複数試す（地震直後・夕方・最初の電車の再開時）
    cands=[0.5,0.6].flatMap(g=>[{g,pol:polFeedback(W,g)},...[1,tmin(1,18,0),r0].map(wf=>({g,walk:[0],wf,pol:polFeedback(W,g,[0],wf)}))]);}
  let best=null;
  for(const c of cands){const m=metricsOf(W,runSim(W,shel,c.pol));
    const bad=m.tired/(base.tired+1)+m.amb/(base.amb+1)+m.gaveUp/m.N+m.forced/(m.HL+1)+m.over/m.N+m.early/m.N+(m.last-base.last)/2880;
    if(!best||bad<best.bad)best={bad,m,c};}
  return {base,ref:best.m,g:best.c.g,st:best.c.st,walk:best.c.walk,wf:best.c.wf,shel};}
if(typeof module!=="undefined")module.exports={subsetData,STAGES,allPol,greedyShelters,townOrder,polFeedback,polStagger,runSim,metricsOf,scoreOf,computeRef,WEIGHTS};
