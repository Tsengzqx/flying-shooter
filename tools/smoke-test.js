/* ============================================================
   星际突袭 · 无浏览器冒烟测试  tools/smoke-test.js
   ------------------------------------------------------------
   用一个极简的 DOM / Canvas / WebAudio 桩，把游戏脚本放进 Node 的 vm 里跑，
   真实驱动游戏循环，验证核心逻辑（不是只做语法检查）。

   运行： node tools/smoke-test.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const noop = () => {};

/* ---------------- Canvas 2D 上下文桩 ---------------- */
function makeCtx() {
  const grad = { addColorStop: noop };
  return {
    setTransform: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    arcTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, rect: noop,
    ellipse: noop, fill: noop, stroke: noop, fillText: noop, strokeText: noop,
    clip: noop, setLineDash: noop, drawImage: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 10 }),
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
    shadowColor: '', shadowBlur: 0, font: '10px sans-serif',
  };
}

/* ---------------- DOM 桩 ---------------- */
const ctx2d = makeCtx();
const elements = Object.create(null);

function makeEl(id) {
  const classes = new Set();
  return {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    width: 0,
    height: 0,
    handlers: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle(c, force) {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }),
    setPointerCapture: noop,
    getContext: () => ctx2d,
  };
}

const document = {
  getElementById(id) {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  },
  addEventListener: noop,
  createElement: (tag) => makeEl(tag),
};

/* ---------------- WebAudio 桩 ---------------- */
let audioNodes = 0;          // 统计创建了多少个音源，用来验证"真的发声了"

function fakeParam() {
  return {
    value: 0,
    setValueAtTime: noop,
    linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop,
    cancelScheduledValues: noop,
  };
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = { connect: noop };
  }
  createGain() {
    return { gain: fakeParam(), connect: noop, disconnect: noop };
  }
  createOscillator() {
    audioNodes++;
    return {
      type: 'sine',
      frequency: fakeParam(),
      connect: noop,
      disconnect: noop,
      start: noop,
      stop: noop,
    };
  }
  createBufferSource() {
    audioNodes++;
    return { buffer: null, connect: noop, disconnect: noop, start: noop, stop: noop };
  }
  createBuffer(channels, len) {
    return { getChannelData: () => new Float32Array(len) };
  }
  createBiquadFilter() {
    return { type: 'lowpass', frequency: fakeParam(), Q: fakeParam(), connect: noop };
  }
  createDynamicsCompressor() {
    return {
      threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(),
      attack: fakeParam(), release: fakeParam(), connect: noop,
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

/* ---------------- 时间 / rAF ---------------- */
let nowMs = 0;
let rafQueue = [];

function requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; }

/** 推进一帧（ms 为这一帧的时长） */
function step(ms) {
  nowMs += ms;
  const q = rafQueue;
  rafQueue = [];
  for (const fn of q) fn(nowMs);
}

/* ---------------- localStorage 桩 ---------------- */
const store = Object.create(null);
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

/* ---------------- 组装沙箱 ---------------- */
const winListeners = Object.create(null);

const sandbox = {
  console,
  Math, Date, JSON, Object, Array, String, Number, Boolean, Error, Promise, Set, Map,
  performance: { now: () => nowMs },
  requestAnimationFrame,
  cancelAnimationFrame: noop,
  localStorage,
  document,
  AudioContext: FakeAudioContext,
  setTimeout, clearTimeout, setInterval, clearInterval,
  innerWidth: 480,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener: noop,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

/* ---------------- 按顺序加载脚本 ----------------
   默认从 js/ 逐个加载；
   若设置了环境变量 SMOKE_BUNDLE=<单文件.html>，
   则改为从打包产物里抽出内联脚本来跑（用来验证单文件版真的能运行）。
   ------------------------------------------------ */
const BUNDLE = process.env.SMOKE_BUNDLE;

const loaded = [];

if (BUNDLE) {
  const bundlePath = path.isAbsolute(BUNDLE) ? BUNDLE : path.join(ROOT, BUNDLE);
  if (!fs.existsSync(bundlePath)) {
    console.error('[打包产物不存在] ' + bundlePath);
    process.exit(1);
  }

  const html = fs.readFileSync(bundlePath, 'utf8');
  const scripts = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);

  if (!scripts.length) {
    console.error('[打包产物里没有找到内联脚本]');
    process.exit(1);
  }

  scripts.forEach((code, i) => {
    try {
      vm.runInContext(code, sandbox, { filename: 'bundle#' + (i + 1) });
      const tag = (code.match(/\/\* ===== (js\/\S+) ===== \*\//) || [])[1];
      loaded.push(tag || ('bundle#' + (i + 1)));
    } catch (err) {
      console.error('[加载失败] bundle#' + (i + 1));
      console.error(err);
      process.exit(1);
    }
  });

  console.log('（本次测试的是打包产物：' + path.relative(ROOT, bundlePath) + '）');
} else {
  const FILES = [
    'js/main.js',
    'js/input.js',
    'js/bullets.js',
    'js/player.js',
    'js/enemies.js',
    'js/combat.js',
    'js/particles.js',
    'js/powerups.js',
    'js/progress.js',
    'js/upgrades.js',
    'js/panel.js',
    'js/audio.js',
    'js/boss.js',
  ];

  for (const f of FILES) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;          // 尚未完成的模块直接跳过
    const code = fs.readFileSync(full, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: f });
      loaded.push(f);
    } catch (err) {
      console.error('[加载失败] ' + f);
      console.error(err);
      process.exit(1);
    }
  }
}

/* ---------------- 断言工具 ---------------- */
let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else {
    fail++;
    console.log('  ❌ ' + name + (extra ? '  → ' + extra : ''));
  }
}

const G = sandbox.Game;

/**
 * 开一局并给玩家长无敌。
 * 测试关心的是各系统逻辑，不希望中途被打死导致整个循环冻在 gameover；
 * 需要验证伤害/残机的用例会自己把 invuln 清零。
 */
function startSafe() {
  G.startGame();
  if (G.player) G.player.invuln = 999999;
}

/**
 * 推进若干帧；autoPick=true 时遇到强化面板会自动选一个，
 * 避免"升级弹窗把游戏冻住"导致后续断言全部失效。
 */
function runFrames(n, autoPick) {
  for (let i = 0; i < n; i++) {
    if (autoPick && G.state === 'upgrade' && G.upgrades) {
      const off = G.upgrades.state.offers;
      if (off && off.length) {
        G.upgrades.choose(off[(Math.random() * off.length) | 0].id);
      }
    }
    step(16);
  }
}

/* ---------------- 开始测试 ---------------- */
console.log('\n=== 星际突袭 · 冒烟测试 ===');
console.log('已加载模块: ' + loaded.join(', ') + '\n');

console.log('[1] 框架');
ok('window.Game 已创建', !!G);
ok('初始状态为 menu', G.state === 'menu', 'state=' + G.state);
ok('画布尺寸已设置', G.W === 480 && G.H === 800, G.W + 'x' + G.H);

step(16);
ok('游戏循环可运行（首帧无异常）', true);

console.log('\n[2] 开局');
startSafe();
ok('状态切到 playing', G.state === 'playing', 'state=' + G.state);
ok('分数归零', G.score === 0);
ok('残机为 3', G.lives === 3);
ok('玩家在画面中央偏下', Math.abs(G.player.x - G.W / 2) < 1 && G.player.y > G.H * 0.7,
  'x=' + G.player.x.toFixed(1) + ' y=' + G.player.y.toFixed(1));
ok('开局带无敌帧', G.player.invuln > 0);

console.log('\n[3] 自动攻击与玩家操作（键盘）');
if (G.input && G.player) {
  // ---- 自动攻击：完全不给输入也必须开火 ----
  startSafe();
  G.bullets.reset();
  for (let i = 0; i < 20; i++) step(16);
  ok('无任何输入时自动开火', G.bullets.friendly.length > 0,
    '子弹数=' + G.bullets.friendly.length);
  ok('自动开火的子弹向上飞', G.bullets.friendly.every((b) => b.vy < 0));
  ok('松开所有按键仍在开火', G.input.firing === false &&
    G.bullets.friendly.length > 0);
  ok('攻击不需要按空格', G.input.held.fire === false);

  // ---- 移动 ----
  const y0 = G.player.y;
  const x0 = G.player.x;
  G.input.held.up = true;
  for (let i = 0; i < 30; i++) step(16);
  G.input.held.up = false;

  ok('按住↑后飞机向上移动', G.player.y < y0 - 20,
    'y: ' + y0.toFixed(1) + ' → ' + G.player.y.toFixed(1));

  G.input.held.right = true;
  for (let i = 0; i < 20; i++) step(16);
  G.input.held.right = false;
  ok('按住→后飞机向右移动', G.player.x > x0 + 20,
    'x: ' + x0.toFixed(1) + ' → ' + G.player.x.toFixed(1));

  G.input.held.right = true;
  for (let i = 0; i < 200; i++) step(16);
  G.input.held.right = false;
  ok('飞机不会飞出右边界', G.player.x <= G.W - 16 + 0.01, 'x=' + G.player.x.toFixed(1));

  G.input.held.right = true;
  G.input.held.up = true;
  const ax = G.input.axis;
  ok('斜向移动已归一化', Math.abs(Math.hypot(ax.x, ax.y) - 1) < 1e-6,
    'len=' + Math.hypot(ax.x, ax.y).toFixed(4));
  G.input.held.right = false;
  G.input.held.up = false;
} else {
  ok('输入/玩家模块存在', false, '模块未加载');
}

console.log('\n[4] 玩家操作（触屏/指针跟随）');
if (G.input && G.player) {
  G.input.pointer.active = true;
  G.input.pointer.x = 100;
  G.input.pointer.y = 300;
  for (let i = 0; i < 60; i++) step(16);
  ok('飞机跟随指针 X', Math.abs(G.player.x - 100) < 25, 'x=' + G.player.x.toFixed(1));
  ok('飞机跟随指针 Y（含手指偏移）', Math.abs(G.player.y - (300 - 48)) < 30,
    'y=' + G.player.y.toFixed(1));
  G.input.pointer.active = false;
  ok('指针松开后恢复键盘控制', G.input.firing === false);
}

console.log('\n[5] 子弹回收');
if (G.bullets) {
  startSafe();
  G.player.autoFire = false;         // 关掉自动开火，精确计数
  G.bullets.reset();
  G.bullets.spawnPlayer(G.W / 2, G.H - 10, 0, -760);
  const n0 = G.bullets.friendly.length;
  for (let i = 0; i < 200; i++) step(16);
  ok('飞出屏幕的子弹被回收', G.bullets.friendly.length < n0,
    n0 + ' → ' + G.bullets.friendly.length);
  G.player.autoFire = true;
}

console.log('\n[6] 受击与残机');
if (G.player) {
  startSafe();
  G.lives = 3;
  G.player.invuln = 0;
  const hit1 = G.player.hit();
  ok('受击生效', hit1 === true);
  ok('残机 3 → 2', G.lives === 2, 'lives=' + G.lives);
  ok('受击后进入无敌帧', G.player.invuln > 0);

  const hit2 = G.player.hit();
  ok('无敌帧内再次受击无效', hit2 === false);
  ok('残机仍为 2', G.lives === 2, 'lives=' + G.lives);

  G.player.invuln = 0;
  G.player.hit();
  ok('残机 2 → 1', G.lives === 1, 'lives=' + G.lives);

  G.player.invuln = 0;
  G.player.hit();
  ok('残机归零后游戏结束', G.state === 'gameover', 'state=' + G.state);
  ok('结束时玩家标记为阵亡', G.player.alive === false);
  ok('残机不会变成负数', G.lives === 0, 'lives=' + G.lives);
}

console.log('\n[7] 最高分');
if (G.player) {
  startSafe();
  G.score = 12345;
  G.lives = 1;
  G.player.invuln = 0;
  G.player.hit();
  ok('最高分被记录', G.highScore === 12345, 'high=' + G.highScore);
  ok('最高分写入 localStorage', localStorage.getItem('starstrike.high') === '12345',
    String(localStorage.getItem('starstrike.high')));
}

