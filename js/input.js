/* ============================================================
   星际突袭 · 输入系统  js/input.js
   ------------------------------------------------------------
   键盘：WASD / 方向键 移动，空格 / J 射击
   指针：鼠标拖动或手指触摸，飞机平滑跟随（自动开火）
   ------------------------------------------------------------
   对外接口：
     Game.input.axis    -> {x, y}  归一化后的移动方向
     Game.input.firing  -> bool    是否正在开火
     Game.input.pointer -> {active, x, y}
     Game.input.reset()
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  /* ---------- 键盘 ---------- */
  const KEYMAP = {
    ArrowLeft: 'left',  KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up',      KeyW: 'up',
    ArrowDown: 'down',  KeyS: 'down',
    Space: 'fire',      KeyJ: 'fire',
  };

  const held = { left: false, right: false, up: false, down: false, fire: false };

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    held[k] = true;
    e.preventDefault();          // 阻止空格滚动页面 / 方向键滚动
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    held[k] = false;
    e.preventDefault();
  }, { passive: false });

  // 切走窗口时清空按键，避免"按键卡住一直飞"
  window.addEventListener('blur', () => {
    for (const k in held) held[k] = false;
    pointer.active = false;
  });

  /* ---------- 指针（鼠标 / 触屏统一用 Pointer Events） ---------- */
  const pointer = { active: false, x: 0, y: 0 };
  const canvas = G.canvas;

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * G.W,
      y: ((e.clientY - r.top) / r.height) * G.H,
    };
  }

  // 刚开局的那一下点击是用来"开始游戏"的，不应把飞机瞬移过去
  function isStartTap() {
    return performance.now() - (G.startedAt || 0) < 220;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (G.state !== 'playing') return;
    if (isStartTap()) return;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    pointer.active = true;
    const p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointer.active) return;
    const p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
    e.preventDefault();
  }, { passive: false });

  const release = () => { pointer.active = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);

  /* ---------- 对外接口 ---------- */
  const axis = { x: 0, y: 0 };   // 复用一个对象，避免每帧产生垃圾

  G.input = {
    pointer,
    held,

    get axis() {
      let x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      let y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x !== 0 && y !== 0) {          // 斜向不加速
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      axis.x = x;
      axis.y = y;
      return axis;
    },

    get firing() {
      return held.fire || pointer.active;
    },

    reset() {
      for (const k in held) held[k] = false;
      pointer.active = false;
    },

    update() { /* 预留：目前无需逐帧处理 */ },
  };

  console.log('[星际突袭] 输入系统就绪');
})();
