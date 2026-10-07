/* ============================================================
   星际突袭 · 核心框架  js/main.js
   ------------------------------------------------------------
   职责：
     · 画布与自适应（含高 DPI）
     · 游戏主循环（requestAnimationFrame + 增量时间）
     · 状态机：menu / playing / paused / gameover
     · 三层视差星空背景
     · HUD 与三个界面（主菜单、暂停、结算）的切换
     · 最高分本地存储

   模块约定（重要）：
     其它模块统一挂在 window.Game 上，例如 Game.player、Game.enemies。
     main.js 调用它们前一律做“存在性检查”，且模块之间只允许在
     函数内部互相访问（不允许在加载时互相取值）。
     => 因此各文件可以逐个补齐，缺谁都不会报错。
   ============================================================ */
'use strict';

window.Game = window.Game || {};

/* ------------------------------------------------------------
   一、画布
   ------------------------------------------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0;              // 逻辑宽（CSS 像素）
let H = 0;              // 逻辑高（CSS 像素）
let DPR = 1;            // 设备像素比

Game.canvas = canvas;
Game.ctx = ctx;

// 供其它模块读取当前画面尺寸
Object.defineProperty(Game, 'W', { get: () => W });
Object.defineProperty(Game, 'H', { get: () => H });

// 全局时间（秒），供各模块做动画
let tGlobal = 0;
Object.defineProperty(Game, 'time', { get: () => tGlobal });

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  // 之后所有绘制都用逻辑坐标
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  stars.rebuild();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

/* ------------------------------------------------------------
   二、三层视差星空
   ------------------------------------------------------------ */
const stars = {
  layers: [],

  rebuild() {
    const defs = [
      { speed: 26, size: 1.0, alpha: 0.45, count: 80 },
      { speed: 72, size: 1.6, alpha: 0.70, count: 50 },
      { speed: 155, size: 2.4, alpha: 1.00, count: 26 },
    ];
    this.layers = defs.map((d) => ({
      speed: d.speed,
      size: d.size,
      alpha: d.alpha,
      pts: Array.from({ length: d.count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        tw: Math.random() * Math.PI * 2,   // 闪烁相位
      })),
    }));
  },

  update(dt) {
    for (const L of this.layers) {
      const fall = L.speed * dt;
      for (const p of L.pts) {
        p.y += fall;
        p.tw += dt * 2.2;
        if (p.y > H + 4) {
          p.y = -4;
          p.x = Math.random() * W;
        }
      }
    }
  },

  draw() {
    for (const L of this.layers) {
      for (const p of L.pts) {
        // 轻微闪烁，让星空不呆板
        const a = L.alpha * (0.72 + 0.28 * Math.sin(p.tw));
        ctx.fillStyle = 'rgba(190, 225, 255, ' + a.toFixed(3) + ')';
        ctx.fillRect(p.x, p.y, L.size, L.size);
      }
    }
    // 远处的星云色块，增加纵深感
    const t = tGlobal * 0.06;
    drawNebula(W * (0.25 + 0.06 * Math.sin(t)), H * 0.22, 200, 'rgba(60, 120, 255, 0.055)');
    drawNebula(W * (0.78 + 0.05 * Math.cos(t * 1.3)), H * 0.68, 240, 'rgba(180, 60, 220, 0.045)');
  },
};