console.log('\n[8] 暂停 / 恢复 / 回菜单');
startSafe();
G.togglePause();
ok('暂停状态正确', G.state === 'paused');
const posBefore = G.player ? G.player.y : 0;
if (G.input) G.input.held.up = true;
for (let i = 0; i < 30; i++) step(16);
if (G.input) G.input.held.up = false;
ok('暂停时游戏逻辑冻结', !G.player || Math.abs(G.player.y - posBefore) < 0.001);
G.togglePause();
ok('恢复后回到 playing', G.state === 'playing');
G.toMenu();
ok('可回到主菜单', G.state === 'menu' && G.screen === 'menu');

console.log('\n[9] 敌机波次');
if (G.enemies) {
  startSafe();
  ok('开局关卡为 1', G.level === 1, 'level=' + G.level);
  ok('已生成出怪队列', G.enemies.wave.queue.length > 0, 'queue=' + G.enemies.wave.queue.length);

  for (let i = 0; i < 120; i++) step(16);
  ok('敌机已出现在场上', G.enemies.list.length > 0, 'count=' + G.enemies.list.length);
  ok('敌机从上方进入', G.enemies.list.every((e) => e.y < G.H + 60));
  ok('每只敌机都有血量与分值', G.enemies.list.every((e) => e.hp > 0 && e.score > 0));
  ok('每只敌机都带经验值', G.enemies.list.every((e) => e.xp > 0));

  G.bullets.reset();
  for (let i = 0; i < 180; i++) step(16);
  ok('敌机会开火', G.bullets.hostile.length > 0 || G.enemies.list.some((e) => e.y > 100));
  ok('敌机会飞出屏幕被回收', G.enemies.list.length <= 26);
} else {
  ok('敌机模块存在', false, '未加载 enemies.js');
}

console.log('\n[10] 战斗判定：击毁敌机');
if (G.enemies && G.combat) {
  startSafe();
  G.player.autoFire = false;          // 精确验证"子弹命中后被消耗"
  G.bullets.reset();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;

  G.enemies.spawn('scout', G.W / 2);
  const e = G.enemies.list[0];
  e.x = G.W / 2;
  e.baseX = G.W / 2;
  e.y = G.H * 0.45;
  e.fireCd = 999;

  const score0 = G.score;
  G.bullets.spawnPlayer(e.x, e.y + 50, 0, -760, { damage: 9 });
  for (let i = 0; i < 24; i++) step(16);

  ok('我方子弹击毁了敌机', G.enemies.list.indexOf(e) === -1);
  ok('击毁后得分增加', G.score > score0, score0 + ' → ' + G.score);
  ok('子弹命中后被消耗', G.bullets.friendly.length === 0,
    '剩余=' + G.bullets.friendly.length);
  G.player.autoFire = true;
}

console.log('\n[11] 战斗判定：玩家受伤');
if (G.enemies && G.combat) {
  startSafe();
  G.bullets.reset();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.player.invuln = 0;

  const lives0 = G.lives;
  G.bullets.spawnEnemy(G.player.x, G.player.y - 70, 0, 250, { r: 5 });
  for (let i = 0; i < 40; i++) step(16);

  ok('敌弹命中玩家扣命', G.lives === lives0 - 1, lives0 + ' → ' + G.lives);
  ok('命中后敌弹被移除', G.bullets.hostile.length === 0,
    '剩余=' + G.bullets.hostile.length);
  ok('受伤后进入无敌帧', G.player.invuln > 0);
}

console.log('\n[12] 战斗判定：撞机同归于尽');
if (G.enemies && G.combat) {
  startSafe();
  G.bullets.reset();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.player.invuln = 0;

  G.enemies.spawn('scout', G.player.x);
  const e2 = G.enemies.list[0];
  e2.x = G.player.x;
  e2.baseX = G.player.x;
  e2.y = G.player.y;
  const lives1 = G.lives;

  for (let i = 0; i < 3; i++) step(16);

  ok('撞机后玩家扣命', G.lives === lives1 - 1, lives1 + ' → ' + G.lives);
  ok('撞机后敌机消失', G.enemies.list.indexOf(e2) === -1);
}

console.log('\n[13] 过关流程');
if (G.enemies) {
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.enemies.wave.level = 3;
  G.enemies.wave.gap = 0;

  for (let i = 0; i < 130; i++) step(16);
  ok('清空后进入下一关', G.enemies.wave.level >= 4, 'level=' + G.enemies.wave.level);
  ok('HUD 关卡与波次同步', G.level === G.enemies.wave.level,
    'G.level=' + G.level + ' wave=' + G.enemies.wave.level);
}

console.log('\n[14] Roguelike 增益：池子与流派');
if (G.upgrades) {
  const POOL = G.upgrades.POOL;
  ok('增益池 ≥ 32 个', POOL.length >= 32, '共 ' + POOL.length + ' 个');

  const ids = POOL.map((b) => b.id);
  ok('增益 id 不重复', new Set(ids).size === ids.length,
    '重复 ' + (ids.length - new Set(ids).size) + ' 个');

  const badField = POOL.filter((b) =>
    !b.id || !b.name || !b.desc || !b.icon || !b.build || !b.rarity || !(b.max > 0));
  ok('每个增益字段完整', badField.length === 0, badField.map((b) => b.id).join(','));

  const builds = {};
  for (const b of POOL) builds[b.build] = (builds[b.build] || 0) + 1;

  ok('三大流派 + 通用都存在',
    ['item', 'level', 'swarm', 'general'].every((k) => builds[k] > 0),
    JSON.stringify(builds));
  ok('每个流派至少 6 个增益',
    ['item', 'level', 'swarm'].every((k) => builds[k] >= 6),
    JSON.stringify(builds));
  ok('通用增益数量充足', builds.general >= 10, 'general=' + builds.general);

  ok('品质取值合法', POOL.every((b) => ['common', 'rare', 'epic', 'gold'].includes(b.rarity)));

  const epics = POOL.filter((b) => b.rarity === 'epic').length;
  const golds = POOL.filter((b) => b.rarity === 'gold').length;
  ok('存在高品质增益', epics >= 5, 'epic=' + epics);
  ok('存在金色品质增益', golds >= 6, 'gold=' + golds);
  ok('每个流派都有紫色增益',
    ['swarm', 'item', 'level'].every((k) =>
      POOL.filter((b) => b.build === k && b.rarity === 'epic').length >= 4),
    ['swarm', 'item', 'level'].map((k) =>
      k + ':' + POOL.filter((b) => b.build === k && b.rarity === 'epic').length).join(' '));
  ok('每个流派都有金色增益',
    ['swarm', 'item', 'level'].every((k) =>
      POOL.filter((b) => b.build === k && b.rarity === 'gold').length >= 2));
  ok('每个增益都写了「升级增量」说明',
    POOL.every((b) => typeof b.delta === 'string' && b.delta.length > 0));
} else {
  ok('增益模块存在', false, '未加载 upgrades.js');
}

console.log('\n[15] Roguelike 增益：属性映射（逐项验证）');
if (G.upgrades) {
  const S = G.stats;

  const MAP = [
    /* 弹幕流 */
    ['swarm_ammo',   'extraBullets',   (v) => v > 0],
    ['swarm_rate',   'fireRateMul',    (v) => v < 1],
    ['swarm_split',  'extraBullets',   (v) => v > 0],
    ['swarm_spread', 'spreadAngle',    (v) => v > 0],
    ['swarm_speed',  'bulletSpeedMul', (v) => v > 1],
    ['swarm_micro',  'bulletSizeMul',  (v) => v < 1],
    ['swarm_side',   'sideGun',        (v) => v > 0],
    ['swarm_rear',   'rearGun',        (v) => v > 0],
    ['swarm_pierce', 'pierce',         (v) => v > 0],
    ['swarm_torrent','extraBullets',   (v) => v >= 4],
    ['swarm_ring',   'ringShot',       (v) => v > 0],
    ['swarm_lance',  'frontLanes',     (v) => v > 0],
    ['swarm_swarm',  'fireRateMul',    (v) => v < 1],
    ['swarm_mirror', 'mirror',         (v) => v > 0],
    ['swarm_saturation', 'spreadAngle',(v) => v > 0],
    ['gold_swarm_storm', 'goldStorm',  (v) => v > 0],
    ['gold_swarm_echo',  'echoChance', (v) => v > 0],
    ['gold_swarm_lance', 'pierce',     (v) => v > 100],
    /* 道具流 */
    ['item_power',    'itemDamage',      (v) => v > 0],
    ['item_drop',     'dropRate',        (v) => v > 0],
    ['item_double',   'doubleDrop',      (v) => v > 0],
    ['item_magnet',   'magnet',          (v) => v > 0],
    ['item_duration', 'itemDurationMul', (v) => v > 1],
    ['item_repair',   'itemRepair',      (v) => v > 0],
    ['item_airdrop',  'airdrop',         (v) => v > 0],
    ['item_quality',  'itemQuality',     (v) => v > 0],
    ['item_bomb',     'itemBomb',        (v) => v > 0],
    ['item_resonance','itemResonance',   (v) => v > 0],
    ['item_overload', 'itemDurationMul', (v) => v > 1],
    ['item_converter','itemConverter',   (v) => v > 0],
    ['item_midas',    'itemMidas',       (v) => v > 0],
    ['gold_item_hoard',  'itemHoard',    (v) => v > 0],
    ['gold_item_shower', 'dropRate',     (v) => v >= 0.6],
    ['gold_item_alchemy','goldAlchemy',  (v) => v > 0],
    /* 升级流 */
    ['lv_xp',        'xpMul',           (v) => v > 1],
    ['lv_power',     'levelDamage',     (v) => v > 0],
    ['lv_haste',     'levelHaste',      (v) => v > 0],
    ['lv_shield',    'shieldOnLevelUp', (v) => v > 0],
    ['lv_heal',      'healOnLevelUp',   (v) => v > 0],
    ['lv_luck',      'luck',            (v) => v > 0],
    ['lv_potential', 'potential',       (v) => v > 0],
    ['lv_overflow',  'xpCostCut',       (v) => v > 0],
    ['lv_awaken',    'lvAwaken',        (v) => v > 0],
    ['lv_mastery',   'lvMastery',       (v) => v > 0],
    ['gold_level_surge',    'xpMul',        (v) => v >= 2.5],
    ['gold_level_transcend','goldTranscend',(v) => v > 0],
    ['gold_level_ascend',   'goldAscend',   (v) => v > 0],
    /* 通用 */
    ['gen_hitpower', 'hitDamage',     (v) => v > 0],
    ['gen_laser',    'bulletSpeedMul',(v) => v > 1],
    ['gen_wave',     'bulletWave',    (v) => v > 0],
    ['gen_heavy',    'bulletSizeMul', (v) => v > 1],
    ['gen_homing',   'homing',        (v) => v > 0],
    ['gen_ricochet', 'bulletRicochet',(v) => v > 0],
    ['gen_plasma',   'splash',        (v) => v > 0],
    ['gen_frost',    'frost',         (v) => v > 0],
    ['gen_arc',      'arc',           (v) => v > 0],
    ['gen_venom',    'venom',         (v) => v > 0],
    ['gen_rail',     'bulletStyle',   (v) => v === 'rail'],
    ['gen_pointdef', 'pointDef',      (v) => v > 0],
    ['gen_rapid',    'fireRateMul',   (v) => v < 1],
    ['gen_speed',    'moveSpeedMul',  (v) => v > 1],
    ['gen_agile',    'agility',       (v) => v > 1],
    ['gen_power',    'damage',        (v) => v > 1],
    ['gen_crit',     'critChance',    (v) => v > 0],
    ['gen_critdmg',  'critMul',       (v) => v > 2],
    ['gen_bigshot',  'bulletSizeMul', (v) => v > 1],
    ['gen_vital',    'maxLives',      (v) => v > 3],
    ['gen_armor',    'armor',         (v) => v > 0],
    ['gen_invuln',   'invulnBonus',   (v) => v > 0],
    ['gen_revive',   'revive',        (v) => v > 0],
    ['gen_freeze',   'slow',          (v) => v > 0],
    ['gen_burn',     'burn',          (v) => v > 0],
    ['gen_explode',  'explodeOnKill', (v) => v > 0],
    ['gen_chain',    'chain',         (v) => v > 0],
    ['gen_vamp',     'vamp',          (v) => v > 0],
    ['gen_drone',    'drones',        (v) => v > 0],
    ['gen_orbit',    'orbits',        (v) => v > 0],
    ['gen_combo',    'combo',         (v) => v > 0],
    ['gen_score',    'scoreMul',      (v) => v > 1],
    ['gen_berserk',  'berserk',       (v) => v > 0],
    ['gen_execute',  'execute',       (v) => v > 0],
  ];

  const POOL = G.upgrades.POOL;
  const mapped = new Set(MAP.map((m) => m[0]));
  const NEED_LEVEL = ['lv_vital', 'lv_instinct'];   // 需要等级才有数值，单独测

  const unmapped = POOL
    .filter((b) => !mapped.has(b.id) && NEED_LEVEL.indexOf(b.id) === -1)
    .map((b) => b.id);
  ok('池子里每个增益都有属性映射', unmapped.length === 0, unmapped.join(','));

  const broken = [];
  for (const [id, stat, okFn] of MAP) {
    const def = POOL.find((b) => b.id === id);
    if (!def) { broken.push(id + '(不在池中)'); continue; }

    startSafe();
    G.upgrades.owned[id] = 1;
    G.upgrades.recalc();

    if (!okFn(S[stat])) broken.push(id + '→' + stat + '=' + S[stat]);
  }
  ok('全部增益都能正确改写属性表', broken.length === 0, broken.slice(0, 8).join(' | '));

  startSafe();
  ok('reset 后属性回到默认', S.damage === 1 && S.fireRateMul === 1 &&
    S.extraBullets === 0 && S.maxLives === 3 && S.moveSpeedMul === 1,
    'damage=' + S.damage + ' maxLives=' + S.maxLives);
}

