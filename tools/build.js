/* ============================================================
   星际突袭 · 打包脚本  tools/build.js
   ------------------------------------------------------------
   产出两样东西：
     dist/星际突袭.html          单文件版（CSS/JS 全部内联，双击即玩）
     dist/flying-shooter-source.zip  源码压缩包（解压后双击 index.html）

   用法： node tools/build.js  [--keep-comments]

   单文件版默认会**去掉注释**（保留换行，所以报错行号和源码一致），
   体积能小一截；加 --keep-comments 可以打包带注释的版本便于调试。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_NAME = '星际突袭.html';
const ZIP_NAME = 'flying-shooter-source.zip';

const KEEP_COMMENTS = process.argv.indexOf('--keep-comments') !== -1;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* 注释标记用变量拼，避免写进本文件的注释里把注释提前闭合 */
const OPEN = '/' + '*';
const CLOSE = '*' + '/';

/* ============================================================
   一、去注释（安全版）
   ------------------------------------------------------------
   不做完整词法分析 —— 那要在字符串 / 正则 / 模板串之间来回判断，
   一旦判错就会把代码改坏。这里只处理**百分之百安全**的三种情况：

     ① 整行注释：行首（含缩进）就是双斜杠      → 整行清空
     ② 块注释：行首就是块注释开头，直到结束标记 → 只清注释、保留换行
     ③ 行尾注释：仅当这一行里没有任何引号时    → 只清注释那一段

   关键是**保留换行**，这样压缩后的报错行号和源码完全一致，
   出问题时还能对着源码看。
   ============================================================ */
function stripComments(src) {
  const lines = src.split('\n');
  const out = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    /* ---- ② 块注释内部 ---- */
    if (inBlock) {
      const end = line.indexOf(CLOSE);
      if (end === -1) { out.push(''); continue; }   // 整行都在块里
      inBlock = false;
      out.push(line.slice(end + 2));                // 结束标记之后可能还有代码
      continue;
    }

    /* ---- ① 整行双斜杠注释 ---- */
    if (trimmed.startsWith('//')) {
      out.push('');
      continue;
    }

    /* ---- ② 块注释开头 ---- */
    if (trimmed.startsWith(OPEN)) {
      const end = line.indexOf(CLOSE);
      if (end === -1) { inBlock = true; out.push(''); continue; }
      out.push(line.slice(0, line.indexOf(OPEN)) + line.slice(end + 2));
      continue;
    }

    /* 注意：绝不能把"行首是 *"的行当成 JSDoc 续行删掉！
       代码里大量存在乘法换行续写，例如
           S.dotPerStack = base
             * (1 + 0.25 * lv('dot_power'))
       这些行的行首就是 *。块注释内部的 * 行已经由上面的 inBlock 分支处理，
       所以这里不做任何额外判断 —— 曾经加过这条规则，结果把乘法删了。 */

    /* ---- ③ 行尾双斜杠注释：这一行没有任何引号才敢动 ---- */
    if (line.indexOf('//') !== -1 &&
        line.indexOf('"') === -1 &&
        line.indexOf("'") === -1 &&
        line.indexOf('`') === -1) {
      out.push(line.slice(0, line.indexOf('//')));
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

/* ============================================================
   二、单文件版
   ============================================================ */
function build() {
  let html = read('index.html');
  const inlined = [];

  /* ---- 1. 内联样式表 ---- */
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
    let css = read(href);
    if (css.indexOf('</style') !== -1) {
      throw new Error(href + ' 中含有 </style，无法安全内联');
    }
    if (!KEEP_COMMENTS) css = stripComments(css);
    inlined.push('css  ' + href);
    return '<style>\n/* ===== ' + href + ' ===== */\n' + css + '\n</style>';
  });

  /* ---- 2. 内联脚本（必须保持原有顺序） ---- */
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
    let js = read(src);
    if (js.indexOf('</script') !== -1) {
      throw new Error(src + ' 中含有 </script，无法安全内联');
    }
    if (!KEEP_COMMENTS) js = stripComments(js);
    inlined.push('js   ' + src);
    return '<script>\n/* ===== ' + src + ' ===== */\n' + js + '\n</script>';
  });

  /* ---- 3. 补上手机端需要的 meta 与图标 ---- */
  const favicon =
    "<link rel=\"icon\" href=\"data:image/svg+xml," +
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
    "%3Ctext y='.9em' font-size='90'%3E%F0%9F%9A%80%3C/text%3E%3C/svg%3E\" />";

  html = html.replace('</head>', [
    favicon,
    '<meta name="theme-color" content="#04060f" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '</head>',
  ].join('\n'));

  /* ---- 4. 自检：不能残留任何外部引用 ---- */
  const leftovers = html.match(/(?:src|href)="(?:js|css)\/[^"]*"/g);
  if (leftovers) {
    throw new Error('仍存在外部引用：' + leftovers.join(', '));
  }
  if (html.indexOf('<script src=') !== -1) {
    throw new Error('仍存在外部脚本引用');
  }

  return { html, inlined };
}