function drawNebula(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ------------------------------------------------------------
   二·五、屏幕震动
   ------------------------------------------------------------ */
const shake = {
  mag: 0,

  /** 叠加一次震动强度（取较大值，避免小震动覆盖大震动） */
  add(m) {
    this.mag = Math.min(26, Math.max(this.mag, m));
  },

  update(dt) {
    if (this.mag > 0) this.mag = Math.max(0, this.mag - dt * 46);
  },

  /** 返回本帧的偏移量 */
  offset() {
    if (this.mag <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * this.mag,
      y: (Math.random() * 2 - 1) * this.mag,
    };
  },
};

Game.shake = shake;

/* ------------------------------------------------------------
   三、游戏状态与数据
   ------------------------------------------------------------ */
Game.state = 'menu';    // menu | playing | paused | gameover
Game.screen = 'menu';   // 当前显示的界面：menu | pause | over | null
Game.score = 0;
Game.lives = 3;
Game.level = 1;
Game.highScore = 0;

/* ------------------------------------------------------------
   三·二、跨局存档（localStorage）
   ------------------------------------------------------------
   只存小游戏需要的几个累计值；隐私模式下全部安全降级为 0。
   ------------------------------------------------------------ */
const SAVE_KEY = 'starstrike.stats';

Game.save = {
  bestLevel: 0,      // 到达过的最高关卡
  bestScore: 0,      // 历史最高分（和 highScore 同步，便于统一读取）
  totalKills: 0,     // 累计击杀
  totalBosses: 0,    // 累计击破 Boss
  runs: 0,           // 玩过多少局
  _dirty: false,

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k in o) {
          if (typeof this[k] === 'number' && typeof o[k] === 'number' && isFinite(o[k])) {
            this[k] = Math.max(0, Math.floor(o[k]));
          }
        }
      }
    } catch (e) { /* 忽略：损坏的存档不该让游戏起不来 */ }
    return this;
  },

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        bestLevel: this.bestLevel,
        bestScore: this.bestScore,
        totalKills: this.totalKills,
        totalBosses: this.totalBosses,
        runs: this.runs,
      }));
    } catch (e) { /* 忽略 */ }
  },

  /** 一局开始时调用 */
  startRun() {
    this.runs++;
    this.persist();
  },

  /** 击杀一个杂兵 */
  recordKill(n) {
    this.totalKills += (n || 1);
    this._dirty = true;
  },

  /** 击破一个 Boss */
  recordBoss() {
    this.totalBosses++;
    this._dirty = true;
  },

  /** 推进关卡 / 每局结束时更新记录 */
  recordProgress(level, score) {
    let changed = false;
    if (level > this.bestLevel) { this.bestLevel = level; changed = true; }
    if (score > this.bestScore) { this.bestScore = score; changed = true; }
    if (changed || this._dirty) {
      this._dirty = false;
      this.persist();
    }
  },
};

Game.save.load();

/* ------------------------------------------------------------
   调试日志开关
   ------------------------------------------------------------
   13 个模块启动时各打一条日志，正式玩的时候纯属噪音。
   默认关闭；想看就在网址后面加 ?debug（或控制台里设 Game.DEBUG = true）。
   ------------------------------------------------------------ */
Game.DEBUG = (function () {
  try {
    if (typeof location !== 'undefined' && location.search &&
        /(?:^|[?&])debug(?:=|&|$)/.test(location.search)) return true;
    if (typeof localStorage !== 'undefined' &&
        localStorage.getItem('starstrike.debug') === '1') return true;
  } catch (e) { /* 隐私模式等场景忽略 */ }
  return false;
})();

/** 只在 DEBUG 打开时输出的日志（各模块统一用它） */
Game.log = Game.DEBUG
  ? function () { console.log.apply(console, arguments); }
  : function () {};

try {
  Game.highScore = parseInt(localStorage.getItem('starstrike.high') || '0', 10) || 0;
} catch (e) {
  Game.highScore = 0;   // 隐私模式等场景下 localStorage 不可用
}

/* ------------------------------------------------------------
   三·五、增益属性表（默认值）
   ------------------------------------------------------------
   所有战斗模块只读这张表；upgrades.js 会根据玩家选取的增益
   重新计算它。放在框架里是为了让各模块单独运行时也有默认值。
   ------------------------------------------------------------ */