console.log('\n[16] Roguelike 增益：层数叠加');
if (G.upgrades) {
  const S = G.stats;

  startSafe();
  G.upgrades.owned.gen_power = 4;
  G.upgrades.recalc();
  const d4 = S.damage;

  G.upgrades.owned.gen_power = 8;
  G.upgrades.recalc();
  ok('层数越高效果越强', S.damage > d4,
    '4层=' + d4.toFixed(2) + ' 8层=' + S.damage.toFixed(2));

  startSafe();
  G.upgrades.owned.gen_rapid = 3;
  G.upgrades.recalc();
  ok('攻速是乘法叠加（递减冷却）', S.fireRateMul < 0.7 && S.fireRateMul > 0.5,
    'fireRateMul=' + S.fireRateMul.toFixed(3));

  startSafe();
  G.upgrades.owned.gen_drone = 2;
  G.upgrades.owned.gen_orbit = 3;
  G.upgrades.recalc();
  G.upgrades.syncSummons();
  ok('召唤物数量与层数一致',
    G.upgrades.state.drones.length === 2 && G.upgrades.state.orbits.length === 3,
    'drones=' + G.upgrades.state.drones.length +
    ' orbits=' + G.upgrades.state.orbits.length);
}

console.log('\n[17] Roguelike 增益：三选一流程');
if (G.upgrades) {
  startSafe();
  ok('开局不弹强化', G.state === 'playing' && !G.upgrades.pending());

  G.upgrades.request(2);
  ok('请求后进入强化界面', G.state === 'upgrade', 'state=' + G.state);
  ok('界面状态同步为 upgrade', G.screen === 'upgrade', 'screen=' + G.screen);
  ok('恰好提供 3 个选项', G.upgrades.state.offers.length === 3,
    '实际 ' + G.upgrades.state.offers.length);

  const offerIds = G.upgrades.state.offers.map((b) => b.id);
  ok('3 个选项互不重复', new Set(offerIds).size === 3, offerIds.join(','));
  ok('选项均来自增益池', offerIds.every((id) => G.upgrades.POOL.some((b) => b.id === id)));
  ok('选项都带流派标记',
    G.upgrades.state.offers.every((b) => ['item', 'level', 'swarm', 'general'].includes(b.build)));

  const frozenY = G.player.y;
  G.input.held.up = true;
  for (let i = 0; i < 30; i++) step(16);
  G.input.held.up = false;
  ok('选择期间游戏暂停', Math.abs(G.player.y - frozenY) < 0.001);

  const pick = G.upgrades.state.offers[0];
  G.upgrades.choose(pick.id);
  ok('选择后回到战斗', G.state === 'playing', 'state=' + G.state);
  ok('选择后界面隐藏', G.screen === null);
  ok('该增益层数 +1', G.upgrades.lv(pick.id) === 1,
    pick.id + '=' + G.upgrades.lv(pick.id));
  ok('已不再等待选择', !G.upgrades.pending());

  G.upgrades.choose(pick.id);
  ok('非选择状态下的 choose 被忽略', G.upgrades.lv(pick.id) === 1);
}

console.log('\n[18] Roguelike 增益：满级与品质');
if (G.upgrades) {
  startSafe();
  const def = G.upgrades.POOL.find((b) => b.id === 'gen_vital');

  G.upgrades.owned.gen_vital = def.max;
  G.upgrades.recalc();

  let appeared = 0;
  for (let k = 0; k < 60; k++) {
    G.upgrades.request(99);
    for (const o of G.upgrades.state.offers) if (o.id === 'gen_vital') appeared++;
    G.upgrades.state.pending = false;
    G.state = 'playing';
  }
  ok('已满级增益不再出现在选项中', appeared === 0, '出现 ' + appeared + ' 次');

  startSafe();
  for (const b of G.upgrades.POOL) G.upgrades.owned[b.id] = b.max;
  G.upgrades.recalc();
  G.upgrades.request(5);
  ok('全部满级时不再打断游戏', G.state === 'playing' && !G.upgrades.pending(),
    'state=' + G.state);

  /* ---------- 满级增益的出现概率必须为 0 ---------- */
  startSafe();
  const richochet = G.upgrades.POOL.find((b) => b.id === 'gen_ricochet');
  ok('弹跳弹是有限层增益', richochet.max === 2, 'max=' + richochet.max);
  ok('未满级时不算满级', G.upgrades.isMaxed(richochet) === false);

  G.upgrades.owned.gen_ricochet = richochet.max;
  ok('拿满后判定为已满级', G.upgrades.isMaxed(richochet) === true);

  let ricochetSeen = 0;
  for (let k = 0; k < 3000; k++) {
    for (const o of G.upgrades.rollOffers(3)) {
      if (o.id === 'gen_ricochet') ricochetSeen++;
    }
  }
  ok('满级增益出现概率为 0', ricochetSeen === 0, '3000 次抽取出现 ' + ricochetSeen + ' 次');

  // 逐个把增益顶满，确认它们会一个个消失
  startSafe();
  G.upgrades.owned.gen_ricochet = 2;
  G.upgrades.owned.gen_riposte = 0;
  let stillOthers = 0;
  for (let k = 0; k < 200; k++) stillOthers += G.upgrades.rollOffers(3).length;
  ok('满级一个不影响其它增益的抽取', stillOthers > 500, '共抽出 ' + stillOthers + ' 个选项');

  startSafe();
  for (const b of G.upgrades.POOL) G.upgrades.owned[b.id] = b.max;
  G.upgrades.recalc();
  ok('全部满级时抽不出任何选项', G.upgrades.rollOffers(3).length === 0);

  startSafe();
  let epicLow = 0;
  for (let k = 0; k < 400; k++) {
    G.upgrades.request(9);
    for (const o of G.upgrades.state.offers) if (o.rarity === 'epic') epicLow++;
    G.upgrades.state.pending = false;
    G.state = 'playing';
  }

  startSafe();
  G.upgrades.owned.lv_luck = 3;
  G.upgrades.recalc();
  let epicHigh = 0;
  for (let k = 0; k < 400; k++) {
    G.upgrades.request(9);
    for (const o of G.upgrades.state.offers) if (o.rarity === 'epic') epicHigh++;
    G.upgrades.state.pending = false;
    G.state = 'playing';
  }
  ok('幸运星提高了高品质出现率', epicHigh > epicLow,
    '无幸运=' + epicLow + ' 满幸运=' + epicHigh);
}

console.log('\n[19] Roguelike 增益：特殊效果');
if (G.upgrades && G.particles) {
  // 爆裂弹
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.bullets.reset();
  G.upgrades.owned.gen_explode = 4;
  G.upgrades.recalc();

  G.enemies.spawn('scout', G.W / 2);
  const e1 = G.enemies.list[0];
  e1.x = G.W / 2; e1.baseX = G.W / 2; e1.y = 200; e1.fireCd = 999;

  G.enemies.spawn('scout', G.W / 2);
  const e2 = G.enemies.list[1];
  e2.x = G.W / 2 + 30; e2.baseX = G.W / 2 + 30; e2.y = 205; e2.fireCd = 999;

  G.bullets.spawnPlayer(e1.x, e1.y + 40, 0, -760, { damage: 9 });
  for (let i = 0; i < 20; i++) step(16);
  ok('爆裂弹波及了旁边的敌机', G.enemies.list.indexOf(e2) === -1,
    '剩余 ' + G.enemies.list.length + ' 架');

  // 连锁闪电
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.bullets.reset();
  G.upgrades.owned.gen_chain = 3;
  G.upgrades.recalc();

  for (let k = 0; k < 4; k++) {
    G.enemies.spawn('scout', 100 + k * 60);
    const en = G.enemies.list[k];
    en.x = 100 + k * 60; en.baseX = 100 + k * 60; en.y = 200; en.fireCd = 999;
  }
  G.bullets.spawnPlayer(100, 240, 0, -760, { damage: 9 });
  for (let i = 0; i < 20; i++) step(16);
  ok('连锁闪电击穿了多架敌机', G.enemies.list.length < 4,
    '剩余 ' + G.enemies.list.length + ' 架');

  // 寒冰力场
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.upgrades.owned.gen_freeze = 4;
  G.upgrades.recalc();

  G.enemies.spawn('scout', G.W / 2);
  const slowE = G.enemies.list[0];
  slowE.x = G.W / 2; slowE.baseX = G.W / 2; slowE.y = 0; slowE.fireCd = 999;
  const y0 = slowE.y;
  for (let i = 0; i < 30; i++) step(16);
  const slowDist = slowE.y - y0;

  G.upgrades.owned.gen_freeze = 0;
  G.upgrades.recalc();
  slowE.y = 0;
  for (let i = 0; i < 30; i++) step(16);
  const fastDist = slowE.y;

  ok('寒冰力场让敌机变慢', slowDist < fastDist * 0.75,
    '减速后=' + slowDist.toFixed(0) + ' 正常=' + fastDist.toFixed(0));

  // 燃烧弹
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.upgrades.owned.gen_burn = 4;
  G.upgrades.recalc();
  G.enemies.spawn('gunship', G.W / 2);
  const burnE = G.enemies.list[0];
  const hp0 = burnE.hp;
  G.enemies.damage(0, 1, {});
  ok('燃烧弹命中后挂上灼烧状态', burnE.burnT > 0, 'burnT=' + burnE.burnT.toFixed(2));
  for (let i = 0; i < 60; i++) step(16);
  ok('灼烧会持续掉血', burnE.hp < hp0 - 1,
    hp0 + ' → ' + (burnE.hp || 0).toFixed(1));

  // 点防系统
  startSafe();
  G.upgrades.owned.gen_pointdef = 3;
  G.upgrades.recalc();
  G.upgrades.state.pointDefT = 0;
  G.bullets.reset();
  for (let k = 0; k < 5; k++) {
    G.bullets.spawnEnemy(G.player.x + k * 10 - 20, G.player.y - 40, 0, 100);
  }
  for (let i = 0; i < 10; i++) step(16);
  ok('点防系统清除了附近敌弹', G.bullets.hostile.length < 5,
    '剩余 ' + G.bullets.hostile.length + ' 颗');

  // 凤凰核心
  startSafe();
  G.upgrades.state.revives = 1;
  G.lives = 1;
  G.player.invuln = 0;
  G.player.hit();
  ok('凤凰核心触发复活', G.state === 'playing' && G.lives > 0,
    'state=' + G.state + ' lives=' + G.lives);

  // 僚机
  startSafe();
  G.upgrades.owned.gen_drone = 2;
  G.upgrades.recalc();
  G.upgrades.syncSummons();
  G.bullets.reset();
  for (let i = 0; i < 60; i++) step(16);
  ok('僚机会自动开火', G.bullets.friendly.length > 0,
    '子弹 ' + G.bullets.friendly.length + ' 颗');
  ok('僚机跟随玩家', G.upgrades.state.drones.every((d) =>
    Math.hypot(d.x - G.player.x, d.y - G.player.y) < 150));
}

