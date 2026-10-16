/* Generate previews with the actual game background code and a native Canvas 2D backend.
 * This is not a browser playtest. No artist approximation or alternate planet shader is used.
 * Install @napi-rs/canvas outside the project and set CANVAS_RENDER_MODULE to that module directory.
 * node tools/background-preview.js [--bundle] writes assets/art/backgrounds/ previews + validation.
 */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'assets/art/backgrounds');
const {createCanvas,GlobalFonts}=require(process.env.CANVAS_RENDER_MODULE || '@napi-rs/canvas');
if(process.env.WINDIR) {
  for(const font of ['msyh.ttc','msyhbd.ttc','segoeui.ttf']) {
    const file=path.join(process.env.WINDIR,'Fonts',font);
    if(fs.existsSync(file))GlobalFonts.registerFromPath(file);
  }
}
const bundle=process.argv.includes('--bundle');
let source=fs.readFileSync(path.join(ROOT,'js/background.js'),'utf8');
if(bundle) {
  const html=fs.readFileSync(path.join(ROOT,'dist/星际突袭.html'),'utf8');
  source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('/* ===== js/background.js ===== */'));
  assert(source,'Bundled background module not found');
}
const canvas=createCanvas(600,900),ctx=canvas.getContext('2d');
const G={W:600,H:900,state:'playing',time:0,ctx,boss:{state:{boss:null}}};
const sandbox={console,Game:G,performance,__rngCalls:0,
  document:{createElement(tag){assert.strictEqual(tag,'canvas');return createCanvas(1,1);}},
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
// Execute in this realm: VM global-proxy lookups distort millions of noise Math calls.
const guardedMath=Object.create(Math);
guardedMath.random=()=>{sandbox.__rngCalls++;throw new Error('Background used gameplay Math.random');};
new Function('window','document','Math',source)(sandbox,sandbox.document,guardedMath);
const B=G.background;
assert(B&&B.draw&&B.update&&B.reset&&B.resize,'Background API incomplete');
const configs=[
  ['hive','钢铁蜂巢','#ffc46b'],['reaver','虚空掠夺者','#c98cff'],['dread','熔核巨舰','#ff8a5c'],
  ['arbiter','深空仲裁者','#8fe9ff'],['endwalker','终焉之影','#a06ad0'],['devourer','噬星者','#ffd166'],
];
fs.mkdirSync(OUT,{recursive:true});
const report={renderer:'@napi-rs/canvas',source:bundle?'built single-file':'js/background.js',scope:'actual background draw code, not a browser playtest',timings:{},checks:[],backgrounds:[]};
function frame(dt=1/60){G.time+=dt;B.update(dt);B.draw(ctx);}
function luminanceStats() {
  const pixels=ctx.getImageData(0,0,G.W,G.H).data;
  let sum=0,bright=0,lowerBright=0,lower=0;
  for(let y=0;y<G.H;y++)for(let x=0;x<G.W;x++) {
    const i=(y*G.W+x)*4;
    const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
    sum+=l;if(l>145)bright++;
    if(y>G.H*.6){lower++;if(l>100)lowerBright++;}
  }
  return {mean:+(sum/(G.W*G.H)).toFixed(2),brightFraction:+(bright/(G.W*G.H)).toFixed(4),lowerBrightFraction:+(lowerBright/lower).toFixed(4)};
}
function save(name){fs.writeFileSync(path.join(OUT,name),canvas.toBuffer('image/png'));}
B.reset();B.resize(G.W,G.H);
let t=performance.now();frame();report.timings.skyColdMs=+(performance.now()-t).toFixed(2);
for(let i=0;i<120;i++)B.update(1/60);B.draw(ctx);
save('deep-space.png');
const clearSky=luminanceStats();
assert(clearSky.mean<65,'Sky too bright for combat');
report.backgrounds.push({id:'deep-space',...clearSky});
const snapshots=[];
for(const [id,name,color] of configs) {
  B.reset();G.boss.state.boss={def:{id},dead:false};
  t=performance.now();frame();report.timings[id+'ColdMs']=+(performance.now()-t).toFixed(2);
  for(let i=0;i<240;i++)B.update(1/60);
  t=performance.now();for(let i=0;i<60;i++)frame();report.timings[id+'WarmFrameMs']=+((performance.now()-t)/60).toFixed(3);
  const lum=luminanceStats();
  assert(lum.mean<70,id+' background washed out');
  assert(lum.lowerBrightFraction<.05,id+' foreground combat area too bright');
  save('planet-'+id+'.png');
  const image=createCanvas(G.W,G.H);image.getContext('2d').drawImage(canvas,0,0);
  snapshots.push({id,name,color,image});
  report.backgrounds.push({id,name,...lum,layout:B.layout(id,G.W,G.H)});
}
assert.strictEqual(sandbox.__rngCalls,0);
report.checks.push('zero gameplay RNG calls','actual sky + all six planet texture paths','background luminance limits','transparent/native texture compositing');
// No creation/render regeneration should be needed during steady-state draws.
const observedBefore=B.debug?JSON.stringify(B.debug):null;
for(let i=0;i<60;i++)frame();
report.steadyStateDebugBefore=observedBefore;
report.steadyStateDebugAfter=B.debug?JSON.stringify(B.debug):null;
assert.strictEqual(report.steadyStateDebugBefore,report.steadyStateDebugAfter,'Steady frames regenerated texture caches');
assert(B.debug.pixelTextures===7 && B.debug.cachedPlanets===6 && B.debug.skyBuilds===1,'Native texture coverage incomplete');
report.checks.push('exactly seven real pixel textures; steady-state cache reuse');
// Test context state preservation on the native backend, not a no-op Canvas mock.
ctx.globalAlpha=.37;ctx.globalCompositeOperation='source-over';ctx.setTransform(1.4,0,0,1.4,7,9);
const before=ctx.getTransform();B.draw(ctx);const after=ctx.getTransform();
assert(Math.abs(ctx.globalAlpha-.37)<.01,'Background leaked alpha');
for(const key of ['a','b','c','d','e','f'])assert.strictEqual(before[key],after[key],'Background leaked transform');
ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
report.checks.push('native Canvas alpha + DPR transform restored');
// Window resizing must not lose the current planet or produce invalid geometry.
const sizes=[[360,740],[1280,720],[1920,1080],[320,568]];
for(const [w,h] of sizes){G.W=w;G.H=h;canvas.width=w;canvas.height=h;B.resize(w,h);frame();assert(Number.isFinite(B.state.alpha));}
report.checks.push('portrait/landscape resize');
// Readability illustration: actual background plus explicitly labeled sample bullets/ship.
G.W=600;G.H=900;canvas.width=600;canvas.height=900;B.resize(600,900);B.reset();
G.boss.state.boss={def:{id:'devourer'},dead:false};for(let i=0;i<240;i++)B.update(1/60);B.draw(ctx);
// Clearly label the readability overlay as an illustration, not an actual playthrough.
ctx.save();ctx.strokeStyle='#ff687d';ctx.lineWidth=1.5;
for(let i=0;i<22;i++){const x=45+(i*73)%510,y=280+(i*91)%430;ctx.fillStyle='#ed526b';ctx.beginPath();ctx.arc(x,y,3.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe0ce';ctx.fillRect(x-1,y-1,2,2);}
ctx.fillStyle='#92d5e1';for(let i=0;i<9;i++)ctx.fillRect(283+(i%3)*15,300+Math.floor(i/3)*140,1.5,13);
ctx.fillStyle='#c5e7eb';ctx.beginPath();ctx.moveTo(300,747);ctx.lineTo(317,782);ctx.lineTo(300,776);ctx.lineTo(283,782);ctx.closePath();ctx.fill();ctx.restore();
ctx.fillStyle='rgba(4,9,18,0.78)';ctx.fillRect(22,22,556,64);ctx.font='bold 19px "Microsoft YaHei"';ctx.fillStyle='#dbe7ec';ctx.fillText('背景与弹幕对比示意',38,49);ctx.font='12px "Microsoft YaHei"';ctx.fillStyle='#91a6b7';ctx.fillText('真实背景代码 + 示例弹幕；非实战截图',38,71);
save('readability-preview.png');
const sheet=createCanvas(1880,1476),s=sheet.getContext('2d');s.fillStyle='#080d17';s.fillRect(0,0,sheet.width,sheet.height);
s.font='bold 32px "Microsoft YaHei"';s.fillStyle='#e1eaf0';s.fillText('星际突袭 · 六位 Boss 的星球背景',36,54);
s.font='16px "Microsoft YaHei"';s.fillStyle='#8b9db1';s.fillText('同一套游戏背景代码渲染 · 星球按Boss配色、尺寸与材质区分 · 背景不参与碰撞',38,88);
for(let i=0;i<snapshots.length;i++){
  const a=snapshots[i],x=36+(i%3)*616,y=114+Math.floor(i/3)*668;
  s.fillStyle='#101a29';s.fillRect(x,y,592,644);
  // Square crop of the upper battlefield: preserve aspect ratio so spheres stay round.
  s.drawImage(a.image,0,0,600,600,x+12,y+12,568,568);
  s.fillStyle=a.color;s.font='bold 22px "Microsoft YaHei"';s.fillText(a.name,x+19,y+612);
  s.font='13px "Microsoft YaHei"';s.fillStyle='#8199ad';s.fillText('planet-'+a.id+'.png',x+19,y+635);
}
fs.writeFileSync(path.join(OUT,'boss-planets-sheet.png'),sheet.toBuffer('image/png'));
report.status='passed';
fs.writeFileSync(path.join(OUT,'render-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('Background previews saved to assets/art/backgrounds');