Game.stats = {
  /* 攻击 */
  damage: 1,             // 最终子弹伤害（由 upgrades.recalc 算出）
  fireRateMul: 1,
  bulletSpeedMul: 1,
  bulletSizeMul: 1,
  extraBullets: 0,
  spreadAngle: 0,
  pierce: 0,
  critChance: 0,
  critMul: 2,
  rearGun: 0,
  sideGun: 0,
  homing: 0,             // 追踪弹头：层数
  homingTurn: 0,         // 追踪转向率（弧度/秒）—— 决定追踪有多"黏"
  homingCone: 1.2566,    // 追踪索敌锥形半角（±72°），锥形外不追
  homingSpeedMul: 1,     // 追踪的代价：弹速系数
  bulletWave: 0,         // 波动弹：飞行中左右摆动
  bulletRicochet: 0,     // 弹跳弹：撞到屏幕两侧反弹
  ringShot: 0,           // 相位环射：定期打出一圈弹幕
  frontLanes: 0,         // 前向弹道：机首正前方的笔直弹道
  mirror: 0,             // 镜像齐射：向后同步打一排
  bulletStyle: 'normal', // 子弹本体造型
  bulletElements: [],    // 子弹元素光晕（plasma/frost/venom）
  echoChance: 0,         // 金色：回响射击
  splash: 0,             // 等离子弹：溅射
  frost: 0,              // 霜冻弹：减速
  arc: 0,                // 电弧弹：小范围连锁
  /* 流派 · 辐射（持续伤害 DOT）
     这是一条**独立于常规子弹**的伤害通道：下面这些字段是它唯一的来源，
     不读 damage / critChance / critMul / fireRateMul / hitDamage。 */
  dotActive: false,      // 是否已点燃（拿到辐射源）
  dotPerStack: 0,        // 每层每秒伤害
  dotPerHit: 0,          // 每次命中叠加的层数
  dotMax: 0,             // 单个目标层数上限
  dotInterval: 0.5,      // 跳数间隔（秒）
  dotDuration: 4,        // 持续时间（秒）
  dotCritChance: 0,      // DOT 专属暴击率（与子弹暴击无关）
  dotCritMul: 1.5,       // DOT 专属暴击伤害
  dotCrit: 0,            // 来源标记：致命衰变层数
  dotCritDmg: 0,         // 来源标记：毁伤衰变层数
  dotDouble: 0,          // 双跳概率
  dotChain: 0,           // 层数越高跳得越快
  dotBurst: 0,           // 层数叠满时引爆
  dotSpread: 0,          // 击杀时散播层数
  dotField: 0,           // 身周辐射力场
  dotPlague: 0,          // 金色：星尘瘟疫
  dotMeltdown: 0,        // 金色：熔毁协议
  dotSingularity: 0,     // 金色：奇点衰变
  /* 流派 · 弹幕 */
  swarmAmmo: 0,
  /* 流派 · 道具 */
  itemDamage: 0,         // 每件道具提供的伤害
  dropRate: 0,
  doubleDrop: 0,
  itemDurationMul: 1,
  itemRepair: 0,
  itemQuality: 0,
  itemBomb: 0,
  itemResonance: 0,      // 拾取道具时额外触发随机增益
  itemMidas: 0,          // 点金之手
  itemConverter: 0,      // 转化装置
  itemHoard: 0,          // 金色：物资宝库
  goldShower: 0,         // 金色：补给风暴
  goldAlchemy: 0,        // 金色：点石成金
  airdrop: 0,
  magnet: 0,
  /* 流派 · 升级 */
  xpMul: 1,
  xpCostCut: 0,          // 升级所需经验的削减层数
  levelDamage: 0,        // 每级提供的伤害
  levelHaste: 0,         // 每级提供的射速
  shieldOnLevelUp: 0,
  healOnLevelUp: 0,
  potential: 0,
  luck: 0,
  /* 击破奖励：每击破一个 Boss，伤害 ×2（关卡进度乘区，子弹与 DOT 共享） */
  bossKills: 0,
  breakBonus: 1,
  /* 命中积累 */
  hitDamage: 0,          // 每次命中提供的伤害
  hitDamageCap: Infinity, // 无上限（保留字段便于面板显示）
  /* 金色 / 紫色 来源标记 */
  goldStorm: 0,
  goldLance: 0,
  goldSurge: 0,
  goldTranscend: 0,
  goldAscend: 0,
  lvAwaken: 0,
  lvMastery: 0,
  /* 生存 */
  maxLives: 3,
  invulnBonus: 0,
  armor: 0,
  revive: 0,
  /* 移动 */
  moveSpeedMul: 1,
  agility: 1,
  /* 特效 */
  explodeOnKill: 0,
  chain: 0,
  slow: 0,
  vamp: 0,
  pointDef: 0,
  /* 经济 */
  scoreMul: 1,
  combo: 0,
  /* 召唤 */
  drones: 0,
  orbits: 0,
  /* 舰队流：僚机编队 */
  droneInherit: 0.25,    // 僚机继承本体数值的比例（基础 25%）
  droneDamageMul: 1,
  droneFireMul: 1,
  droneBullets: 0,       // 僚机专属额外弹道
  droneSpread: 0,
  dronePierce: 0,
  droneHoming: 0,
  droneCrit: 0,
  dronePointDef: 0,
  fleetBodyDamage: 0,    // 每架僚机给本体带来的伤害加成
  fleetLink: 0,          // 神经链接层数
  goldArmada: 0,         // 金色：星海舰队
  goldOverlord: 0,       // 金色：旗舰指挥
  goldPhalanx: 0,        // 金色：方阵齐射
  /* 特殊 */
  berserk: 0,
  execute: 0,
};