/* ============================================================
   三、极简 ZIP 写入（不依赖任何第三方库）
   ------------------------------------------------------------
   Node 自带 zlib 但没有造 zip 的能力，这里手写：
   本地文件头 + 数据 + 中央目录 + EOCD，够 Windows / macOS /
   Linux 的解压工具正常打开。
   ============================================================ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** JS Date → DOS 时间/日期 */
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/**
 * 把一串 {name, data} 打成一个 zip Buffer
 * @param {Array<{name:string, data:Buffer}>} entries
 */
function makeZip(entries) {
  const now = dosTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    // 压缩后反而更大（小文件常见）就用存储方式
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk
    central.writeUInt16LE(0, 36);          // internal attr
    central.writeUInt32LE(0, 38);          // external attr
    central.writeUInt32LE(offset, 42);     // 本地头偏移
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(locals), cdBuf, eocd]);
}

/** 递归收集源码压缩包要装的文件 */
function collectSource() {
  const FILE_LIST = [
    'index.html', 'README.md', 'CHANGELOG.md', 'LICENSE',
    'netlify.toml', 'robots.txt',
  ];
  const DIR_LIST = ['css', 'js', 'docs'];

  const out = [];
  const add = (rel, full) => {
    out.push({ name: rel.split(path.sep).join('/'), data: fs.readFileSync(full) });
  };

  for (const f of FILE_LIST) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) add(f, full);
  }
  const walk = (rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return;
    for (const name of fs.readdirSync(full).sort()) {
      const r = path.join(rel, name);
      const f = path.join(ROOT, r);
      if (fs.statSync(f).isDirectory()) walk(r);
      else add(r, f);
    }
  };
  for (const d of DIR_LIST) walk(d);

  return out;
}

/* ============================================================
   四、执行
   ============================================================ */
const result = build();

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

/* ---- 单文件版 ---- */
const outPath = path.join(DIST, OUT_NAME);
fs.writeFileSync(outPath, result.html, 'utf8');

const bytes = Buffer.byteLength(result.html, 'utf8');
const scriptCount = (result.html.match(/<script>/g) || []).length;
const styleCount = (result.html.match(/<style>/g) || []).length;

/* ---- 源码 zip ---- */
const entries = collectSource();
const zipBuf = makeZip(entries);
const zipPath = path.join(DIST, ZIP_NAME);
fs.writeFileSync(zipPath, zipBuf);

/* ---- 自检 ---- */
const problems = [];

// 1) zip 里绝不该出现构建产物或版本库
for (const e of entries) {
  if (/(^|\/)dist\//.test(e.name) || /(^|\/)\.git/.test(e.name) ||
      /node_modules/.test(e.name)) {
    problems.push('zip 里混进了不该有的路径：' + e.name);
  }
}
// 2) 单文件版不能残留外部引用（build 里已查过，这里再兜一层）
if (/<script\s+src=/.test(result.html)) problems.push('单文件版仍有外部脚本');
// 3) 关键文件必须在
for (const need of ['index.html', 'js/main.js', 'js/boss.js', 'js/codex.js']) {
  if (!entries.some((e) => e.name === need)) problems.push('zip 缺少 ' + need);
}

console.log('=== 星际突袭 · 打包 ===');
console.log('单文件版内联内容：');
result.inlined.forEach((s) => console.log('  · ' + s));
console.log('');
console.log('脚本块 ' + scriptCount + ' 个 / 样式块 ' + styleCount + ' 个');
console.log('注释：' + (KEEP_COMMENTS ? '保留（--keep-comments）' : '已压缩（换行保留，报错行号不变）'));
console.log('');
console.log('产物 1：' + path.relative(ROOT, outPath) +
  '   ' + (bytes / 1024).toFixed(1) + ' KB');
console.log('产物 2：' + path.relative(ROOT, zipPath) +
  '   ' + (zipBuf.length / 1024).toFixed(1) + ' KB  （' + entries.length + ' 个文件）');
console.log('');

if (problems.length) {
  console.error('自检未通过：');
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exit(1);
}
console.log('自检通过。');
console.log('单文件版直接发给别人即可，双击就能玩，不需要联网、不需要装任何东西。');
