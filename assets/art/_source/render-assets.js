'use strict';
// Development-only SVG rasterizer and catalog builder. Never loaded by the game.
// Install @resvg/resvg-js outside the project, then set ART_RENDER_MODULE to its directory.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { Resvg } = require(process.env.ART_RENDER_MODULE || '@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '../..');
const rows = [
  ['player','player','玩家截击机','AURORA MK.II','#80cfdd',1024,'up','陶瓷装甲 / 离子核心 / 双联炮'],
  ['enemies','scout','侦察机','SCOUT','#ff8a5c',1024,'down','轻型机身 / 侦察光学 / 单点射击'],
  ['enemies','zigzag','游走机','ZIGZAG','#c07dff',1024,'down','侧向推进 / 蛇形机动 / 瞄准射击'],
  ['enemies','gunship','炮艇','GUNSHIP','#ff5c7a',1024,'down','宽体装甲 / 多联炮组 / 扇形火力'],
  ['enemies','diver','冲角机','HORNET MK.II','#ffd166',1024,'down','俯冲矛尖 / 光学锁定 / 双推进器'],
  ['enemies','weaver','织网者','WEAVER','#5ce1e6',1024,'down','横向阵列 / 多点发射 / 弹幕布网'],
  ['enemies','splitter','分裂体','SPLITTER','#9ae66e',1024,'down','双核心 / 分离机舱 / 机械连接桥'],
  ['enemies','escort','护卫舰','ESCORT','#ff9de2',1024,'down','重装护卫 / 双段炮组 / 多层舷侧'],
  ['bosses','hive','钢铁蜂巢','IRON HIVE','#ffc46b',1536,'down','蜂巢机库 / 多瓣母舰 / 蜂群发射'],
  ['bosses','reaver','虚空掠夺者','VOID REAVER','#c98cff',1536,'down','镰形翼 / 跃迁核心 / 侧向突袭'],
  ['bosses','dread','熔核巨舰','MOLTEN DREAD','#ff8a5c',1536,'down','装甲城塞 / 三联重炮 / 熔核散热'],
  ['bosses','arbiter','深空仲裁者','ARBITER','#8fe9ff',1536,'radial','双机械环 / 中央菱体 / 旋转审判'],
  ['bosses','endwalker','终焉之影','ENDWALKER','#a06ad0',1536,'down','幽灵翼 / 虚空空腔 / 隐形阵列'],
  ['bosses','devourer','噬星者','STAR DEVOURER','#ffd166',1536,'radial','吞噬口 / 环状重甲 / 齿状聚能结构'],
  ['effects','elite-overlay','精英标识','ELITE OVERLAY','#edc877',1024,'none','独立金色环与星标 / 不含机身'],
];
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const entries = rows.map(([category,id,name,code,color,pixels,facing,description]) => ({category,id,name,code,color,pixels,facing,description,svg:`${category}/${id}.svg`,png:`${category}/${id}.png`}));
// Prefer a small known font set on Windows; avoid unrelated malformed system font faces.
const fontDir = process.env.WINDIR ? path.join(process.env.WINDIR,'Fonts') : null;
const fontFiles = fontDir ? ['msyh.ttc','msyhbd.ttc','segoeui.ttf','segoeuib.ttf','consola.ttf'].map(f=>path.join(fontDir,f)).filter(f=>fs.existsSync(f)) : [];
const opts = { font: {loadSystemFonts:!fontFiles.some(f=>f.endsWith('msyh.ttc')),fontFiles,defaultFontFamily:'Microsoft YaHei',sansSerifFamily:'Microsoft YaHei',monospaceFamily:'Consolas'},logLevel:'warn' };
function read(rel) {return fs.readFileSync(path.join(root,rel));}
function renderSvg(svg,width) {
  const r = new Resvg(svg,{...opts,fitTo:{mode:'width',value:width}});
  assert.deepStrictEqual(r.imagesToResolve(),[], 'External image dependency');
  return r.render();
}
function checkSprite(image,entry) {
  assert(image.width===entry.pixels && image.height===entry.pixels,'Wrong dimensions: '+entry.id);
  const p=image.pixels,w=image.width,h=image.height;
  let x0=w,y0=h,x1=-1,y1=-1,painted=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(p[(y*w+x)*4+3]>8) {
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);painted++;
  }
  assert(x1>=0,'Blank sprite: '+entry.id);
  assert(x0>0&&y0>0&&x1<w-1&&y1<h-1,'Sprite touches image boundary: '+entry.id);
  for(const [x,y] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]) assert(p[(y*w+x)*4+3]===0,'Opaque background: '+entry.id);
  return {alphaBoundsPixels:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},opaqueCoverage:+(painted/(w*h)).toFixed(4)};
}
const available = process.argv.includes('--available');
for(const entry of entries) {
  if(available && !fs.existsSync(path.join(root,entry.svg))) continue;
  const svg=read(entry.svg).toString('utf8');
  assert(!/<script\b|<foreignObject\b|\son\w+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|file:)/i.test(svg),'Active/external content: '+entry.svg);
  const image=renderSvg(svg,entry.pixels);
  Object.assign(entry,checkSprite(image,entry));
  const png=image.asPng();
  fs.writeFileSync(path.join(root,entry.png),png);
  entry.sha256=crypto.createHash('sha256').update(png).digest('hex');
  console.log(`${entry.svg} -> ${entry.png}: ${image.width}x${image.height}, transparent, ${png.length} bytes`);
}
if(available) process.exit(0);

