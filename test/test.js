// 検証テスト： node test/test.js
// 公開する index.html の計算コードを、そのまま取り出して検証する
const M=require('./load.js')();
let fail=0;const ok=(c,msg)=>{console.log((c?'  OK   ':'  FAIL ')+msg);if(!c)fail++;};
const PER=M.DATA.meta.perDot;
const fmt=t=>{const a=t+M.T0;const d=Math.floor(a/1440);return (d===0?'当日':d===1?'発災翌日':'発災'+d+'日後')+String(Math.floor(a%1440/60)).padStart(2,'0')+':'+String(a%60).padStart(2,'0');};
const POLS={'ゲージ5割で少しずつ帰す':W=>M.polFeedback(W,0.5),'全員すぐ帰す':W=>()=>M.allPol(W,'go'),'発災翌日8:50に全駅を帰す':W=>S=>M.allPol(W,S.t>=M.tmin(2,8,50)?'go':'wait')};
function run(name,seed,reverse){const W=M.buildWorld(M.DATA,'east',1);if(reverse)W.hubs=W.hubs.slice().reverse();
  const sim=M.createSim(W,seed,{});const pol=POLS[name](W);const N=sim.S.dots.length;let drift=0,borrow=0,carry=0;
  while(!sim.S.done){sim.step(pol(sim.S,sim));if(sim.S.dots.length!==N)drift++;
    W.poolIds.forEach((_,i)=>{if(W.poolUnl[i])return;if(sim.S.used[i]>sim.S.capSum[i]+1e-9)borrow++;});}
  W.poolIds.forEach((_,i)=>{if(W.poolUnl[i])return;if(sim.S.accMax[i]>Math.max(1,sim.S.capMax[i])+1e-9)carry++;});
  return {W,st:sim.S.stats,N,drift,borrow,carry,bg:sim.S.bg};}
const results={};
for(const name of Object.keys(POLS)){console.log(`\n【${name}】`);const r=run(name,42,false);const st=r.st;
  results[name]={home:fmt(st.last),tired:st.stuckEver*PER,gaveUp:st.gaveUp*PER,mid:(st.boardMid||0)*PER};
  ok(r.drift===0,`人数のずれなし（点の総数 ${r.N}＝${(r.N*PER).toLocaleString()}人）`);
  ok(st.home===r.N,`全員が帰宅：${fmt(st.last)}`);
  ok(r.bg.every(x=>x.boarded===x.total),`背景の利用者が全員乗車（${(r.bg.reduce((s,x)=>s+x.total,0)*PER).toLocaleString()}人）`);
  ok(r.borrow===0,'輸送枠の前借りなし（毎分、使用累計 ≦ 供給累計）');
  ok(r.carry===0,'繰り越しは500人分（または1分の枠）まで');
  console.log(`         へとへと ${st.stuckEver*PER}人／あきらめて歩いた ${st.gaveUp*PER}人／途中駅で乗車 ${(st.boardMid||0)*PER}人`);}
// 既知の課題の測定（合否には含めない）：駅の処理順による偏り
console.log('\n【参考：駅の処理順による偏り（既知の課題・合否に含めない）】');
for(const name of Object.keys(POLS)){const a=[],b=[];for(let s=1;s<=8;s++){a.push(run(name,s,false).st.last);b.push(run(name,s,true).st.last);}
  const m=x=>x.reduce((p,q)=>p+q,0)/x.length,v=x=>x.map(y=>(y-m(x))**2).reduce((p,q)=>p+q,0)/(x.length-1);
  console.log(`  ${name}：逆順との全員帰宅の平均の差 ${(m(b)-m(a)).toFixed(1)}分（標準誤差 ${Math.sqrt(v(a)/8+v(b)/8).toFixed(1)}分、乱数8通り）`);}
if(process.argv.includes('--json'))console.log(JSON.stringify(results));
console.log(fail?`\n${fail} 件の失敗`:'\nすべて合格');process.exit(fail?1:0);