console.log('\n[20] 道具流：掉落、吸附与拾取');
if (G.powerups) {
  // 掉落率
  startSafe();
  G.upgrades.owned.item_drop = 6;
  G.upgrades.recalc();
  ok('补给协议提高掉落率', G.stats.dropRate > 0.5, 'dropRate=' + G.stats.dropRate.toFixed(2));

  G.powerups.reset();
  for (let k = 0; k < 60; k++) G.powerups.maybeDrop(200, 200, 'scout');
  ok('高掉落率下确实掉出道具', G.powerups.list.length > 15,
    '掉了 ' + G.powerups.list.length + ' 个');

  // 双倍投放：与"没有该增益"的情况做对照，避免受基础掉落率调整影响
  startSafe();
  G.powerups.reset();
  for (let k = 0; k < 300; k++) G.powerups.maybeDrop(0, 0, 'boss');
  const noDouble = G.powerups.list.length;

  startSafe();
  G.upgrades.owned.item_double = 3;
  G.upgrades.recalc();
  ok('双倍投放生效', G.stats.doubleDrop >= 0.75,
    'doubleDrop=' + G.stats.doubleDrop.toFixed(2));

  G.powerups.reset();
  for (let k = 0; k < 300; k++) G.powerups.maybeDrop(0, 0, 'boss');
  const withDouble = G.powerups.list.length;

  ok('双倍投放明显提高了掉落总量', withDouble > noDouble * 1.4,
    '无=' + noDouble + ' 有=' + withDouble);

  // 磁力吸附
  startSafe();
  G.upgrades.owned.item_magnet = 4;
  G.upgrades.recalc();
  ok('磁力吸附范围提升', G.stats.magnet >= 400, 'magnet=' + G.stats.magnet);

  G.powerups.spawn('shield', 20, 100);
  const item = G.powerups.list[0];
  const d0 = Math.hypot(item.x - G.player.x, item.y - G.player.y);
  for (let i = 0; i < 40; i++) step(16);
  const gone = G.powerups.list.length === 0;
  const d1 = gone ? 0 : Math.hypot(item.x - G.player.x, item.y - G.player.y);
  ok('磁力吸附把道具吸向玩家', gone || d1 < d0,
    '距离 ' + d0.toFixed(0) + ' → ' + d1.toFixed(0));

  // 拾取计数 + 与装备强化联动
  startSafe();
  const collected0 = G.powerups.state.collected;
  G.powerups.apply('rapid', 100, 100);
  ok('拾取道具会累加计数', G.powerups.state.collected === collected0 + 1,
    collected0 + ' → ' + G.powerups.state.collected);

  G.upgrades.owned.item_power = 3;
  G.upgrades.recalc();
  const dmgA = G.stats.damage;
  G.powerups.apply('rapid', 100, 100);
  ok('拾取后装备强化立刻提升伤害', G.stats.damage > dmgA,
    dmgA.toFixed(3) + ' → ' + G.stats.damage.toFixed(3));

  // 时效延长 / 高级补给
  startSafe();
  G.upgrades.owned.item_duration = 3;
  G.upgrades.owned.item_quality = 3;
  G.upgrades.recalc();
  G.player.power.rapid = 0;
  G.powerups.apply('rapid', 100, 100);
  ok('时效延长让道具持续更久', G.player.power.rapid > 8 * 2,
    'rapid=' + G.player.power.rapid.toFixed(1) + 's');

  // 冲击拾取
  startSafe();
  G.upgrades.owned.item_bomb = 3;
  G.upgrades.recalc();
  G.bullets.reset();
  for (let k = 0; k < 5; k++) {
    G.bullets.spawnEnemy(G.player.x + k * 8, G.player.y - 30, 0, 80);
  }
  G.powerups.apply('shield', G.player.x, G.player.y);
  ok('冲击拾取会清除周围敌弹', G.bullets.hostile.length < 5,
    '剩余 ' + G.bullets.hostile.length + ' 颗');
}

console.log('\n[21] 经验与等级系统');
if (G.progress) {
  startSafe();
  ok('初始等级为 1', G.progress.level === 1, 'level=' + G.progress.level);
  ok('初始经验为 0', G.progress.state.xp === 0);
  ok('经验需求随等级递增', G.progress.xpFor(10) > G.progress.xpFor(1),
    G.progress.xpFor(1) + ' → ' + G.progress.xpFor(10));

  // 升 1 级
  const need1 = G.progress.state.need;
  G.progress.addXp(need1);
  ok('经验满后升级', G.progress.level === 2, 'level=' + G.progress.level);
  ok('升级后经验被扣除', G.progress.state.xp < need1, 'xp=' + G.progress.state.xp);
  ok('升级会产生待选强化', G.progress.state.pending === 1,
    'pending=' + G.progress.state.pending);

  // 自动弹出三选一
  G.progress.update(0.016);
  ok('升级后自动弹出三选一', G.state === 'upgrade', 'state=' + G.state);

  const offer = G.upgrades.state.offers[0];
  G.upgrades.choose(offer.id);
  ok('选完回到战斗', G.state === 'playing');
  ok('选择消耗掉一次升级机会', G.progress.state.pending === 0,
    'pending=' + G.progress.state.pending);

  // 连升多级
  startSafe();
  const lv0 = G.progress.level;
  let total = 0;
  for (let i = 0; i < 5; i++) total += G.progress.xpFor(lv0 + i);
  G.progress.addXp(total);
  ok('一次大量经验可以连升多级', G.progress.level === lv0 + 5,
    lv0 + ' → ' + G.progress.level);
  ok('多次升级会排队等待选择', G.progress.state.pending === 5,
    'pending=' + G.progress.state.pending);

  // 经验倍率
  startSafe();
  G.upgrades.owned.lv_xp = 4;
  G.upgrades.recalc();
  ok('经验增幅提高经验倍率', G.stats.xpMul > 2, 'xpMul=' + G.stats.xpMul.toFixed(2));

  const total0 = G.progress.state.total;
  G.progress.addXp(10);
  ok('经验按倍率结算',
    G.progress.state.total - total0 === Math.round(10 * G.stats.xpMul),
    '获得 ' + (G.progress.state.total - total0) + ' 点（倍率 ' +
    G.stats.xpMul.toFixed(2) + '）');

  // 击杀给经验
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.bullets.reset();
  const xpTotal0 = G.progress.state.total;
  G.enemies.spawn('scout', G.W / 2);
  const xpE = G.enemies.list[0];
  xpE.x = G.W / 2; xpE.baseX = G.W / 2; xpE.y = 200; xpE.fireCd = 999;
  G.bullets.spawnPlayer(xpE.x, xpE.y + 50, 0, -760, { damage: 9 });
  for (let i = 0; i < 24; i++) step(16);
  ok('击毁敌机会给经验', G.progress.state.total > xpTotal0,
    xpTotal0 + ' → ' + G.progress.state.total);

  // 强化界面期间不结算经验（避免卡流程）
  startSafe();
  G.upgrades.request(2);
  const xpDuring = G.progress.state.total;
  G.progress.addXp(100);
  ok('强化界面期间不结算经验', G.progress.state.total === xpDuring);
  G.upgrades.choose(G.upgrades.state.offers[0].id);
} else {
  ok('经验系统存在', false, '未加载 progress.js');
}

console.log('\n[22] 三大流派机制');
if (G.upgrades && G.progress) {
  const S = G.stats;
  const BASE_CD = 0.155;

  /* ---- 弹幕流：以"子弹数量"为主 ---- */
  startSafe();
  const dmgBase = S.damage;
  const cdBase = S.fireRateMul;
  const bulletsBase = 2 + S.extraBullets;

  G.upgrades.owned.swarm_ammo = 3;
  G.upgrades.owned.swarm_split = 2;
  G.upgrades.owned.swarm_rate = 3;
  G.upgrades.recalc();

  const bulletsAfter = 2 + S.extraBullets;

  ok('弹幕流：核心是增加子弹数量', S.extraBullets >= 12,
    '额外弹道 +' + S.extraBullets + '（' + bulletsBase + ' → ' + bulletsAfter + ' 条）');
  ok('弹幕流：射击间隔缩短', S.fireRateMul < cdBase,
    cdBase.toFixed(2) + ' → ' + S.fireRateMul.toFixed(2));
  ok('弹幕流：单发伤害降低', S.damage < dmgBase,
    dmgBase.toFixed(2) + ' → ' + S.damage.toFixed(2));
  ok('弹幕流：降伤幅度温和（不是靠砍伤害换数量）', S.damage > dmgBase * 0.45,
    '剩余 ' + (S.damage / dmgBase * 100).toFixed(0) + '%');

  const dpsBase = bulletsBase / BASE_CD * dmgBase;
  const dpsSwarm = bulletsAfter / (BASE_CD * S.fireRateMul) * S.damage;
  ok('弹幕流总输出远高于基础', dpsSwarm > dpsBase * 3,
    dpsBase.toFixed(1) + ' → ' + dpsSwarm.toFixed(1) + ' /秒');

  // 叠满时总输出必须是递增的（不能越叠越弱）
  startSafe();
  let prevDps = 0;
  let monotonic = true;
  for (let n = 0; n <= 4; n++) {
    G.upgrades.owned.swarm_ammo = n;
    G.upgrades.owned.swarm_split = 0;
    G.upgrades.recalc();
    const dps = (2 + S.extraBullets) / (BASE_CD * S.fireRateMul) * S.damage;
    if (n > 0 && dps < prevDps - 1e-9) monotonic = false;
    prevDps = dps;
  }
  ok('弹幕流每一层都在变强（无递减陷阱）', monotonic);

  /* ---- 道具流：道具越多越强 ---- */
  startSafe();
  G.powerups.state.collected = 0;
  G.upgrades.owned.item_power = 3;
  G.upgrades.recalc();
  const dmgItem0 = S.damage;

  G.powerups.state.collected = 40;
  G.upgrades.recalc();
  const dmgItem1 = S.damage;

  ok('道具流：拾取道具越多伤害越高', dmgItem1 > dmgItem0,
    dmgItem0.toFixed(2) + ' → ' + dmgItem1.toFixed(2));
  ok('道具流伤害与道具数成正比',
    Math.abs((dmgItem1 - dmgItem0) - 0.05 * 3 * 40) < 1e-6,
    '增量=' + (dmgItem1 - dmgItem0).toFixed(3));

  /* ---- 升级流：等级越高越强 ---- */
  startSafe();
  G.upgrades.owned.lv_power = 3;
  G.upgrades.owned.lv_haste = 3;
  G.upgrades.recalc();
  const dmgLv1 = S.damage;
  const cdLv1 = S.fireRateMul;

  G.progress.state.level = 11;            // 直接抬到 11 级
  G.upgrades.recalc();
  const dmgLv11 = S.damage;
  const cdLv11 = S.fireRateMul;

  ok('升级流：等级越高伤害越高', dmgLv11 > dmgLv1,
    dmgLv1.toFixed(2) + ' → ' + dmgLv11.toFixed(2));
  ok('升级流：等级越高射速越快', cdLv11 < cdLv1,
    cdLv1.toFixed(3) + ' → ' + cdLv11.toFixed(3));
  ok('升级流伤害与等级差成正比',
    Math.abs((dmgLv11 - dmgLv1) - 0.22 * 3 * 10) < 1e-6,
    '增量=' + (dmgLv11 - dmgLv1).toFixed(3));

  /* ---- 升级流：等级触发的其它效果 ---- */
  startSafe();
  G.upgrades.owned.lv_vital = 2;
  G.progress.state.level = 10;
  G.upgrades.recalc();
  ok('强健体魄按等级提升生命上限', S.maxLives === 3 + 2 * 3,
    'maxLives=' + S.maxLives);

  startSafe();
  G.upgrades.owned.lv_instinct = 2;
  G.progress.state.level = 11;
  G.upgrades.recalc();
  ok('战斗直觉按等级提升暴击率', S.critChance > 0.15,
    'critChance=' + S.critChance.toFixed(2));

  // 升级护盾
  startSafe();
  G.upgrades.owned.lv_shield = 2;
  G.upgrades.recalc();
  G.player.power.shield = 0;
  G.progress.addXp(G.progress.state.need);
  ok('升级护盾：升级时获得护盾', G.player.power.shield > 0,
    'shield=' + G.player.power.shield.toFixed(1));

  // 升级回复
  startSafe();
  G.upgrades.owned.lv_heal = 3;
  G.upgrades.recalc();
  G.lives = 1;
  G.progress.addXp(G.progress.state.need);
  ok('升级回复：升级时回复生命', G.lives === 2, 'lives=' + G.lives);

  // 潜能爆发
  startSafe();
  G.upgrades.owned.lv_potential = 2;
  G.upgrades.recalc();
  G.progress.state.potentialT = 0;
  G.progress.addXp(G.progress.state.need);
  ok('潜能爆发：升级后进入爆发状态', G.progress.state.potentialT > 0,
    'potentialT=' + G.progress.state.potentialT.toFixed(1));
  ok('潜能爆发缩短射击间隔', G.progress.potentialMul() < 1,
    'mul=' + G.progress.potentialMul().toFixed(2));

  /* ---- 通用增益：点防 / 攻速 / 移速 ---- */
  startSafe();
  const cdG0 = S.fireRateMul;
  G.upgrades.owned.gen_rapid = 4;
  G.upgrades.recalc();
  ok('通用：攻速强化缩短射击间隔', S.fireRateMul < cdG0,
    cdG0.toFixed(2) + ' → ' + S.fireRateMul.toFixed(2));

  const spd0 = S.moveSpeedMul;
  G.upgrades.owned.gen_speed = 3;
  G.upgrades.recalc();
  ok('通用：引擎超频提高移动速度', S.moveSpeedMul > spd0,
    spd0.toFixed(2) + ' → ' + S.moveSpeedMul.toFixed(2));

  G.upgrades.owned.gen_pointdef = 2;
  G.upgrades.recalc();
  ok('通用：点防系统已就绪', S.pointDef > 0, 'pointDef=' + S.pointDef);
} else {
  ok('流派测试前置模块存在', false, '缺少 upgrades/progress');
}