/** 统一的回血接口（生命上限来自属性表） */
Game.heal = function (n) {
  const max = (Game.stats && Game.stats.maxLives) || 3;
  if (Game.lives >= max) return false;

  Game.lives = Math.min(max, Game.lives + (n || 1));
  if (Game.hud) Game.hud.invalidate();
  return true;
};

/* ------------------------------------------------------------
   四、HUD
   ------------------------------------------------------------ */
const hud = {
  el: document.getElementById('hud'),
  score: document.getElementById('hud-score'),
  lives: document.getElementById('hud-lives'),
  level: document.getElementById('hud-level'),
  best: document.getElementById('hud-best'),
  _cache: {},

  update() {
    const v = {
      score: Game.score,
      lives: Game.lives,
      level: Game.level,
      best: Game.highScore,
    };

    for (const k in v) {
      if (this._cache[k] === v[k]) continue;   // 只在变化时改 DOM
      this._cache[k] = v[k];

      if (k === 'score') this.score.textContent = v.score.toLocaleString();
      else if (k === 'best') this.best.textContent = v.best.toLocaleString();
      else if (k === 'level') this.level.textContent = '第 ' + v.level + ' 关';
      else if (k === 'lives') {
        // 生命值可能被强化堆得很高，这里封顶 —— 否则 '♥'.repeat() 会把
        // 字符串撑爆（RangeError: Invalid string length）并撑破 HUD
        const n = Math.max(0, Math.min(999, Math.floor(v.lives) || 0));
        this.lives.textContent = n === 0 ? '—'
          : n <= 8 ? '♥'.repeat(n)
            : '♥×' + n;
      }
    }
  },

  invalidate() {
    this._cache = {};
    this.update();
  },
};

Game.hud = hud;

/* ------------------------------------------------------------
   四·五、屏幕提示条（静音切换、空投等临时消息）
   ------------------------------------------------------------ */
let toastTimer = 0;

function toast(text, ms) {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = text;
  el.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || 1400);
}

Game.toast = toast;

/* ------------------------------------------------------------
   五、界面切换
   ------------------------------------------------------------ */
