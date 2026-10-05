/* ============================================================
   星际突袭 · 打包脚本  tools/build.js
   ------------------------------------------------------------
   把整个游戏压成一个 HTML 文件（CSS / JS 全部内联），
   方便通过微信、QQ、邮件直接发给别人：对方双击就能玩。

   用法： node tools/build.js
   产物： dist/星际突袭.html
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_NAME = '星际突袭.html';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function build() {
  let html = read('index.html');
  const inlined = [];

  /* ---------- 1. 内联样式表 ---------- */
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
    const css = read(href);
    if (css.indexOf('</style') !== -1) {
      throw new Error(href + ' 中含有 </style，无法安全内联');
    }
    inlined.push('css  ' + href);
    return '<style>\n/* ===== ' + href + ' ===== */\n' + css + '\n</style>';
  });

  /* ---------- 2. 内联脚本（必须保持原有顺序） ---------- */
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
    const js = read(src);
    if (js.indexOf('</script') !== -1) {
      throw new Error(src + ' 中含有 </script，无法安全内联');
    }
    inlined.push('js   ' + src);
    return '<script>\n/* ===== ' + src + ' ===== */\n' + js + '\n</script>';
  });

  /* ---------- 3. 补上手机端需要的 meta 与图标 ---------- */
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

  /* ---------- 4. 自检：不能残留任何外部引用 ---------- */
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
   执行
   ============================================================ */
const result = build();

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

const outPath = path.join(DIST, OUT_NAME);
fs.writeFileSync(outPath, result.html, 'utf8');

const bytes = Buffer.byteLength(result.html, 'utf8');
const scriptCount = (result.html.match(/<script>/g) || []).length;
const styleCount = (result.html.match(/<style>/g) || []).length;

console.log('=== 星际突袭 · 单文件打包 ===');
console.log('内联内容：');
result.inlined.forEach((s) => console.log('  · ' + s));
console.log('');
console.log('脚本块 ' + scriptCount + ' 个 / 样式块 ' + styleCount + ' 个');
console.log('产物：' + path.relative(ROOT, outPath));
console.log('大小：' + (bytes / 1024).toFixed(1) + ' KB');
console.log('');
console.log('把这个 HTML 直接发给别人即可，双击就能玩，不需要联网、不需要装任何东西。');