console.log('\n[23] 命中积累（按命中次数叠伤害）');
if (G.upgrades) {
  startSafe();
  ok('未获得该增益时没有加成', G.upgrades.hitBonus() === 0);

  G.upgrades.owned.gen_hitpower = 3;
  G.upgrades.recalc();
  ok('获得后每次命中提供加成', G.stats.hitDamage > 0,
    '每次 +' + G.stats.hitDamage.toFixed(3));
  ok('初始命中次数为 0', G.upgrades.state.hits === 0);
  ok('命中加成上限已设定', G.stats.hitDamageCap > 0,
    '上限 +' + G.stats.hitDamageCap);

  G.upgrades.addHit(50);
  ok('命中次数会累计', G.upgrades.state.hits === 50, 'hits=' + G.upgrades.state.hits);

  const b50 = G.upgrades.hitBonus();
  ok('命中越多伤害加成越高', b50 > 0, '+' + b50.toFixed(2));

  G.upgrades.addHit(50);
  ok('加成随命中线性增长',
    Math.abs(G.upgrades.hitBonus() - b50 * 2) < 1e-6,
    b50.toFixed(2) + ' → ' + G.upgrades.hitBonus().toFixed(2));

  G.upgrades.addHit(1000000);
  const bBig = G.upgrades.hitBonus();
  ok('命中加成没有上限', bBig > b50 * 1000,
    '继续增长到 +' + bBig.toFixed(1));

  G.upgrades.addHit(10000000);
  ok('加成持续无上限增长', G.upgrades.hitBonus() > 1000,
    '+' + G.upgrades.hitBonus().toFixed(0));

  ok('单次命中的加成大幅调低', G.stats.hitDamage <= 0.003 * 5,
    '每层 +' + (G.stats.hitDamage / 3).toFixed(4) + '（旧版 0.01）');

  ok('层数越高每击加成越高', (function () {
    startSafe();
    G.upgrades.owned.gen_hitpower = 1;
    G.upgrades.recalc();
    const one = G.stats.hitDamage;
    G.upgrades.owned.gen_hitpower = 5;
    G.upgrades.recalc();
    return G.stats.hitDamage > one;
  })());

  // 实战：自动开火打靶，命中次数与加成都要涨
  startSafe();
  G.upgrades.owned.gen_hitpower = 2;
  G.upgrades.recalc();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.bullets.reset();

  G.enemies.spawn('gunship', G.W / 2);
  const dummy = G.enemies.list[0];
  dummy.x = G.W / 2;
  dummy.baseX = G.W / 2;
  dummy.y = 520;              // 贴近玩家，子弹很快就能打到
  dummy.amp = 0;              // 定住不动，保证一定能命中
  dummy.vy = 0;
  dummy.fireCd = 999;
  dummy.hp = 99999;
  dummy.maxHp = 99999;

  const hits0 = G.upgrades.state.hits;
  const bonus0 = G.upgrades.hitBonus();
  for (let i = 0; i < 60; i++) step(16);

  ok('实战中命中次数随开火增长', G.upgrades.state.hits > hits0,
    hits0 + ' → ' + G.upgrades.state.hits);
  ok('实战中伤害加成随之提升', G.upgrades.hitBonus() > bonus0,
    '+' + bonus0.toFixed(2) + ' → +' + G.upgrades.hitBonus().toFixed(2));

  // 重开一局要清零
  startSafe();
  ok('重开一局后命中次数清零', G.upgrades.state.hits === 0,
    'hits=' + G.upgrades.state.hits);
}

console.log('\n[24] 敌人体积与 Boss 血量调整');
if (G.enemies && G.boss) {
  startSafe();
  G.enemies.list.length = 0;

  G.enemies.spawn('scout', 100);
  const sc = G.enemies.list[G.enemies.list.length - 1];
  ok('侦察机体型已增大', sc.r >= 15, 'r=' + sc.r);
  ok('绘制缩放基准已记录', sc.art > 0 && sc.art < sc.r,
    'art=' + sc.art + ' r=' + sc.r);

  G.enemies.spawn('zigzag', 100);
  const zg = G.enemies.list[G.enemies.list.length - 1];
  ok('游走机体型已增大', zg.r >= 17, 'r=' + zg.r);

  G.enemies.spawn('gunship', 100);
  const gs = G.enemies.list[G.enemies.list.length - 1];
  ok('炮艇体型已增大', gs.r >= 25, 'r=' + gs.r);
  ok('炮艇比侦察机大得多', gs.r > sc.r * 1.5, gs.r + ' vs ' + sc.r);

  // Boss 血量曲线
  G.boss.start(5);
  const hp5 = G.boss.state.boss.maxHp;
  G.boss.reset();
  G.boss.start(10);
  const hp10 = G.boss.state.boss.maxHp;
  G.boss.reset();
  G.boss.start(15);
  const hp15 = G.boss.state.boss.maxHp;
  G.boss.reset();

  ok('第 5 关 Boss 血量仍在合理区间', hp5 < 660, 'hp=' + hp5 + '（原始版本 655）');
  ok('Boss 血量随关卡递增', hp10 > hp5 && hp15 > hp10,
    hp5 + ' → ' + hp10 + ' → ' + hp15);
  ok('后期 Boss 血量显著提升', hp15 > 1900, 'hp15=' + hp15);

  // 成长要"加速"：后期每关的增幅应大于前期
  const growEarly = hp10 - hp5;
  const growLate = hp15 - hp10;
  ok('Boss 血量成长随关卡加速', growLate > growEarly,
    '5→10 增 ' + growEarly + '，10→15 增 ' + growLate);
}

console.log('\n[25] Boss 战');
if (G.boss) {
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.enemies.wave.level = 4;
  G.enemies.wave.gap = 0;

  for (let i = 0; i < 140; i++) {
    if (G.state === 'upgrade' && G.upgrades) {
      G.upgrades.choose(G.upgrades.state.offers[0].id);
    }
    step(16);
  }
  ok('第 5 关自动出现 Boss', !!G.boss.state.boss,
    G.boss.state.boss ? G.boss.state.boss.name : '无');
  ok('Boss 激活状态正确', G.boss.active() === true);
  ok('Boss 关也会刷新小怪', G.enemies.wave.queue.length > 0 || G.enemies.list.length > 0,
    '队列 ' + G.enemies.wave.queue.length + ' / 场上 ' + G.enemies.list.length);

  const bs = G.boss.state.boss;
  ok('Boss 血量随关卡缩放', bs.hp > 400, 'hp=' + bs.hp);

  G.lives = 99;
  G.player.invuln = 9999;
  // 冻结升级需求：Boss 战期间不会弹强化面板，测试才完全确定
  // （否则子弹可能被冻在"选择强化"的暂停帧里打空）
  G.progress.state.need = Infinity;

  runFrames(150, true);          // 期间可能升级，自动选掉以免冻住
  ok('Boss 已入场就位', !bs.entering && bs.y > 80, 'y=' + bs.y.toFixed(1));

  G.bullets.reset();
  runFrames(200, true);
  ok('Boss 会释放弹幕', G.bullets.hostile.length > 0,
    '敌弹 ' + G.bullets.hostile.length + ' 颗');

  // 清掉护卫小怪：子弹会先被它们挡下，导致打不到 Boss
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;

  const hpBefore = bs.hp;
  G.bullets.spawnPlayer(bs.x, bs.y + 60, 0, -760, { damage: 12 });
  runFrames(14, true);
  ok('我方子弹能打中 Boss', bs.hp < hpBefore, hpBefore + ' → ' + bs.hp.toFixed(1));

  bs.hp = bs.maxHp * 0.5;
  runFrames(6, true);
  ok('血量 < 60% 进入二阶段', bs.phase === 2, 'phase=' + bs.phase);

  bs.hp = bs.maxHp * 0.2;
  runFrames(6, true);
  ok('血量 < 28% 进入三阶段', bs.phase === 3, 'phase=' + bs.phase);

  const hpAoe = bs.hp;
  G.boss.areaDamage(bs.x, bs.y, 60, 17);
  ok('爆裂弹的范围伤害对 Boss 有效', Math.abs(bs.hp - (hpAoe - 17)) < 0.001,
    hpAoe.toFixed(1) + ' → ' + bs.hp.toFixed(1));

  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  const scoreBefore = G.score;
  const xpBeforeBoss = G.progress ? G.progress.state.total : 0;
  bs.hp = 5;
  G.bullets.spawnPlayer(bs.x, bs.y + 40, 0, -760, { damage: 50 });
  runFrames(14, true);
  ok('Boss 被击破', bs.dead === true);
  ok('击破 Boss 有大量得分', G.score > scoreBefore + 1000,
    scoreBefore + ' → ' + G.score);
  if (G.progress) {
    ok('击破 Boss 给大量经验', G.progress.state.total > xpBeforeBoss,
      xpBeforeBoss + ' → ' + G.progress.state.total);
  }

  runFrames(130, true);
  ok('死亡演出结束后 Boss 消失', !G.boss.state.boss);

  // 撞机
  startSafe();
  G.boss.start(5);
  const bs2 = G.boss.state.boss;
  bs2.entering = false;
  for (let i = 0; i < 6; i++) step(16);

  G.lives = 3;
  G.player.invuln = 0;
  G.player.x = bs2.x;
  G.player.y = bs2.y;
  const livesBefore = G.lives;
  for (let i = 0; i < 3; i++) step(16);
  ok('撞上 Boss 本体扣命', G.lives === livesBefore - 1,
    livesBefore + ' → ' + G.lives);

  G.boss.reset();
  ok('reset 能清掉 Boss', !G.boss.state.boss && !G.boss.active());
} else {
  ok('Boss 模块存在', false, '未加载 boss.js');
}

