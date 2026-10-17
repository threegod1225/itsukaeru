// 公開する index.html から計算部分（目印のコメントで囲んだ部分）をそのまま取り出して読み込む
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function(file){const html=fs.readFileSync(file||path.join(__dirname,'../index.html'),'utf8');
  const a=html.indexOf('/*@@CALC-BEGIN@@*/'),b=html.indexOf('/*@@CALC-END@@*/');if(a<0||b<0)throw new Error('計算部分の目印が見つかりません');
  const code=html.slice(a,b)+'\n;({DATA,CFG,T0,tmin,buildWorld,createSim,railPath,cls,allPol,polFeedback,runSim,metricsOf,scoreOf,computeRef,subsetData,STAGES,WEIGHTS})';
  const ctx=vm.createContext({console,Math,JSON,Set,Map,Infinity,NaN,Object,Array,Number,String,isFinite,Float32Array});
  return vm.runInContext(code,ctx,{filename:'index.html（計算部分）'});};