const screens = {
  menu: document.getElementById('screen-menu'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
  upgrade: document.getElementById('screen-upgrade'),
  codex: document.getElementById('screen-codex'),
};

function syncUI() {
  for (const k in screens) {
    if (screens[k]) screens[k].classList.toggle('hidden', Game.screen !== k);
  }
  // 主菜单时隐藏 HUD，其余时刻（含暂停/结算/图鉴）保留
  hud.el.classList.toggle('hidden', Game.state === 'menu' || Game.screen === 'codex');
}

/** 切换到某个界面（图鉴等模块统一用它，避免各自去摸 DOM） */
function showScreen(name) {
  Game.screen = name || null;
  syncUI();
}

Game.showScreen = showScreen;

/* ------------------------------------------------------------
   六、流程控制
   ------------------------------------------------------------ */

/** 开始新一局 */
function startGame() {
  Game.score = 0;
  Game.lives = 3;
  Game.level = 1;

  // 通知各模块重置（模块不存在就跳过，方便逐个开发）
  // upgrades 放最前面：先把属性表恢复成默认值，后面的模块才拿到干净的数值
  for (const key of ['upgrades', 'progress', 'input', 'player', 'bullets',
                     'enemies', 'boss', 'combat', 'powerups']) {
    const m = Game[key];
    if (m && typeof m.reset === 'function') m.reset();
  }
  if (Game.particles && Game.particles.clear) Game.particles.clear();
  if (Game.audio && Game.audio.unlock) Game.audio.unlock();

  Game.lives = Game.stats.maxLives || 3;

  Game.state = 'playing';
  Game.screen = null;
  Game.startedAt = performance.now();   // 供 input.js 忽略"点击开始"那一下
  Game.save.startRun();
  hud.invalidate();
  syncUI();
}

/** 游戏结束 */
function gameOver() {
  if (Game.state === 'gameover') return;

  Game.state = 'gameover';

  const isRecord = Game.score > Game.highScore && Game.score > 0;
  if (isRecord) {
    Game.highScore = Game.score;
    try {
      localStorage.setItem('starstrike.high', String(Game.highScore));
    } catch (e) { /* 忽略写入失败 */ }
  }

  // 跨局累计记录
  Game.save.recordProgress(Game.level, Game.score);

  document.getElementById('over-score').textContent = Game.score.toLocaleString();
  document.getElementById('over-best').textContent = Game.highScore.toLocaleString();
  document.getElementById('over-record').classList.toggle('hidden', !isRecord);
  renderSaveStats('over-stats', '本 局 战 绩');

  Game.screen = 'over';
  hud.update();
  syncUI();

  if (Game.audio && Game.audio.gameOver) Game.audio.gameOver();
}

/** 把跨局累计记录渲染进指定容器 */
function renderSaveStats(id, caption) {
  const el = document.getElementById(id);
  if (!el) return;
  const s = Game.save;
  const cell = (k, v) => '<div class="stat"><span class="k">' + k + '</span>' +
    '<span class="v">' + v + '</span></div>';
  el.innerHTML =
    (caption ? '<div class="stat-cap">' + caption + '</div>' : '') +
    cell('最高关卡', '第 ' + s.bestLevel + ' 关') +
    cell('累计击杀', s.totalKills.toLocaleString()) +
    cell('击破 Boss', s.totalBosses) +
    cell('游玩局数', s.runs);
}

/** 暂停 / 继续 */
function togglePause() {
  if (Game.state === 'playing') {
    Game.state = 'paused';
    Game.screen = 'pause';
    if (Game.audio && Game.audio.pause) Game.audio.pause();
  } else if (Game.state === 'paused') {
    Game.state = 'playing';
    Game.screen = null;
    if (Game.audio && Game.audio.resume) Game.audio.resume();
  }
  syncUI();
}

/** 回到主菜单 */
function toMenu() {
  Game.state = 'menu';
  Game.screen = 'menu';
  document.getElementById('menu-best').textContent = Game.highScore.toLocaleString();
  hud.invalidate();
  syncUI();
}

// 暴露给其它模块使用
Game.startGame = startGame;
Game.gameOver = gameOver;
Game.renderSaveStats = renderSaveStats;
Game.togglePause = togglePause;
Game.toMenu = toMenu;
Game.syncUI = syncUI;

/* ------------------------------------------------------------
   七、输入：只处理“全局按键”（局内操作交给 input.js）
   ------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  const code = e.code;

  // 主菜单：回车 / 空格 开始
  if (Game.state === 'menu' && (code === 'Enter' || code === 'Space' || code === 'NumpadEnter')) {
    e.preventDefault();
    startGame();
    return;
  }

  // 结算：回车重开
  if (Game.state === 'gameover' && (code === 'Enter' || code === 'NumpadEnter')) {
    e.preventDefault();
    startGame();
    return;
  }

  // 局内：P / Esc 暂停
  if ((Game.state === 'playing' || Game.state === 'paused') && (code === 'KeyP' || code === 'Escape')) {
    e.preventDefault();
    togglePause();
  }
});

/* ------------------------------------------------------------
   八、按钮绑定
   ------------------------------------------------------------ */
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-quit').addEventListener('click', toMenu);
document.getElementById('btn-menu').addEventListener('click', toMenu);

// 鼠标点击画布也能开始（主菜单 / 结算界面下）
canvas.addEventListener('pointerdown', () => {
  if (Game.state === 'menu' || Game.state === 'gameover') startGame();
});

/* ------------------------------------------------------------
   九、主循环
   ------------------------------------------------------------ */
function update(dt) {
  tGlobal += dt;

  // 星空永远滚动（暂停时除外，暂停由外层拦住）
  stars.update(dt);
  shake.update(dt);

  // 非战斗状态：只让残余粒子播完
  if (Game.state !== 'playing') {
    if (Game.particles && Game.particles.update) Game.particles.update(dt);
    return;
  }

  // 依次驱动各模块（存在才调用 => 支持分步开发）
  if (Game.input && Game.input.update) Game.input.update(dt);
  if (Game.player && Game.player.update) Game.player.update(dt);
  if (Game.bullets && Game.bullets.update) Game.bullets.update(dt);
  if (Game.enemies && Game.enemies.update) Game.enemies.update(dt);
  if (Game.boss && Game.boss.update) Game.boss.update(dt);
  if (Game.upgrades && Game.upgrades.update) Game.upgrades.update(dt);
  if (Game.progress && Game.progress.update) Game.progress.update(dt);
  if (Game.combat && Game.combat.update) Game.combat.update(dt);
  if (Game.powerups && Game.powerups.update) Game.powerups.update(dt);
  if (Game.particles && Game.particles.update) Game.particles.update(dt);
}

function draw() {
  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050a1c');
  bg.addColorStop(0.55, '#04060f');
  bg.addColorStop(1, '#070312');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  stars.draw();

  // 战斗对象放在一层"可震动"的画布里
  const sh = shake.offset();
  ctx.save();
  if (sh.x || sh.y) ctx.translate(sh.x, sh.y);

  if (Game.state !== 'menu') {
    if (Game.powerups && Game.powerups.draw) Game.powerups.draw();
    if (Game.bullets && Game.bullets.draw) Game.bullets.draw();
    if (Game.enemies && Game.enemies.draw) Game.enemies.draw();
    if (Game.boss && Game.boss.draw) Game.boss.draw();
    if (Game.player && Game.player.draw) Game.player.draw();
    if (Game.upgrades && Game.upgrades.draw) Game.upgrades.draw();
  }

  // 粒子在最上层
  if (Game.particles && Game.particles.draw) Game.particles.draw();
  ctx.restore();

  // Boss 血条 / 经验条 / 战斗面板不参与震动
  if (Game.boss && Game.boss.drawUI) Game.boss.drawUI();
  if (Game.progress && Game.progress.draw && Game.state !== 'menu') Game.progress.draw();
  if (Game.panel && Game.panel.draw) Game.panel.draw();
}

let lastTime = 0;

function frame(now) {
  requestAnimationFrame(frame);

  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // 切标签页回来时 dt 会非常大，钳制一下防止“瞬移穿模”
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;

  if (Game.state !== 'paused') update(dt);
  draw();
  hud.update();
}

/* ------------------------------------------------------------
   十、启动
   ------------------------------------------------------------ */
resize();
Game.screen = 'menu';
document.getElementById('menu-best').textContent = Game.highScore.toLocaleString();
renderSaveStats('menu-stats');
syncUI();
requestAnimationFrame(frame);

Game.log('[星际突袭] 框架已就绪 · 第 ① 部分');