// Compare the actual in-game ID lists to the asset catalog, not a hand-counted total.
const enemiesSource=fs.readFileSync(path.join(project,'js/enemies.js'),'utf8');
const enemyTable=enemiesSource.match(/const TYPES = \{([\s\S]*?)\n  \};/)[1];
const enemyIds=[...enemyTable.matchAll(/^\s*(\w+):\s*\{/gm)].map(m=>m[1]).sort();
const bossSource=fs.readFileSync(path.join(project,'js/boss.js'),'utf8');
const bossTable=bossSource.match(/const ROSTER = \[([\s\S]*?)\n  \];/)[1];
const bossIds=[...bossTable.matchAll(/\bid:\s*'([^']+)'/g)].map(m=>m[1]).sort();
assert.deepStrictEqual(entries.filter(a=>a.category==='enemies').map(a=>a.id).sort(),enemyIds);
assert.deepStrictEqual(entries.filter(a=>a.category==='bosses').map(a=>a.id).sort(),bossIds);

const pngUrl = entry => 'data:image/png;base64,'+read(entry.png).toString('base64');
function text(x,y,size,fill,value,extra='') {return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${escape(value)}</text>`;}
function drawSheet(file,title,subtitle,items,columns,cellW,cellH) {
  const gap=24,margin=40,header=142,footer=46,rows=Math.ceil(items.length/columns);
  const w=margin*2+columns*cellW+(columns-1)*gap,h=header+rows*cellH+(rows-1)*gap+footer;
  let body=`<rect width="${w}" height="${h}" fill="#09101d"/>`;
  body+=text(margin,42,17,'#7693ad','STAR STRIKE  /  MK.II ART COLLECTION');
  body+=text(margin,87,34,'#e1ebef',title,'font-weight="bold"');
  body+=text(margin,120,17,'#8ca5b9',subtitle);
  for(let i=0;i<items.length;i++) {
    const a=items[i],x=margin+(i%columns)*(cellW+gap),y=header+Math.floor(i/columns)*(cellH+gap);
    const imageSize=Math.min(cellW-52,cellH-158);
    body+=`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="8" fill="url(#panel)" stroke="#293c53"/>`;
    body+=`<rect x="${x+22}" y="${y+23}" width="3" height="18" fill="${a.color}"/>`;
    body+=text(x+35,y+37,16,a.color,`${String(i+1).padStart(2,'0')} / ${a.code}`);
    const ix=x+(cellW-imageSize)/2,iy=y+46;
    const src=a.id==='elite-overlay'?entries.find(z=>z.id==='scout'):a;
    body+=`<image x="${ix}" y="${iy}" width="${imageSize}" height="${imageSize}" href="${pngUrl(src)}"/>`;
    if(a.id==='elite-overlay')body+=`<image x="${ix}" y="${iy}" width="${imageSize}" height="${imageSize}" href="${pngUrl(a)}"/>`;
    body+=text(x+24,y+cellH-75,26,'#deeaee',a.name,'font-weight="bold"');
    body+=text(x+24,y+cellH-46,13,'#90aabd',a.description);
    body+=text(x+24,y+cellH-21,12,'#68879f',a.svg);
    const smallSize=a.category==='bosses'?48:32;
    body+=`<image x="${x+cellW-smallSize-22}" y="${y+cellH-smallSize-19}" width="${smallSize}" height="${smallSize}" href="${pngUrl(src)}"/>`;
  }
  body+=text(margin,h-17,13,'#70879d','透明 PNG + 可编辑 SVG  ·  原创矢量绘制  ·  已通过精简运行贴图接入游戏');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#18273b"/><stop offset="1" stop-color="#0e1828"/></linearGradient></defs><g font-family="Microsoft YaHei,Segoe UI,sans-serif">${body}</g></svg>`;
  const image=renderSvg(svg,w);
  fs.writeFileSync(path.join(root,'previews',file),image.asPng());
  console.log(`Preview ${file}: ${w}x${h}`);
}
fs.mkdirSync(path.join(root,'previews'),{recursive:true});
drawSheet('enemies-sheet.png','玩家与敌机 / 全部小怪机型','保留已认可的玩家机与冲角机，六款新机型按行为区分轮廓与配色。',entries.filter(a=>a.category!=='bosses'),3,540,580);
drawSheet('bosses-sheet.png','六位 BOSS / 独立旗舰设计','蜂巢母舰 · 镰翼掠夺者 · 装甲巨舰 · 双环仲裁者 · 虚空幽灵 · 吞噬核心',entries.filter(a=>a.category==='bosses'),3,680,754);
drawSheet('collection-overview.png','星际突袭 / 完整机库','1架玩家机 + 7种敌机 + 6位Boss + 独立精英标识',entries,5,340,380);
const manifest={schemaVersion:1,style:'MK.II hard-surface sci-fi',integratedIntoGame:true,assetCount:entries.length,notes:['SVG is the editable source; PNG is transparent RGBA.','Player faces up; enemies face down; circular bosses are radial.','Boss assets depict the base appearance, not three baked phase frames.','Elite overlay is independent; apply scale/rotation/effects at runtime.','Texture padding is not a collision radius. Do not infer gameplay hitboxes from image dimensions.'],assets:entries};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const report={status:'passed',coverage:{player:1,enemies:enemyIds,bosses:bossIds,overlays:1},checks:['game ID coverage','SVG parsed by resvg','no scripts or external references','square target dimensions','transparent corners','nonempty alpha bounds inside canvas','PNG SHA-256 recorded'],counts:{sprites:entries.length,previews:3}};
fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS: complete game roster, transparent sprites and catalogs.');