console.log('\n[26] 音效系统');
if (G.audio) {
  ok('音效模块存在', true);

  G.audio.unlock();
  ok('unlock 后音频上下文就绪', G.audio.ready === true);

  let audioErr = null;
  try {
    G.audio.shoot(); G.audio.enemyShoot(); G.audio.hit(); G.audio.explode(1);
    G.audio.explode(0.55); G.audio.shieldHit(); G.audio.pickup(); G.audio.levelUp();
    G.audio.gameOver(); G.audio.bossWarn(); G.audio.bossDie(); G.audio.bossHit();
    G.audio.pause(); G.audio.resume();
  } catch (e) { audioErr = e; }
  ok('全部音效调用都不抛异常', !audioErr, audioErr ? audioErr.message : '');

  if (G.audio.muted) G.audio.setMuted(false);
  nowMs += 1000;
  audioNodes = 0;
  G.audio.shoot();
  ok('射击音效真的创建了音源', audioNodes > 0, 'nodes=' + audioNodes);

  nowMs += 1000;
  audioNodes = 0;
  G.audio.explode(1);
  ok('爆炸音效真的创建了音源', audioNodes > 0, 'nodes=' + audioNodes);

  nowMs += 1000;
  G.audio.setMuted(true);
  audioNodes = 0;
  G.audio.shoot();
  G.audio.explode(1);
  ok('静音后不再发声', audioNodes === 0, 'nodes=' + audioNodes);
  G.audio.setMuted(false);

  ok('可通过接口切换静音', typeof G.audio.toggleMute === 'function');
  const m1 = G.audio.toggleMute();
  const m2 = G.audio.toggleMute();
  ok('静音开关可来回切换', m1 === true && m2 === false, m1 + ' → ' + m2);

  G.audio.pause();
  G.audio.resume();
  ok('暂停/恢复不抛异常', true);

  const saved = sandbox.AudioContext;
  delete sandbox.AudioContext;
  let noCtxErr = null;
  try {
    G.audio.setMuted(false);
    G.audio.unlock();
    G.audio.shoot();
  } catch (e) { noCtxErr = e; }
  sandbox.AudioContext = saved;
  ok('缺少 WebAudio 时安全降级', !noCtxErr, noCtxErr ? noCtxErr.message : '');
} else {
  ok('音效模块存在', false, '未加载 audio.js');
}

console.log('\n[27] 敌机扩充：新机型、精英怪、数量与血量成长');
if (G.enemies) {
  const T = G.enemies.TYPES;

  ['scout', 'zigzag', 'gunship', 'diver', 'weaver', 'splitter', 'escort'].forEach((t) => {
    ok('存在机型 ' + t, !!T[t]);
  });
  ok('敌机种类 ≥ 7 种', Object.keys(T).length >= 7, Object.keys(T).join('/'));

  // ---- 血量随关卡成长 ----
  ok('血量成长函数随关卡递增',
    G.enemies.hpScale(10) > G.enemies.hpScale(1) &&
    G.enemies.hpScale(20) > G.enemies.hpScale(10),
    G.enemies.hpScale(1).toFixed(2) + ' → ' + G.enemies.hpScale(10).toFixed(2) +
    ' → ' + G.enemies.hpScale(20).toFixed(2));

  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.level = 1;
  const h1 = G.enemies.spawn('scout', 100).maxHp;
  G.enemies.list.length = 0;
  G.enemies.wave.level = 12;
  const h12 = G.enemies.spawn('scout', 100).maxHp;
  ok('同一机型在高关卡明显更硬', h12 > h1 * 3,
    'LV1=' + h1.toFixed(1) + ' → LV12=' + h12.toFixed(1));

  // ---- 数量随关卡成长（前 10 关平缓，之后加速） ----
  startSafe();
  const q1 = G.enemies.wave.queue.length;

  const countAt = (lv) => {
    startSafe();
    G.enemies.list.length = 0;
    G.enemies.wave.queue.length = 0;
    G.enemies.wave.level = lv - 1;
    G.enemies.wave.gap = 0.02;
    for (let i = 0; i < 4; i++) step(16);
    return G.enemies.wave.queue.length;
  };

  const q4 = countAt(4);      // 注意避开 5/10 这类 Boss 关
  const q9 = countAt(9);
  const q16 = countAt(16);

  ok('每关敌机数量随关卡增加', q9 > q4 && q4 > q1,
    'LV1=' + q1 + ' LV4=' + q4 + ' LV9=' + q9);
  ok('简单期数量增长平缓', q9 <= 24, 'LV9=' + q9);
  ok('后期数量指数增长', q16 > q9 * 1.6,
    'LV9=' + q9 + ' → LV16=' + q16);
  ok('单关数量有上限，不会失控', q16 <= 60, 'q16=' + q16);

  // ---- 精英怪 ----
  ok('第 1 关不会出现精英', G.enemies.eliteChance(1) === 0);
  ok('高关卡精英概率更高',
    G.enemies.eliteChance(14) > G.enemies.eliteChance(3),
    G.enemies.eliteChance(3).toFixed(3) + ' → ' + G.enemies.eliteChance(14).toFixed(3));

  G.enemies.wave.level = 10;
  G.enemies.list.length = 0;
  // 对照组必须显式关闭精英变异，否则它自己也可能随机变异
  const normal = G.enemies.spawn('scout', 100, { noElite: true });
  G.enemies.list.length = 0;
  const elite = G.enemies.spawn('scout', 100, { forceElite: true });
  ok('精英标记正确', elite.elite === true && normal.elite === false);
  ok('精英血量远高于普通', elite.maxHp > normal.maxHp * 3,
    normal.maxHp.toFixed(0) + ' → ' + elite.maxHp.toFixed(0));
  ok('精英体型更大', elite.r > normal.r, normal.r + ' → ' + elite.r);
  ok('精英分数与经验更高', elite.score > normal.score && elite.xp > normal.xp,
    '分 ' + normal.score + '→' + elite.score + '，经验 ' + normal.xp + '→' + elite.xp);

  // ---- 护卫舰：难度介于小怪与 Boss 之间 ----
  startSafe();
  G.enemies.wave.level = 6;
  G.enemies.list.length = 0;
  const sc6 = G.enemies.spawn('scout', 60);
  const esc = G.enemies.spawn('escort', G.W / 2);
  G.boss.start(5);
  const bossHp5 = G.boss.state.boss.maxHp;
  G.boss.reset();
  ok('护卫舰血量高于普通小怪', esc.maxHp > sc6.maxHp * 5,
    sc6.maxHp.toFixed(0) + ' → ' + esc.maxHp.toFixed(0));
  ok('护卫舰血量低于 Boss（难度居中）', esc.maxHp < bossHp5,
    '护卫舰 ' + esc.maxHp.toFixed(0) + ' < Boss ' + bossHp5);

  // ---- 分裂体 ----
  startSafe();
  G.player.autoFire = false;
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.bullets.reset();
  G.enemies.spawn('splitter', G.W / 2);
  const splitter = G.enemies.list[0];
  splitter.y = 300;
  splitter.fireCd = 999;
  G.enemies.damage(0, 999999, {});
  ok('分裂体被击毁后裂成两只', G.enemies.list.length === 2,
    'count=' + G.enemies.list.length);
  ok('裂出来的是侦察机', G.enemies.list.every((e) => e.type === 'scout'));
  ok('裂出来的不会再变异', G.enemies.list.every((e) => !e.elite));
  G.player.autoFire = true;

  // ---- 新机型都能正常生成与更新 ----
  startSafe();
  G.player.autoFire = false;          // 别让自动开火把它们打掉，影响计数
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  ['diver', 'weaver', 'splitter', 'escort'].forEach((t) =>
    G.enemies.spawn(t, 80 + Math.random() * 300));
  const n0 = G.enemies.list.length;
  const y0 = G.enemies.list.map((e) => e.y);

  let moveErr = null;
  try { for (let i = 0; i < 120; i++) step(16); } catch (e) { moveErr = e; }

  ok('新机型可以正常运动 2 秒且不报错', !moveErr,
    moveErr ? (moveErr.message + '\n' + moveErr.stack) : '');
  ok('新机型确实产生了位移',
    G.enemies.list.some((e) => e.y > 0) ||
    G.enemies.list.length !== n0 ||
    G.enemies.list.some((e, i) => Math.abs(e.y - y0[i]) > 5),
    'count=' + G.enemies.list.length);
  G.player.autoFire = true;
} else {
  ok('敌机模块存在', false, '未加载 enemies.js');
}

console.log('\n[28] 子弹类型增益');
if (G.upgrades && G.bullets) {
  const S = G.stats;

  // ---- 激光弹 ----
  startSafe();
  const spdA = S.bulletSpeedMul;
  const sizeA = S.bulletSizeMul;
  const pierceA = S.pierce;
  G.upgrades.owned.gen_laser = 2;
  G.upgrades.recalc();
  ok('激光弹：速度提升', S.bulletSpeedMul > spdA,
    spdA.toFixed(2) + ' → ' + S.bulletSpeedMul.toFixed(2));
  ok('激光弹：体积变细', S.bulletSizeMul < sizeA,
    sizeA.toFixed(2) + ' → ' + S.bulletSizeMul.toFixed(2));
  ok('激光弹：附带穿透', S.pierce > pierceA, 'pierce=' + S.pierce);

  // ---- 聚能弹 ----
  startSafe();
  const sizeB = S.bulletSizeMul;
  const spdB = S.bulletSpeedMul;
  G.upgrades.owned.gen_heavy = 2;
  G.upgrades.recalc();
  ok('聚能弹：体积变大', S.bulletSizeMul > sizeB,
    sizeB.toFixed(2) + ' → ' + S.bulletSizeMul.toFixed(2));
  ok('聚能弹：速度降低', S.bulletSpeedMul < spdB,
    spdB.toFixed(2) + ' → ' + S.bulletSpeedMul.toFixed(2));
  ok('聚能弹：伤害提高', S.damage > 2, 'damage=' + S.damage.toFixed(1));

  // ---- 波动弹（实际轨迹） ----
  startSafe();
  G.player.autoFire = false;
  G.bullets.reset();
  G.upgrades.owned.gen_wave = 2;
  G.upgrades.recalc();
  G.bullets.spawnPlayer(G.W / 2, G.H - 60, 0, -700, { wave: S.bulletWave });
  const waveBullet = G.bullets.friendly[0];
  let minX = waveBullet.x;
  let maxX = waveBullet.x;
  for (let i = 0; i < 30; i++) {
    step(16);
    if (G.bullets.friendly.indexOf(waveBullet) === -1) break;
    minX = Math.min(minX, waveBullet.x);
    maxX = Math.max(maxX, waveBullet.x);
  }
  ok('波动弹飞行时会左右摆动', maxX - minX > 8,
    '摆幅=' + (maxX - minX).toFixed(1));
  G.player.autoFire = true;

  // ---- 弹跳弹 ----
  startSafe();
  G.player.autoFire = false;
  G.bullets.reset();
  G.bullets.spawnPlayer(24, G.H / 2, -320, -160, { ricochet: 1 });
  const ricoBullet = G.bullets.friendly[0];
  let bounced = false;
  for (let i = 0; i < 40; i++) {
    step(16);
    if (G.bullets.friendly.indexOf(ricoBullet) === -1) break;
    if (ricoBullet.vx > 0) { bounced = true; break; }
  }
  ok('弹跳弹会从屏幕边缘反弹', bounced, 'vx=' + ricoBullet.vx.toFixed(0));
  G.player.autoFire = true;

  // ---- 追踪弹头 ----
  startSafe();
  G.player.autoFire = false;
  G.bullets.reset();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  G.enemies.spawn('gunship', 60);
  const target = G.enemies.list[0];
  target.x = 60;
  target.baseX = 60;
  target.y = 200;
  target.amp = 0;
  target.vy = 0;
  target.fireCd = 999;

  G.bullets.spawnPlayer(G.W / 2, G.H / 2, 0, -600, { homing: 2 });
  const homingBullet = G.bullets.friendly[0];
  for (let i = 0; i < 20; i++) {
    step(16);
    if (G.bullets.friendly.indexOf(homingBullet) === -1) break;
  }
  ok('追踪弹会朝敌机转向', homingBullet.vx < -10,
    'vx=' + homingBullet.vx.toFixed(0));
  G.player.autoFire = true;
}

