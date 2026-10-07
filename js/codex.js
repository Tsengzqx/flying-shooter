/* ============================================================
   星际突袭 · 图鉴 / 玩法  js/codex.js
   ------------------------------------------------------------
   主菜单点「图鉴 · 玩法」打开。三个标签页：

     玩法  —— 操作、核心循环、难度曲线、这次的"击破奖励 / 过载"
     增益  —— 113 个增益按流派分组，带图标 / 品质 / 效果 / 升级增量
     Boss  —— 6 位 Boss 的名字、代号、机制、弹幕池、数值

   数据全部从 Game.upgrades.POOL / Game.boss.ROSTER 现读，
   所以以后加增益、加 Boss，图鉴会自动跟着更新，不需要改这里。
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const RARITY_NAME = { common: '普通', rare: '稀有', epic: '史诗', gold: '金色' };
  const BUILD_ORDER = ['swarm', 'item', 'level', 'fleet', 'rad', 'general'];

  const TWIST_NAME = {
    blink: '每轮齐射后瞬移', cloak: '三阶段周期性隐身',
    spin: '旋臂转速加倍', swarm: '小怪召唤最频繁', none: '—',
  };

  const KERNEL_NAME = {
    swarm: '蜂群弹', spread: '瞄准扇形', radial: '环形弹幕', cross: '十字旋臂',
    rain: '顶部弹雨', wall: '全屏弹墙', nova: '缺口新星', spiral: '持续螺旋',
  };

  /* ============================================================
     一、三个标签页的内容
     ============================================================ */

  function guideHTML() {
    const B = G.boss;
    const over = B && B.OVERLOAD_AFTER ? Math.round(B.OVERLOAD_AFTER / 60) : 10;
    const pct = B && B.OVERLOAD_PCT ? Math.round(B.OVERLOAD_PCT * 100) : 2;
    const step = 2;   // BREAK_STEP

    return '' +
      '<section class="cx-sec">' +
        '<h3>操作</h3>' +
        '<div class="cx-kv"><b>WASD</b> / <b>方向键</b> 移动，<b>自动开火</b> —— 你只管走位躲弹幕</div>' +
        '<div class="cx-kv"><b>P</b> / <b>Esc</b> 暂停　<b>M</b> 音效开关</div>' +
        '<div class="cx-kv">手机：手指按住屏幕，飞机跟到手指位置</div>' +
      '</section>' +

      '<section class="cx-sec">' +
        '<h3>一局是怎么打的</h3>' +
        '<div class="cx-kv">击毁敌机 → 吃经验升级 → <b>三选一强化</b> → 打更强的敌人</div>' +
        '<div class="cx-kv">每 <b>10 关</b>一位 Boss；每 10 关敌机血量整体跳一个台阶</div>' +
        '<div class="cx-kv">每 10 关解锁一个流派的<b>金色增益</b>（该流派先堆满 8 层）</div>' +
      '</section>' +

      '<section class="cx-sec">' +
        '<h3>击破奖励 —— 后期靠它跟上难度</h3>' +
        '<div class="cx-kv">敌机血量是<b>乘法增长</b>的，所以你也需要一条乘法增长曲线。</div>' +
        '<div class="cx-kv">每击破一位 Boss，永久获得 1 层击破奖励：' +
          '<b class="hl">伤害 ×' + step + '</b>，可无限叠加。</div>' +
        '<div class="cx-kv">它同时提升<b>子弹</b>与<b>持续伤害</b>两条通道，' +
          '左上角面板会显示当前倍率。</div>' +
      '</section>' +

      '<section class="cx-sec">' +
        '<h3>超时过载 —— 不会卡死</h3>' +
        '<div class="cx-kv">Boss 战打满 <b>' + over + ' 分钟</b>仍未结束，Boss 会进入' +
          '<b class="hl">核心过载</b>。</div>' +
        '<div class="cx-kv">过载后它每秒损失 <b>' + pct + '% 最大生命</b>，' +
          '无论构筑多离谱，一场 Boss 战都会收束。</div>' +
      '</section>' +

      '<section class="cx-sec">' +
        '<h3>五大流派</h3>' +
        '<div class="cx-kv"><b class="c-swarm">弹幕流</b> 用子弹<b>数量</b>碾过去，伤害惩罚很轻</div>' +
        '<div class="cx-kv"><b class="c-item">道具流</b> 靠累计拾取的道具数滚雪球</div>' +
        '<div class="cx-kv"><b class="c-level">升级流</b> 靠玩家等级本身变强</div>' +
        '<div class="cx-kv"><b class="c-fleet">舰队流</b> 召唤僚机编队，僚机继承本体 25% 数值</div>' +
        '<div class="cx-kv"><b class="c-rad">辐射流</b> 持续伤害，<b>完全独立于子弹</b>，' +
          '不吃任何子弹加成</div>' +
      '</section>';
  }

  function buildHTML() {
    const U = G.upgrades;
    if (!U || !U.POOL) return '<div class="cx-empty">增益数据未加载</div>';

    const groups = {};
    for (const b of U.POOL) {
      (groups[b.build] = groups[b.build] || []).push(b);
    }

    let html = '';
    for (const key of BUILD_ORDER) {
      const list = groups[key];
      if (!list || !list.length) continue;

      // 按品质从高到低排，金色在最上面
      const rank = { gold: 0, epic: 1, rare: 2, common: 3 };
      list.sort((a, b) => (rank[a.rarity] - rank[b.rarity]) || a.name.localeCompare(b.name));

      html += '<section class="cx-sec">' +
        '<h3><span class="cx-build build-' + key + '">' +
          (U.BUILD_NAME[key] || key) + '</span>' +
        '<span class="cx-count">' + list.length + ' 个</span></h3>' +
        '<div class="cx-cards">';

      for (const b of list) {
        html += '<div class="cx-card r-' + b.rarity + '">' +
          '<div class="cx-card-top">' +
            '<span class="cx-icon">' + b.icon + '</span>' +
            '<span class="cx-name">' + b.name + '</span>' +
            '<span class="cx-rar">' + (RARITY_NAME[b.rarity] || b.rarity) + '</span>' +
            (b.max > 1 ? '<span class="cx-max">上限 ' + b.max + '</span>' : '') +
          '</div>' +
          '<div class="cx-desc">' + b.desc + '</div>' +
          (b.max > 1 ? '<div class="cx-delta">升级 +1：' + b.delta + '</div>' : '') +
        '</div>';
      }

      html += '</div></section>';
    }
    return html;
  }

  function bossHTML() {
    const B = G.boss;
    if (!B || !B.ROSTER) return '<div class="cx-empty">Boss 数据未加载</div>';

    let html = '<section class="cx-sec">' +
      '<h3>6 位 Boss<span class="cx-count">每 10 关一位</span></h3>' +
      '<div class="cx-kv">第 60 关之后回到第一位，挂上「第 N 形态」标记，血量每轮 ×1.45</div>' +
      '</section>';

    B.ROSTER.forEach((def, i) => {
      const kinds = [];
      def.phases.forEach((p) => p.forEach((k) => {
        if (kinds.indexOf(k) < 0) kinds.push(k);
      }));

      html += '<section class="cx-sec">' +
        '<h3>' + def.name +
          '<span class="cx-count">第 ' + ((i + 1) * 10) + ' 关</span></h3>' +
        '<div class="cx-code">' + def.code + '</div>' +
        '<div class="cx-kv">' + def.title + '</div>' +
        '<div class="cx-kv">机制：<b class="hl">' + (TWIST_NAME[def.twist] || def.twist) + '</b></div>' +
        '<div class="cx-kv">弹幕：' + kinds.map((k) =>
          '<span class="cx-pip">' + (KERNEL_NAME[k] || k) + '</span>').join('') + '</div>' +
        '<div class="cx-kv cx-num">' +
          '血量倍率 ×' + def.hpMul.toFixed(2) +
          '　弹速 ' + def.speed +
          '　开火间隔 ×' + def.cdMul.toFixed(2) + '</div>' +
        '<div class="cx-kv">阶段弹幕池：</div>' +
        def.phases.map((p, pi) =>
          '<div class="cx-phase"><span class="cx-pi">' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][pi] + '</span>' +
          p.map((k) => KERNEL_NAME[k] || k).join(' → ') + '</div>').join('') +
        '</section>';
    });

    return html;
  }

  /* ============================================================
     二、界面控制
     ============================================================ */
  const TABS = { guide: guideHTML, build: buildHTML, boss: bossHTML };

  let current = 'guide';
  let opened = false;

  function render(tab) {
    current = TABS[tab] ? tab : 'guide';
    const body = document.getElementById('codex-body');
    if (body) {
      body.innerHTML = TABS[current]();
      body.scrollTop = 0;
    }
    document.querySelectorAll('#screen-codex .tab').forEach((t) => {
      t.classList.toggle('on', t.dataset.tab === current);
    });
  }

  function open(tab) {
    opened = true;
    render(tab || current);
    if (G.showScreen) G.showScreen('codex');
    else {
      const el = document.getElementById('screen-codex');
      if (el) el.classList.remove('hidden');
    }
  }

  function close() {
    opened = false;
    if (G.showScreen) G.showScreen('menu');
    else {
      const el = document.getElementById('screen-codex');
      if (el) el.classList.add('hidden');
    }
  }

  function isOpen() { return opened; }

  /** 绑定 DOM（元素不存在时全部安全跳过，方便单测） */
  function bind() {
    const btn = document.getElementById('btn-codex');
    if (btn) btn.addEventListener('click', () => open('guide'));

    const closeBtn = document.getElementById('btn-codex-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.querySelectorAll('#screen-codex .tab').forEach((t) => {
      t.addEventListener('click', () => render(t.dataset.tab));
    });
  }

  G.codex = {
    open, close, isOpen, render, bind,
    tabs: ['guide', 'build', 'boss'],
    html: TABS,
  };

  bind();
  G.log && G.log('[星际突袭] 图鉴就绪');
})();
