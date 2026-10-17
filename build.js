// src/ の各ファイルを1枚の index.html に組み立てる： node build.js
// 計算部分（データ・engine.js・policies.js）は目印のコメントで囲み、テストが同じコードを取り出して使えるようにする
const fs=require('fs');const r=f=>fs.readFileSync(__dirname+'/src/'+f,'utf8');
const strip=s=>s.replace(/if\(typeof module!=="undefined"\)module\.exports=\{[^}]*\};?/g,'');
const calc='/*@@CALC-BEGIN@@*/\nconst DATA='+r('data.json')+';\n'+strip(r('engine.js'))+'\n'+strip(r('policies.js'))+'\n/*@@CALC-END@@*/';
let h=r('shell.html').replace('/*ENGINE*/',()=>calc).replace('/*UI*/',()=>r('ui.js'));
fs.writeFileSync(__dirname+'/index.html',h);console.log('index.html を作成しました（'+h.length.toLocaleString()+' 文字）');