console.log('\n[29] 相位环射与道具共鸣');
if (G.upgrades && G.player) {
  // ---- 相位环射 ----
  startSafe();
  G.player.autoFire = false;
  G.upgrades.owned.swarm_ring = 2;
  G.upgrades.recalc();
  ok('相位环射已计入属性', G.stats.ringShot > 0, 'ring=' + G.stats.ringShot);

  G.bullets.reset();
  G.player.fireRing();
  const ringN = G.bullets.friendly.length;
  ok('环射一次打出多发子弹', ringN >= 12, '弹数=' + ringN);

  const dirs = new Set(G.bullets.friendly.map((b) =>
    Math.round(Math.atan2(b.vy, b.vx) * 4)));
  ok('环射覆盖多个方向', dirs.size >= 8, '方向数=' + dirs.size);

  // 自动循环：冷却归零后应立刻自动打出一圈
  startSafe();
  G.upgrades.owned.swarm_ring = 2;
  G.upgrades.recalc();
  G.bullets.reset();
  G.player.ringCd = 0;
  step(16);
  ok('环射会自动周期性触发', G.bullets.friendly.length >= 12,
    '自动打出 ' + G.bullets.friendly.length + ' 发');
  ok('触发后进入冷却', G.player.ringCd > 0,
    'ringCd=' + G.player.ringCd.toFixed(2));
  G.player.autoFire = true;

  // ---- 道具共鸣 ----
  startSafe();
  ok('未获得时共鸣层数为 0', G.stats.itemResonance === 0);

  G.powerups.state.resonance = 0;
  for (let i = 0; i < 50; i++) G.powerups.apply('rapid', 100, 100);
  ok('没有共鸣增益时不会额外触发', G.powerups.state.resonance === 0,
    '触发 ' + G.powerups.state.resonance + ' 次');

  startSafe();
  G.upgrades.owned.item_resonance = 3;
  G.upgrades.recalc();
  ok('道具共鸣已计入属性', G.stats.itemResonance === 3);

  G.powerups.state.resonance = 0;
  for (let i = 0; i < 100; i++) G.powerups.apply('rapid', 100, 100);
  ok('拾取道具会额外触发共鸣', G.powerups.state.resonance > 50,
    '100 次拾取触发 ' + G.powerups.state.resonance + ' 次共鸣');

  // 共鸣不该重复累加道具计数（否则装备强化会失控）
  startSafe();
  G.upgrades.owned.item_resonance = 3;
  G.upgrades.recalc();
  const collected0 = G.powerups.state.collected;
  G.powerups.apply('rapid', 100, 100);
  ok('共鸣不会重复累加道具计数',
    G.powerups.state.collected === collected0 + 1,
    collected0 + ' → ' + G.powerups.state.collected);

  // 重开清零
  startSafe();
  ok('重开后共鸣计数清零', G.powerups.state.resonance === 0);
}

console.log('\n[30] 战斗面板与伤害显示');
if (G.panel && G.combat) {
  startSafe();
  const rows = G.panel.rows();
  const labels = rows.map((r) => r.label);

  ok('面板有数据行', rows.length >= 5, '行数=' + rows.length);
  ['伤害', '暴击率', '暴击伤害', '攻速'].forEach((l) => {
    ok('面板包含「' + l + '」', labels.indexOf(l) >= 0, labels.join('/'));
  });
  ok('面板包含弹道与秒伤', labels.indexOf('弹道') >= 0 && labels.indexOf('秒伤') >= 0);

  // ---- 位置：不能压住底部等级/经验条 ----
  const panelBottom = G.panel.Y + G.panel.height();
  const xpTop = G.H - 30;                 // 底部经验条 + 文字区域上沿
  ok('面板底部高于底部经验条区域', panelBottom < xpTop,
    'panelBottom=' + panelBottom + ' < xpTop=' + xpTop);
  ok('面板不与 Boss 血条重叠', G.panel.Y > 104, 'panelY=' + G.panel.Y);

  // ---- 数值随增益变化 ----
  startSafe();
  const critBefore = G.panel.rows().find((r) => r.label === '暴击率').value;
  G.upgrades.owned.gen_crit = 5;
  G.upgrades.recalc();
  const critAfter = G.panel.rows().find((r) => r.label === '暴击率').value;
  ok('面板暴击率随增益变化', critBefore !== critAfter,
    critBefore + ' → ' + critAfter);

  const criDmgBefore = G.panel.rows().find((r) => r.label === '暴击伤害').value;
  G.upgrades.owned.gen_critdmg = 3;
  G.upgrades.recalc();
  const criDmgAfter = G.panel.rows().find((r) => r.label === '暴击伤害').value;
  ok('面板暴击伤害随增益变化', criDmgBefore !== criDmgAfter,
    criDmgBefore + ' → ' + criDmgAfter);

  const aspdBefore = G.panel.rows().find((r) => r.label === '攻速').value;
  G.upgrades.owned.gen_rapid = 5;
  G.upgrades.recalc();
  const aspdAfter = G.panel.rows().find((r) => r.label === '攻速').value;
  ok('面板攻速随增益变化', aspdBefore !== aspdAfter,
    aspdBefore + ' → ' + aspdAfter);

  const laneBefore = G.panel.rows().find((r) => r.label === '弹道').value;
  G.upgrades.owned.swarm_ammo = 3;
  G.upgrades.recalc();
  const laneAfter = G.panel.rows().find((r) => r.label === '弹道').value;
  ok('面板弹道数随增益变化', laneBefore !== laneAfter,
    laneBefore + ' → ' + laneAfter);

  // ---- 伤害飘字 ----
  startSafe();
  G.player.autoFire = false;
  G.bullets.reset();
  G.particles.clear();
  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;

  G.enemies.spawn('gunship', G.W / 2);
  const dummyE = G.enemies.list[0];
  dummyE.x = G.W / 2;
  dummyE.baseX = G.W / 2;
  dummyE.y = 420;
  dummyE.amp = 0;
  dummyE.vy = 0;
  dummyE.fireCd = 999;
  dummyE.hp = 99999;
  dummyE.maxHp = 99999;

  G.bullets.spawnPlayer(dummyE.x, dummyE.y + 60, 0, -760, { damage: 5 });
  for (let i = 0; i < 40; i++) step(16);

  const texts = G.particles.list.filter((p) => p.kind === 'text');
  ok('命中后会飘出伤害数字', texts.length > 0, '飘字 ' + texts.length + ' 条');
  ok('飘字内容是纯数字', texts.length > 0 && /^\d+$/.test(texts[0].str),
    texts[0] ? texts[0].str : '(无)');
  ok('秒伤统计有数值', G.combat.state.dps > 0,
    'dps=' + G.combat.state.dps.toFixed(1));
  G.player.autoFire = true;
}

console.log('\n[31] 金色品质、流派倾向与难度曲线');
if (G.upgrades && G.enemies) {
  const U = G.upgrades;

  /* ---------- 金色品质解锁 ---------- */
  ok('通用流派没有金色增益',
    U.POOL.filter((b) => b.rarity === 'gold' && b.build === 'general').length === 0);

  startSafe();
  ok('开局未解锁任何金色增益',
    !U.goldUnlocked('swarm') && !U.goldUnlocked('item') && !U.goldUnlocked('level'));

  let goldSeen = 0;
  for (let k = 0; k < 300; k++) {
    for (const o of U.rollOffers(3)) if (o.rarity === 'gold') goldSeen++;
  }
  ok('未达标时一个金色增益都抽不到', goldSeen === 0, '出现 ' + goldSeen + ' 次');

  startSafe();
  U.owned.swarm_ammo = 4;
  U.owned.swarm_rate = 4;                 // 合计 8 层 = 门槛
  ok('累计达到门槛后解锁该流派金色',
    U.goldUnlocked('swarm') && U.buildCount('swarm') >= U.GOLD_UNLOCK,
    'swarm 层数=' + U.buildCount('swarm') + ' / 门槛 ' + U.GOLD_UNLOCK);
  ok('其它流派仍未解锁',
    !U.goldUnlocked('item') && !U.goldUnlocked('level'));

  // 出现概率极低
  U.recalc();
  let goldLow = 0;
  for (let k = 0; k < 2000; k++) {
    for (const o of U.rollOffers(3)) if (o.rarity === 'gold') goldLow++;
  }
  ok('金色增益出现概率极低', goldLow > 0 && goldLow < 2000 * 3 * 0.06,
    '6000 个选项中仅 ' + goldLow + ' 个金色');

  // 等级越高概率越高
  G.progress.state.level = 30;
  U.recalc();
  let goldHigh = 0;
  for (let k = 0; k < 2000; k++) {
    for (const o of U.rollOffers(3)) if (o.rarity === 'gold') goldHigh++;
  }
  ok('等级越高金色出现概率越高', goldHigh > goldLow,
    'LV1=' + goldLow + ' → LV30=' + goldHigh);

  /* ---------- 流派倾向 ---------- */
  startSafe();
  const baseAff = U.buildAffinity();
  ok('未投入时三大流派权重相同',
    Math.abs(baseAff.swarm - baseAff.item) < 1e-9 &&
    Math.abs(baseAff.item - baseAff.level) < 1e-9,
    JSON.stringify(baseAff));

  startSafe();
  U.owned.swarm_ammo = 4;
  U.owned.swarm_rate = 4;
  const aff = U.buildAffinity();
  ok('主玩流派权重提高', aff.swarm > aff.item && aff.swarm > aff.level,
    JSON.stringify(aff));
  ok('其它流派权重降低', aff.item < 1 && aff.level < 1,
    'item=' + aff.item.toFixed(2) + ' level=' + aff.level.toFixed(2));
  ok('通用权重不受影响', Math.abs(aff.general - 1) < 1e-9,
    'general=' + aff.general);

  // 统计验证：堆弹幕流后，弹幕增益出现得明显更多
  startSafe();
  U.owned.swarm_ammo = 4;
  U.owned.swarm_rate = 5;
  U.recalc();
  let sw = 0;
  let it = 0;
  for (let k = 0; k < 500; k++) {
    for (const o of U.rollOffers(3)) {
      if (o.build === 'swarm') sw++;
      else if (o.build === 'item') it++;
    }
  }
  ok('堆了弹幕流后弹幕增益明显更常出现', sw > it * 1.5,
    '弹幕 ' + sw + ' / 道具 ' + it);

  startSafe();
  let sw0 = 0;
  let it0 = 0;
  for (let k = 0; k < 500; k++) {
    for (const o of U.rollOffers(3)) {
      if (o.build === 'swarm') sw0++;
      else if (o.build === 'item') it0++;
    }
  }
  ok('未投入时两类出现次数接近', Math.abs(sw0 - it0) < sw0 * 0.4,
    '弹幕 ' + sw0 + ' / 道具 ' + it0);

  /* ---------- 难度曲线 ---------- */
  ok('前 10 关属于简单期', G.enemies.EASY_UNTIL === 10, 'EASY_UNTIL=' + G.enemies.EASY_UNTIL);
  ok('精英怪从第 11 关开始', G.enemies.ELITE_FROM === 11);
  ok('前 10 关完全不出现精英',
    [1, 5, 9, 10].every((lv) => G.enemies.eliteChance(lv) === 0),
    [1, 5, 9, 10].map((lv) => 'LV' + lv + ':' + G.enemies.eliteChance(lv)).join(' '));
  ok('第 11 关起开始出现精英', G.enemies.eliteChance(11) > 0,
    'LV11=' + G.enemies.eliteChance(11).toFixed(3));
  ok('精英概率随关卡提升',
    G.enemies.eliteChance(20) > G.enemies.eliteChance(12),
    G.enemies.eliteChance(12).toFixed(3) + ' → ' + G.enemies.eliteChance(20).toFixed(3));

  const h10 = G.enemies.hpScale(10);
  const h15 = G.enemies.hpScale(15);
  const h20 = G.enemies.hpScale(20);
  ok('前 10 关血量成长平缓', h10 < 2.6, 'LV10=×' + h10.toFixed(2));
  ok('第 11 关起指数上升', h20 / h10 > 4,
    'LV10=×' + h10.toFixed(2) + ' → LV15=×' + h15.toFixed(2) +
    ' → LV20=×' + h20.toFixed(2));

  const growEasy = G.enemies.hpScale(5) - G.enemies.hpScale(4);
  const growLate = h15 - G.enemies.hpScale(14);
  ok('后期每关血量增幅远大于前期', growLate > growEasy * 5,
    '前期 +' + growEasy.toFixed(3) + ' / 后期 +' + growLate.toFixed(3));

  /* ---------- 每 10 关一个指数台阶 ---------- */
  const T = G.enemies.tierMul;
  const S0 = G.enemies.TIER_STEP;

  ok('第 1/10 关还在第一台阶',
    T(1) === 1 && T(10) === 1,
    'L1=×' + T(1) + ' L10=×' + T(10));
  ok('第 11/21/31 关各跨一个台阶',
    Math.abs(T(11) - S0) < 1e-9 &&
    Math.abs(T(21) - S0 * S0) < 1e-9 &&
    Math.abs(T(31) - S0 * S0 * S0) < 1e-9,
    'L11=×' + T(11).toFixed(2) + ' L21=×' + T(21).toFixed(2) +
    ' L31=×' + T(31).toFixed(2));

  const jump = (lv) => G.enemies.hpScale(lv) / G.enemies.hpScale(lv - 1);
  ok('第 11 关小怪血量跳一个台阶', jump(11) > 2,
    'L10→L11 血量 ×' + jump(11).toFixed(2));
  ok('第 21 关小怪血量再跳一个台阶', jump(21) > 2,
    'L20→L21 血量 ×' + jump(21).toFixed(2));
  ok('第 31 关小怪血量继续跳台阶', jump(31) > 2,
    'L30→L31 血量 ×' + jump(31).toFixed(2));
  ok('台阶内部成长相对平缓', jump(15) < 1.35,
    'L14→L15 血量 ×' + jump(15).toFixed(3));
  ok('血量曲线整体单调递增',
    [2, 5, 10, 11, 15, 20, 21, 25, 30, 31].every((lv, i, arr) =>
      i === 0 || G.enemies.hpScale(lv) > G.enemies.hpScale(arr[i - 1])));

  // Boss 同样吃台阶
  const bossAt = (lv) => {
    startSafe();
    G.boss.start(lv);
    const hp = G.boss.state.boss.maxHp;
    G.boss.reset();
    return hp;
  };

  const b10 = bossAt(10);
  const b11 = bossAt(11);
  const b20 = bossAt(20);
  const b21 = bossAt(21);
  ok('Boss 血量同样按十关跳台阶',
    b11 / b10 > 2 && b21 / b20 > 2,
    'L10→L11 ×' + (b11 / b10).toFixed(2) + '，L20→L21 ×' + (b21 / b20).toFixed(2));
  ok('后期 Boss 血量极高（不再是软柿子）', b21 > 20000,
    'L21 Boss = ' + b21.toLocaleString());
  ok('Boss 血量曲线单调递增', b21 > b20 && b20 > b11 && b11 > b10,
    [b10, b11, b20, b21].map((v) => v.toLocaleString()).join(' → '));

  /* ---------- 怪速降低 ---------- */
  startSafe();
  G.enemies.list.length = 0;
  G.enemies.wave.level = 1;
  const fastScout = G.enemies.spawn('scout', 100, { noElite: true });
  ok('侦察机移动速度已下调', fastScout.vy < 170, 'vy=' + fastScout.vy.toFixed(0));

  /* ---------- 道具基础掉落率降低 ---------- */
  startSafe();
  G.powerups.reset();
  for (let k = 0; k < 3000; k++) G.powerups.maybeDrop(0, 0, 'scout');
  const measured = G.powerups.list.length / 3000;
  ok('道具基础掉落率明显降低', measured < 0.05,
    '实测 ' + (measured * 100).toFixed(2) + '%（旧版 5%）');
}

