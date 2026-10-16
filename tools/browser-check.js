/* Real Microsoft Edge browser regression and screenshot capture.
 * Optional dev dependency: playwright-core installed outside the repository.
 * Set BROWSER_TEST_MODULE to its directory; EDGE_PATH may override Edge location.
 * Direct stdio-inherit launch + CDP avoids subprocess pipe capture in confined Windows environments.
 */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),net=require('net');
const {spawn}=require('child_process');
const assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'artifacts/browser');
const {chromium}=require(process.env.BROWSER_TEST_MODULE||'playwright-core');
const edge=process.env.EDGE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probeOnly=process.argv.includes('--probe');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  let url;
  try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){res.writeHead(400);res.end();return;}
  if(url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=path.resolve(ROOT,'.'+(url==='/'?'/index.html':url));
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const port=await freePort();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'starstrike-edge-'));
  let child,browser,exitCode=null;
  const report={browser:'Microsoft Edge (real Chromium browser, headless)',scope:'real pointer/keyboard play plus explicit debug-spawn coverage for late Boss phases; not a complete unaided 60-level run',checks:[],screenshots:[],errors:[]};
  const check=(name,condition=true)=>{assert(condition,name);report.checks.push(name);console.log('PASS: '+name);};
  try{
    child=spawn(edge,['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','about:blank'],{stdio:'inherit'});
    child.on('exit',code=>{exitCode=code;});
    child.on('error',err=>{exitCode=-1;console.error('Browser launch error:',err.message);});
    let endpoint;
    for(let i=0;i<100;i++){
      if(exitCode!==null)throw new Error('Edge exited before CDP became available: '+exitCode);
      try{const r=await fetch('http://127.0.0.1:'+port+'/json/version');if(r.ok){endpoint=await r.json();break;}}catch(_){}
      await sleep(100);
    }
    assert(endpoint,'Edge did not expose CDP in time');
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
    report.version=browser.version();
    const context=await browser.newContext({viewport:{width:1100,height:800},deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',err=>report.errors.push(err.message));
    page.on('console',msg=>{if(msg.type()==='error')report.errors.push(msg.text());});
    page.on('response',res=>{if(res.status()>=400)report.errors.push(res.status()+' '+res.url());});
    await page.goto(base+'/index.html?debug=1');
    await page.waitForFunction(()=>window.Game&&Game.background&&Game.player);
    if(probeOnly){check('real browser loads and renders game');await page.screenshot({path:path.join(OUT,'browser-probe.png')});return;}
    // Integration-specific assertions and playthrough steps are below.
    await runChecks({page,context,browser,base,report,check});
    check('no browser JS errors or missing normal assets',report.errors.length===0);
    report.status='passed';
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }catch(err){report.status='failed';report.failure=err.stack||String(err);fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');throw err;}
  finally{
    if(browser){try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch(_){}try{await browser.close();}catch(_){}}
    if(child&&exitCode===null)child.kill();
    await new Promise(r=>server.close(r));
    // Only this test's isolated temporary profile is removed; never touches a user's Edge profile.
    try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){}
  }
}
async function runChecks({page,context,browser,base,report,check}) {
  const shot=async(name,p=page)=>{await p.screenshot({path:path.join(OUT,name+'.png')});report.screenshots.push(name+'.png');};
  const loaded=await page.evaluate(async()=>{const s=await Game.art.ready;return {total:s.total,loaded:s.loaded,failed:s.failed,pending:s.pending};});
  check('all 21 source textures actually load and decode in Edge',loaded.total===21&&loaded.loaded===21&&loaded.failed===0);
  report.sourceTextures=loaded;
  await page.click('#btn-start');
  await page.waitForFunction(()=>Game.state==='playing'&&Game.art.entries.player.draws>0);
  const x0=await page.evaluate(()=>Game.player.x);
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(350);await page.keyboard.up('ArrowLeft');
  const x1=await page.evaluate(()=>Game.player.x);
  check('real keyboard input moves the PNG player',x1<x0-40);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(4500);
  check('normal gameplay emits bullets and draws enemy PNGs',await page.evaluate(()=>Game.art.entries.player.draws>30&&Game.art.status().entries.some(e=>['scout','zigzag','gunship'].includes(e.id)&&e.draws>0)));
  await shot('01-normal-play');
  await page.keyboard.press('KeyP');await page.waitForFunction(()=>Game.state==='paused');
  const paused=await page.evaluate(()=>({time:Game.time,background:JSON.stringify(Game.background.state),x:Game.player.x}));
  await page.waitForTimeout(350);
  check('pause freezes real browser gameplay and background',await page.evaluate(p=>Game.time===p.time&&JSON.stringify(Game.background.state)===p.background&&Game.player.x===p.x,paused));
  await page.click('#btn-resume');await page.waitForFunction(()=>Game.state==='playing');
  // Controlled late-game setup: exercise real render/update/collision paths without claiming a 60-level natural run.
  async function bossScene(p,level){
    await p.evaluate(lv=>{
      Game.startGame();Game.enemies.list.length=0;Game.enemies.wave.queue.length=0;Game.enemies.wave.gap=9999;Game.enemies.wave.banner=null;
      Game.level=lv;Game.enemies.wave.level=lv;Game.player.invuln=999;Game.boss.start(lv);
    },level);
    await p.waitForFunction(()=>Game.background.state.alpha>0.5&&!Game.boss.state.boss.entering&&Game.boss.state.boss.fightT>2.2,{},{timeout:12000});
  }
  // All enemy variants in a frozen diagnostic formation, real PNG draw paths and overlays.
  await page.evaluate(()=>{
    Game.startGame();Game.enemies.list.length=0;Game.enemies.wave.queue.length=0;Game.enemies.wave.banner=null;Game.enemies.wave.gap=9999;
    Object.keys(Game.enemies.TYPES).forEach((id,i)=>{
      const e=Game.enemies.spawn(id,120+i*140,{y:220,noScale:true,forceElite:i===3});e.y=220;e.dotStacks=i===5?8:0;e.hp*=.7;
    });Game.player.invuln=0;Game.player.power.shield=5;Game.state='paused';
  });
  await page.waitForTimeout(100);
  check('all seven enemy PNGs and elite overlay draw in real browser',await page.evaluate(()=>Object.keys(Game.enemies.TYPES).every(id=>Game.art.entries[id].draws>0)&&Game.art.entries['elite-overlay'].draws>0));
  await shot('02-enemy-formation');
  const bossIds=['hive','reaver','dread','arbiter','endwalker','devourer'];
  for(let i=0;i<bossIds.length;i++){
    const id=bossIds[i];await bossScene(page,(i+1)*10);
    const data=await page.evaluate(()=>({id:Game.boss.state.boss.def.id,bg:Game.background.state.currentId,alpha:Game.background.state.alpha,alive:Game.player.alive}));
    check(id+' matches its planet during live Boss fight',data.id===id&&data.bg===id&&data.alpha>.5&&data.alive);
    await page.evaluate(()=>{Game.player.invuln=999.91;});
    await shot('boss-'+id);
    await page.evaluate(()=>{const b=Game.boss.state.boss;b.hp=b.maxHp*.25;});
    await page.waitForFunction(()=>Game.boss.state.boss.phase===3);
    check(id+' transitions to phase 3 without losing its sprite',await page.evaluate(id=>Game.art.entries[id==='arbiter'?'arbiter-hull':id==='devourer'?'devourer-hull':id].draws>0&&Game.boss.state.boss.phase===3,id));
    if(id==='endwalker'){
      await page.evaluate(()=>{const b=Game.boss.state.boss;b.cloaked=false;b.cloakT=0;});
      await page.waitForFunction(()=>Game.boss.state.boss.cloaked&&Game.boss.state.boss.alpha<.6);
      check('endwalker cloak still affects sprite visibility');await shot('boss-endwalker-cloaked');
    }
  }
  check('compact Boss header replaces the duplicate HTML level title',!(await page.locator('#hud-level').isVisible()));
  check('independent rotating Boss layers are drawn, not static fallback',await page.evaluate(()=>['arbiter-outer-ring','arbiter-inner-ring','arbiter-hull','devourer-armor-ring','devourer-intake-iris','devourer-hull'].every(id=>Game.art.entries[id].draws>0)));
  await page.evaluate(()=>{const b=Game.boss.state.boss;Game.boss.areaDamage(b.x,b.y,1000,b.maxHp*2);});
  await page.waitForFunction(()=>Game.background.state.currentId===null);
  // Upgrade menus correctly freeze the fade; consume each pending offer via the real key binding.
  for(let i=0;i<65;i++) {
    if(await page.evaluate(()=>Game.state==='upgrade'))await page.keyboard.press('Digit1');
    if(await page.evaluate(()=>Game.background.state.previousAlpha===0))break;
    await page.waitForTimeout(150);
  }
  check('Boss death eventually clears the planet',await page.evaluate(()=>Game.background.state.currentId===null&&Game.background.state.previousAlpha===0));
  await page.evaluate(()=>Game.toMenu());
  check('menu has no stale Boss or planet',await page.evaluate(()=>Game.state==='menu'&&!Game.boss.state.boss&&Game.background.state.currentId===null));
  await page.click('#btn-start');
  await page.evaluate(()=>{Game.player.invuln=0;Game.player.power.shield=0;Game.lives=1;Game.player.hit();});
  await page.waitForFunction(()=>Game.state==='gameover');
  await page.click('#btn-restart');await page.waitForFunction(()=>Game.state==='playing');
  check('gameover/restart keeps textures ready without reloading',await page.evaluate(()=>Game.art.status().loaded===21&&Game.art.status().pending===0&&!Game.boss.state.boss));
  // Phone-sized viewport and pointer movement, DPR=2 on a separate touch context.
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mp=await mobile.newPage();mp.on('pageerror',e=>report.errors.push('mobile: '+e.message));
  await mp.goto(base+'/index.html');await mp.evaluate(()=>Game.art.ready);await mp.tap('#btn-start');
  await mp.waitForTimeout(300);
  const touch=await mobile.newCDPSession(mp);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:285,y:670}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y:600}]});
  await mp.waitForTimeout(350);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('touch-sized browser accepts pointer movement',await mp.evaluate(()=>Game.player.x>210&&Game.player.y<700));
  await bossScene(mp,60);await shot('03-mobile-boss',mp);
  check('DPR2 portrait canvas dimensions and art are valid',await mp.evaluate(()=>Game.canvas.width===Math.round(Game.W*2)&&Game.art.status().loaded===21));
  await mp.setViewportSize({width:844,height:390});await mp.waitForTimeout(300);
  check('orientation resize preserves active Boss and planet',await mp.evaluate(()=>Game.W===844&&Game.background.state.currentId==='devourer'&&Game.boss.active()));
  await shot('04-landscape-boss',mp);await mobile.close();
  // Deliberately broken image requests must retain a playable Canvas body.
  const broken=await browser.newContext({viewport:{width:600,height:800}});const fp=await broken.newPage();
  const fallbackErrors=[];fp.on('pageerror',e=>fallbackErrors.push(e.message));
  await fp.route('**/assets/art/runtime/*.png',route=>route.abort());
  await fp.goto(base+'/index.html');await fp.evaluate(()=>Game.art.ready);await fp.click('#btn-start');
  await fp.waitForTimeout(900);
  check('failed PNG requests fall back without JS errors or blocking play',await fp.evaluate(()=>Game.state==='playing'&&Game.player.alive&&Game.art.status().failed===21&&Game.art.status().fallbacks>0)&&fallbackErrors.length===0);
  await shot('05-image-failure-fallback',fp);await broken.close();
  // file:// plus offline context proves the distributable has no network/image dependency.
  const offline=await browser.newContext({viewport:{width:1100,height:800},offline:true});const op=await offline.newPage();
  const network=[];op.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});op.on('pageerror',e=>report.errors.push('offline: '+e.message));
  await op.goto(require('url').pathToFileURL(path.join(ROOT,'dist/星际突袭.html')).href);
  const os=await op.evaluate(async()=>{const s=await Game.art.ready;return {loaded:s.loaded,total:s.total,embedded:s.entries.every(e=>e.src.startsWith('data:image/png;base64,'))};});
  check('offline single-file decodes all 21 embedded textures',os.loaded===21&&os.total===21&&os.embedded&&network.length===0);
  await op.click('#btn-start');await bossScene(op,40);await shot('06-offline-single-file',op);
  report.offlineTextures=os;await offline.close();
  report.drawCounts=await page.evaluate(()=>Game.art.status().entries.map(e=>({id:e.id,state:e.state,width:e.width,height:e.height,draws:e.draws})));
  await context.close();
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