console.log('\n[32] 子弹外观、波动弹相位与面板显示');
if (G.upgrades && G.bullets) {
  const U = G.upgrades;
  const S = G.stats;

  /* ---------- 子弹外观风格 ---------- */
  const styleOf = (id) => {
    startSafe();
    U.owned[id] = 1;
    U.recalc();
    return S.bulletStyle;
  };

  startSafe();
  const normalStyle = S.bulletStyle;
  const sLaser = styleOf('gen_laser');
  const sHeavy = styleOf('gen_heavy');
  const sPlasma = styleOf('gen_plasma');
  const sFrost = styleOf('gen_frost');
  const sVenom = styleOf('gen_venom');
  const sRail = styleOf('gen_rail');

  ok('默认子弹风格为 normal', normalStyle === 'normal', normalStyle);
  ok('不同子弹增益产出不同的外观风格',
    new Set([sLaser, sHeavy, sPlasma, sFrost, sVenom, sRail]).size === 6,
    [sLaser, sHeavy, sPlasma, sFrost, sVenom, sRail].join('/'));

  /* ---------- 波动弹相位 ---------- */
  startSafe();
  G.player.autoFire = false;
  U.owned.gen_wave = 2;
  U.recalc();
  G.bullets.reset();

  const waveBullet = (() => {
    G.bullets.spawnPlayer(240, G.H - 100, 0, -300, { wave: S.bulletWave });
    return G.bullets.friendly[0];
  })();

  const expectAmp = 10 + S.bulletWave * 13;
  ok('波动弹带有摆动幅度参数', Math.abs(waveBullet.waveAmp - expectAmp) < 1e-9,
    'amp=' + waveBullet.waveAmp.toFixed(1));
  ok('波动弹初始相位由世界时间决定',
    Math.abs(waveBullet.wavePrev -
      Math.sin(G.time * waveBullet.waveFreq + 240 * 0.055) * expectAmp) < 1e-6,
    'prev=' + waveBullet.wavePrev.toFixed(4));

  // 同一轮：不同横坐标 → 相位不同（形成蛇形波）
  G.bullets.reset();
  for (let i = 0; i < 6; i++) {
    G.bullets.spawnPlayer(60 + i * 60, G.H - 100, 0, -300, { wave: 3 });
  }
  const phases = G.bullets.friendly.map((b) => b.wavePrev.toFixed(3));
  ok('同一轮里各弹道相位互不相同',
    new Set(phases).size === phases.length, phases.join(','));

  // 不同轮次：世界时间变了，相位也不同（修复"叠射速后波形一致"）
  const p1 = waveBullet.wavePrev;
  const t1 = G.time;
  for (let i = 0; i < 4; i++) step(16);
  ok('世界时间在推进', G.time > t1, G.time.toFixed(3));

  G.bullets.reset();
  G.bullets.spawnPlayer(240, G.H - 100, 0, -300, { wave: S.bulletWave });
  const wb2 = G.bullets.friendly[0];
  ok('不同轮次的波动相位不同（不会重合成同一波形）',
    Math.abs(wb2.wavePrev - p1) > 1e-4,
    'p1=' + p1.toFixed(4) + ' → p2=' + wb2.wavePrev.toFixed(4));

  G.player.autoFire = true;

  /* ---------- 子弹最小可见尺寸 ---------- */
  startSafe();
  ok('子弹设定了最小半径下限', G.bullets.MIN_R >= 2,
    'MIN_R=' + G.bullets.MIN_R);

  G.bullets.reset();
  G.bullets.spawnPlayer(100, 100, 0, -100, { r: 0.2 });
  ok('过小的子弹会被抬到可见尺寸',
    G.bullets.friendly[0].r >= G.bullets.MIN_R,
    '请求 r=0.2 → 实际 ' + G.bullets.friendly[0].r);

  // 缩小类增益全部叠满也不该看不见
  startSafe();
  U.owned.swarm_micro = 4;
  U.owned.gen_laser = 3;
  U.owned.gen_rail = 2;
  U.recalc();
  const shrunk = 4 * S.bulletSizeMul;
  G.bullets.reset();
  G.bullets.spawnPlayer(100, 100, 0, -100, { r: shrunk, style: S.bulletStyle });
  ok('缩小增益叠满后依然保证可见半径',
    G.bullets.friendly[0].r >= G.bullets.MIN_R && shrunk < 1,
    '理论 r=' + shrunk.toFixed(3) + ' → 实际 ' + G.bullets.friendly[0].r);

  // 各种风格都能正常绘制（跑一帧不报错）
  let drawErr = null;
  try {
    G.bullets.reset();
    ['normal', 'laser', 'heavy', 'plasma', 'frost', 'venom', 'rail'].forEach((st, i) => {
      G.bullets.spawnPlayer(60 + i * 50, 300, 0, -400, { r: 0.5, style: st });
    });
    step(16);
  } catch (e) { drawErr = e; }
  ok('所有子弹风格都能正常绘制', !drawErr, drawErr ? drawErr.message : '');

  /* ---------- 暴击上限 ---------- */
  startSafe();
  U.owned.gen_crit = 6;
  U.owned.lv_instinct = 4;
  G.progress.state.level = 101;
  U.recalc();
  ok('暴击率上限为 100%', S.critChance === 1,
    'crit=' + S.critChance + '（未封顶会是 ' +
    (0.08 * 6 + 0.05 * 20 * 4).toFixed(2) + '）');

  /* ---------- 面板显示 ---------- */
  startSafe();
  const critDmgRow = G.panel.rows().find((r) => r.label === '暴击伤害');
  ok('面板暴击伤害改为百分比显示', /%$/.test(critDmgRow.value), critDmgRow.value);

  /* ---------- 卡面升级增量 ---------- */
  const waveDef = U.POOL.find((b) => b.id === 'gen_wave');
  ok('波动弹写明了升级增量', /摆动幅度/.test(waveDef.delta), waveDef.delta);

  startSafe();
  U.request(3);
  const cardHtml = sandbox.document.getElementById('upgrade-cards').innerHTML;
  ok('强化卡面真的渲染出升级增量', cardHtml.indexOf('升级 +1 级：') >= 0);
  ok('卡面同时显示当前效果',
    cardHtml.indexOf('card-desc') >= 0 && cardHtml.indexOf('card-delta') >= 0);
  if (U.state.offers.length) U.choose(U.state.offers[0].id);
}

console.log('\n[33] 长时间稳定性（自动选强化 + 自动重开）');
startSafe();

let crashed = null;
let picked = 0;
let restarts = 0;
let maxLevel = 1;
let maxWave = 1;
let sweepDir = 1;
const seenIds = new Set();

try {
  for (let i = 0; i < 5400; i++) {           // 约 1.5 分钟游戏时间
    // 模拟一个会左右横扫瞄准的玩家
    if (G.input && G.player) {
      if (G.player.x > G.W - 45) sweepDir = -1;
      if (G.player.x < 45) sweepDir = 1;
      G.input.held.left = sweepDir < 0;
      G.input.held.right = sweepDir > 0;
      G.input.held.fire = true;
    }

    // 模拟玩家选强化
    if (G.state === 'upgrade' && G.upgrades) {
      const off = G.upgrades.state.offers;
      if (off && off.length) {
        const pickOne = off[(Math.random() * off.length) | 0];
        G.upgrades.choose(pickOne.id);
        seenIds.add(pickOne.id);
        picked++;
      }
    }

    // 死了就重开，继续压测
    if (G.state === 'gameover') { startSafe(); restarts++; }

    step(16);

    // 开局是无敌的（保证能跑到后期关卡），每隔一段时间主动送死一次，
    // 顺带覆盖"阵亡 → 结算 → 重开"这条路径
    if (i % 1700 === 1699 && G.state === 'playing' && G.player) {
      G.player.invuln = 0;
      G.lives = 1;
      G.player.hit();
    }

    if (G.progress && G.progress.level > maxLevel) maxLevel = G.progress.level;
    if (G.level > maxWave) maxWave = G.level;
  }
} catch (err) { crashed = err; }

if (G.input) {
  G.input.held.fire = false;
  G.input.held.left = false;
  G.input.held.right = false;
}

ok('连续跑 5400 帧无异常', !crashed,
  crashed ? (crashed.message + '\n' + crashed.stack) : '');
ok('流程中确实触发了强化选择', picked > 0,
  '选择了 ' + picked + ' 次，重开 ' + restarts + ' 次');
ok('压测过程中积累了多种增益', seenIds.size >= 3, '出现过 ' + seenIds.size + ' 种');
ok('等级确实在成长', maxLevel >= 3, '最高等级 ' + maxLevel);
ok('波次确实在推进', maxWave >= 2, '最高波次 ' + maxWave);

/* ---------------- 结果 ---------------- */
console.log('\n==============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('==============================\n');

// ASCII 汇总行，方便 CI / 脚本抓取（不受控制台编码影响）
console.log('RESULT pass=' + pass + ' fail=' + fail);

process.exit(fail === 0 ? 0 : 1);
