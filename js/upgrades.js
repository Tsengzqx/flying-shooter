/* ============================================================
   星际突袭 · Roguelike 增益系统  js/upgrades.js
   ------------------------------------------------------------
   获取方式：经验升级 → 每升 1 级弹出三选一

   品质：
     common 普通（蓝） / rare 稀有（青） / epic 史诗（紫） / gold 金色
     · 金色增益只属于三大流派，需要该流派累计达到 GOLD_UNLOCK 层才解锁
     · 金色基础权重极低，且随玩家等级提升出现概率

   流派倾向：
     玩得越多的流派，其增益出现概率越高；其它流派降低；通用不受影响。
     金色/史诗/稀有都会做同样的倾向加权。

   卡面信息：
     desc  = 当前效果
     delta = 再升 1 级额外获得什么（让玩家清楚升级收益）

   三大流派 + 通用：
     🎁 道具流 / 📘 升级流 / 🐝 弹幕流 / ⚙️ 通用（含子弹类型）
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  /* ============================================================
     一、增益池
     ============================================================ */
  const POOL = [
    /* ================= 🐝 弹幕流 ================= */
    { id: 'swarm_ammo',   name: '蜂群弹幕', icon: '🐝', build: 'swarm', rarity: 'epic',   max: 4,
      desc: '额外 +3 条弹道，子弹伤害 −12%',
      delta: '再 +3 条弹道，伤害再 −12%' },
    { id: 'swarm_rate',   name: '超速循环', icon: '⏩', build: 'swarm', rarity: 'common', max: 5,
      desc: '射击间隔 −16%',
      delta: '射击间隔再 −16%' },
    { id: 'swarm_split',  name: '分裂弹头', icon: '✳️', build: 'swarm', rarity: 'rare',   max: 3,
      desc: '额外 +2 条弹道，子弹伤害 −8%',
      delta: '再 +2 条弹道，伤害再 −8%' },
    { id: 'swarm_lance',  name: '前向弹道', icon: '⬆️', build: 'swarm', rarity: 'rare',   max: 4,
      desc: '机首正前方额外 +2 条笔直弹道（不散射）',
      delta: '正前方再 +2 条弹道' },
    { id: 'swarm_spread', name: '散射阵列', icon: '🌟', build: 'swarm', rarity: 'common', max: 4,
      desc: '弹道呈扇形散开，覆盖面更广',
      delta: '扇形角度再扩大一档' },
    { id: 'swarm_speed',  name: '高速弹丸', icon: '💨', build: 'swarm', rarity: 'common', max: 4,
      desc: '子弹飞行速度 +15%',
      delta: '子弹速度再 +15%' },
    { id: 'swarm_micro',  name: '微型弹',   icon: '🔹', build: 'swarm', rarity: 'common', max: 4,
      desc: '子弹体积 −25%，射击间隔 −10%',
      delta: '体积再 −25%，射速再 −10%' },
    { id: 'swarm_side',   name: '侧翼炮台', icon: '↔️', build: 'swarm', rarity: 'common', max: 3,
      desc: '向斜前方追加一对火力',
      delta: '再追加一对侧翼火力' },
    { id: 'swarm_rear',   name: '尾部机炮', icon: '🔄', build: 'swarm', rarity: 'common', max: 3,
      desc: '向机身后方追加火力',
      delta: '后方再追加一条火力' },
    { id: 'swarm_pierce', name: '穿甲弹头', icon: '🗡️', build: 'swarm', rarity: 'rare',   max: 3,
      desc: '子弹可多穿透 1 个敌人',
      delta: '再多穿透 1 个敌人' },
    { id: 'swarm_torrent', name: '弹幕洪流', icon: '🌊', build: 'swarm', rarity: 'epic',   max: 3,
      desc: '额外 +4 条弹道，子弹伤害 −15%',
      delta: '再 +4 条弹道，伤害再 −15%' },
    { id: 'swarm_ring',   name: '相位环射', icon: '💫', build: 'swarm', rarity: 'epic',   max: 3,
      desc: '每隔一段时间射出一圈全向弹幕',
      delta: '环形弹数量 +4，冷却更短' },

    /* ---- 弹幕流 · 紫 ---- */
    { id: 'swarm_swarm',      name: '饱和攻击', icon: '🎇', build: 'swarm', rarity: 'epic', max: 3,
      desc: '射击间隔 −22%，子弹伤害 −10%',
      delta: '射击间隔再 −22%，伤害再 −10%' },
    { id: 'swarm_mirror',     name: '镜像齐射', icon: '🪞', build: 'swarm', rarity: 'epic', max: 3,
      desc: '每次射击时同步向后打出一整排镜像弹道',
      delta: '镜像弹道再增加一排' },
    { id: 'swarm_saturation', name: '火力覆盖', icon: '🎆', build: 'swarm', rarity: 'epic', max: 3,
      desc: '弹道扇形张角大幅扩大，横向覆盖整片空域',
      delta: '扇形张角再扩大一档' },

    /* ---- 弹幕流 · 金 ---- */
    { id: 'gold_swarm_storm', name: '无尽弹幕', icon: '🌪️', build: 'swarm', rarity: 'gold', max: 1,
      desc: '（金色）弹道总数翻倍，子弹伤害 −10%',
      delta: '金色增益已满级' },
    { id: 'gold_swarm_echo',  name: '回响射击', icon: '🔁', build: 'swarm', rarity: 'gold', max: 1,
      desc: '（金色）每次射击有 35% 概率立刻再打一轮',
      delta: '金色增益已满级' },
    { id: 'gold_swarm_lance', name: '相位长枪', icon: '🔱', build: 'swarm', rarity: 'gold', max: 1,
      desc: '（金色）子弹获得近乎无限的穿透力',
      delta: '金色增益已满级' },

    /* ================= 🎁 道具流 ================= */
    { id: 'item_power',    name: '装备强化', icon: '⚙️', build: 'item', rarity: 'epic',   max: 5,
      desc: '每累计拾取 1 件道具，子弹伤害 +0.05',
      delta: '每件道具的伤害加成 +0.05' },
    { id: 'item_drop',     name: '补给协议', icon: '📦', build: 'item', rarity: 'common', max: 6,
      desc: '道具掉落概率 +9%',
      delta: '掉落概率再 +9%' },
    { id: 'item_double',   name: '双倍投放', icon: '🎁', build: 'item', rarity: 'rare',   max: 3,
      desc: '掉落时有 25% 概率额外再掉一个',
      delta: '额外掉落概率再 +25%' },
    { id: 'item_magnet',   name: '磁力吸附', icon: '🧲', build: 'item', rarity: 'common', max: 4,
      desc: '道具吸附范围 +100',
      delta: '吸附范围再 +100' },
    { id: 'item_duration', name: '时效延长', icon: '⏳', build: 'item', rarity: 'common', max: 3,
      desc: '临时道具持续时间 +60%',
      delta: '持续时间再 +60%' },
    { id: 'item_repair',   name: '战地维修', icon: '🔧', build: 'item', rarity: 'rare',   max: 3,
      desc: '拾取道具时 25% 概率回复 1 点生命',
      delta: '回血概率再 +25%' },
    { id: 'item_airdrop',  name: '空投补给', icon: '🪂', build: 'item', rarity: 'rare',   max: 3,
      desc: '定期从上方投下补给箱',
      delta: '空投间隔更短' },
    { id: 'item_quality',  name: '高级补给', icon: '💎', build: 'item', rarity: 'rare',   max: 3,
      desc: '道具效果增强，拾取护盾时附带短暂无敌',
      delta: '道具效果再 +35%' },
    { id: 'item_bomb',     name: '冲击拾取', icon: '💥', build: 'item', rarity: 'rare',   max: 3,
      desc: '拾取道具时清除周围敌弹并造成范围伤害',
      delta: '清除范围与伤害再提升' },
    { id: 'item_resonance', name: '道具共鸣', icon: '🔔', build: 'item', rarity: 'rare',  max: 3,
      desc: '拾取道具时额外触发一次随机增益',
      delta: '额外触发概率再 +55%' },

    /* ---- 道具流 · 紫 ---- */
    { id: 'item_overload',  name: '超载补给', icon: '🧯', build: 'item', rarity: 'epic', max: 3,
      desc: '临时道具持续时间再翻倍',
      delta: '持续时间再翻一倍' },
    { id: 'item_converter', name: '转化装置', icon: '🔄', build: 'item', rarity: 'epic', max: 3,
      desc: '每拾取 1 件道具，永久 +0.15 子弹伤害',
      delta: '每件道具的永久伤害 +0.15' },
    { id: 'item_midas',     name: '点金之手', icon: '👑', build: 'item', rarity: 'epic', max: 2,
      desc: '装备强化的效率 +50%，拾取道具额外得 300 分',
      delta: '装备强化效率再 +50%' },

    /* ---- 道具流 · 金 ---- */
    { id: 'gold_item_hoard',   name: '物资宝库', icon: '🏛️', build: 'item', rarity: 'gold', max: 1,
      desc: '（金色）装备强化的每件道具伤害加成 ×3',
      delta: '金色增益已满级' },
    { id: 'gold_item_shower',  name: '补给风暴', icon: '🌠', build: 'item', rarity: 'gold', max: 1,
      desc: '（金色）掉落概率 +60%，且每次必定掉落两个',
      delta: '金色增益已满级' },
    { id: 'gold_item_alchemy', name: '点石成金', icon: '⚗️', build: 'item', rarity: 'gold', max: 1,
      desc: '（金色）每拾取 1 件道具，永久 +0.4% 射击速度',
      delta: '金色增益已满级' },

    /* ================= 📘 升级流 ================= */
    { id: 'lv_xp',       name: '经验增幅', icon: '📘', build: 'level', rarity: 'common', max: 5,
      desc: '经验获取 +25%',
      delta: '经验获取再 +25%' },
    { id: 'lv_power',    name: '成长之力', icon: '📈', build: 'level', rarity: 'epic',   max: 5,
      desc: '每提升 1 级，子弹伤害 +0.22',
      delta: '每级伤害加成 +0.22' },
    { id: 'lv_haste',    name: '熟练加速', icon: '🌀', build: 'level', rarity: 'epic',   max: 5,
      desc: '每提升 1 级，射击间隔 −3%',
      delta: '每级射速加成再提升' },
    { id: 'lv_vital',    name: '强健体魄', icon: '🫀', build: 'level', rarity: 'rare',   max: 4,
      desc: '每 3 级，生命上限 +1',
      delta: '每 3 级再多 +1 生命上限' },
    { id: 'lv_shield',   name: '升级护盾', icon: '🔵', build: 'level', rarity: 'rare',   max: 3,
      desc: '每次升级获得一层护盾',
      delta: '护盾时长更长' },
    { id: 'lv_heal',     name: '升级回复', icon: '✚',  build: 'level', rarity: 'rare',   max: 3,
      desc: '升级时回复生命（层数越高越频繁）',
      delta: '升级回血更频繁' },
    { id: 'lv_luck',     name: '命运青睐', icon: '🍀', build: 'level', rarity: 'rare',   max: 3,
      desc: '强化选项更容易出现高品质',
      delta: '高品质权重再提升' },
    { id: 'lv_instinct', name: '战斗直觉', icon: '👁️', build: 'level', rarity: 'rare',   max: 4,
      desc: '每 5 级，暴击率 +5%',
      delta: '每 5 级再多 +5% 暴击率' },
    { id: 'lv_potential',name: '潜能爆发', icon: '⚡', build: 'level', rarity: 'epic',   max: 3,
      desc: '升级后 6 秒内射击间隔缩短（每层 −22%）',
      delta: '爆发期间的射速再提升' },

    /* ---- 升级流 · 紫 ---- */
    { id: 'lv_overflow', name: '经验压缩', icon: '🧬', build: 'level', rarity: 'epic', max: 3,
      desc: '升级所需经验 −12%',
      delta: '升级所需经验再 −12%' },
    { id: 'lv_awaken',   name: '觉醒',     icon: '🔮', build: 'level', rarity: 'epic', max: 3,
      desc: '每提升 4 级，额外 +1 条弹道',
      delta: '每 4 级再多 +1 条弹道' },
    { id: 'lv_mastery',  name: '精通',     icon: '🎓', build: 'level', rarity: 'epic', max: 3,
      desc: '每提升 5 级，暴击伤害 +25%',
      delta: '每 5 级再多 +25% 暴击伤害' },

    /* ---- 升级流 · 金 ---- */
    { id: 'gold_level_surge',     name: '经验洪流', icon: '🌊', build: 'level', rarity: 'gold', max: 1,
      desc: '（金色）经验获取 +150%',
      delta: '金色增益已满级' },
    { id: 'gold_level_transcend', name: '超越极限', icon: '🛸', build: 'level', rarity: 'gold', max: 1,
      desc: '（金色）每级伤害加成翻倍，且每级额外 +0.5% 暴击率',
      delta: '金色增益已满级' },
    { id: 'gold_level_ascend',    name: '飞升',     icon: '🌟', build: 'level', rarity: 'gold', max: 1,
      desc: '（金色）立即提升 3 个等级',
      delta: '金色增益已满级' },

    /* ================= 🛸 舰队流 =================
       核心是"僚机数量"，僚机会继承本体 50% 的数值加成
       （弹道数量、射速、穿透、追踪……都能吃一半，比例本身也可升级）
       ------------------------------------------------ */
    { id: 'fleet_drone',   name: '僚机',     icon: '🛸', build: 'fleet', rarity: 'epic',   max: 5,
      desc: '召唤 2 架僚机协同射击',
      delta: '再召唤 2 架僚机' },
    { id: 'fleet_rank',    name: '编队扩充', icon: '🚀', build: 'fleet', rarity: 'common', max: 6,
      desc: '僚机数量 +1',
      delta: '僚机再 +1 架' },
    { id: 'fleet_sync',    name: '数据同步', icon: '📡', build: 'fleet', rarity: 'rare',   max: 4,
      desc: '僚机继承本体数值的比例 +10%（基础 50%）',
      delta: '继承比例再 +10%' },
    { id: 'fleet_rapid',   name: '快速循环', icon: '⏱️', build: 'fleet', rarity: 'common', max: 4,
      desc: '僚机射击间隔 −15%',
      delta: '僚机射速再 −15%' },
    { id: 'fleet_power',   name: '火力共享', icon: '🔥', build: 'fleet', rarity: 'common', max: 5,
      desc: '僚机伤害 +25%',
      delta: '僚机伤害再 +25%' },
    { id: 'fleet_fan',     name: '扇形编队', icon: '🌟', build: 'fleet', rarity: 'common', max: 4,
      desc: '僚机弹道呈扇形散开，覆盖面更广',
      delta: '僚机扇形张角再扩大' },
    { id: 'fleet_aim',     name: '协同瞄准', icon: '🎯', build: 'fleet', rarity: 'rare',   max: 3,
      desc: '僚机子弹自动追踪敌人',
      delta: '僚机追踪能力更强' },
    { id: 'fleet_pierce',  name: '穿甲协奏', icon: '🗡️', build: 'fleet', rarity: 'rare',   max: 3,
      desc: '僚机子弹可多穿透 1 个敌人',
      delta: '僚机子弹再穿透 1 个' },
    { id: 'fleet_guard',   name: '护航点防', icon: '🚨', build: 'fleet', rarity: 'rare',   max: 3,
      desc: '僚机定期清除自身周围的敌方子弹',
      delta: '点防更频繁、范围更大' },

    /* ---- 舰队流 · 紫 ---- */
    { id: 'fleet_escort',  name: '精英护航', icon: '💢', build: 'fleet', rarity: 'epic', max: 3,
      desc: '僚机获得本体的暴击率与暴击伤害',
      delta: '僚机暴击率再 +25%' },
    { id: 'fleet_barrage', name: '饱和投射', icon: '🎆', build: 'fleet', rarity: 'epic', max: 3,
      desc: '僚机射击间隔 −25%，每轮 +1 条弹道',
      delta: '再 −25% 间隔，再多 1 条弹道' },
    { id: 'fleet_link',    name: '神经链接', icon: '🧠', build: 'fleet', rarity: 'epic', max: 3,
      desc: '每架僚机使本体伤害 +1%',
      delta: '每架僚机再 +1% 本体伤害' },

    /* ---- 舰队流 · 金 ---- */
    { id: 'gold_fleet_armada',   name: '星海舰队', icon: '🌌', build: 'fleet', rarity: 'gold', max: 1,
      desc: '（金色）立刻 +4 架僚机，且继承比例 +25%',
      delta: '金色增益已满级' },
    { id: 'gold_fleet_overlord', name: '旗舰指挥', icon: '👑', build: 'fleet', rarity: 'gold', max: 1,
      desc: '（金色）每架僚机使本体与僚机伤害 +4%',
      delta: '金色增益已满级' },
    { id: 'gold_fleet_phalanx',  name: '方阵齐射', icon: '⚔️', build: 'fleet', rarity: 'gold', max: 1,
      desc: '（金色）僚机每轮 +2 条弹道，穿透 +2',
      delta: '金色增益已满级' },

    /* ================= ☢️ 辐射流（持续伤害 DOT） =================
       核心机制：命中给敌机叠加「持续伤害层数」，层数同时决定
       **每跳伤害** 和 **跳数频率** —— 打得越多，烂得越快。

       辐射 / 剧毒 / 燃烧 三种伤害在数值上是**同一种伤害**，统一走
       applyDot() + tickDot() 这一条管线，共享同一份层数与同一套公式。

       ⚠️ 整条管线**完全独立于常规子弹**：
          不读 S.damage / S.critChance / S.critMul / S.fireRateMul /
          S.hitDamage / damageMultiplier / execute / berserk，
          也不产生"命中积累"。DOT 想变强，只能靠下面这些增益。
       ------------------------------------------------------------ */
    { id: 'dot_core',     name: '辐射源',   icon: '☢️', build: 'rad', rarity: 'epic',   max: 5,
      desc: '核心：命中即点燃持续伤害，每层每秒 0.10 伤害',
      delta: '每层每秒伤害 +0.10' },
    { id: 'dot_stack',    name: '衰变增幅', icon: '🦠', build: 'rad', rarity: 'common', max: 5,
      desc: '每次命中额外叠加 1 层持续伤害',
      delta: '每次命中再 +1 层' },
    { id: 'dot_power',    name: '衰变强化', icon: '🔺', build: 'rad', rarity: 'common', max: 6,
      desc: '持续伤害 +25%',
      delta: '持续伤害再 +25%' },
    { id: 'dot_cap',      name: '临界质量', icon: '⚛️', build: 'rad', rarity: 'rare',   max: 4,
      desc: '层数上限 +8',
      delta: '层数上限再 +8' },
    { id: 'dot_haste',    name: '高频衰变', icon: '📶', build: 'rad', rarity: 'common', max: 4,
      desc: '跳数间隔 −12%',
      delta: '跳数间隔再 −12%' },
    { id: 'dot_duration', name: '半衰期延长', icon: '⌛', build: 'rad', rarity: 'common', max: 4,
      desc: '持续时间 +1.5 秒',
      delta: '持续时间再 +1.5 秒' },

    /* ---- 三种伤害源：辐射 / 燃烧 / 剧毒 ---- */
    { id: 'dot_burn',     name: '燃烧弹',   icon: '🧨', build: 'rad', rarity: 'rare',   max: 4,
      desc: '灼烧：命中额外 +2 层，持续伤害 +20%，上限 +3',
      delta: '再 +2 层、伤害再 +20%、上限再 +3' },
    { id: 'dot_venom',    name: '剧毒弹',   icon: '🟢', build: 'rad', rarity: 'rare',   max: 3,
      desc: '中毒：命中额外 +1 层，持续时间 +2 秒，伤害 +18%',
      delta: '再 +1 层、持续再 +2 秒、伤害再 +18%' },

    /* ---- DOT 专属暴击（不吃子弹的暴击率与暴击伤害） ---- */
    { id: 'dot_crit',     name: '致命衰变', icon: '🟥', build: 'rad', rarity: 'rare',   max: 3,
      desc: '持续伤害暴击率 +10%（独立于子弹暴击）',
      delta: '持续伤害暴击率再 +10%' },
    { id: 'dot_critdmg',  name: '毁伤衰变', icon: '🎯', build: 'rad', rarity: 'rare',   max: 4,
      desc: '持续伤害暴击伤害 +40%（基础 150%）',
      delta: '持续伤害暴击伤害再 +40%' },
    { id: 'dot_double',   name: '双重衰变', icon: '♻️', build: 'rad', rarity: 'rare',   max: 3,
      desc: '每次跳数有 25% 概率跳两次',
      delta: '双跳概率再 +25%' },

    /* ---- 辐射流 · 紫 ---- */
    { id: 'dot_chain',    name: '衰变链',   icon: '⛓️', build: 'rad', rarity: 'epic', max: 3,
      desc: '层数越高，跳数越快',
      delta: '加速效果更强' },
    { id: 'dot_burst',    name: '临界引爆', icon: '☄️', build: 'rad', rarity: 'epic', max: 3,
      desc: '层数叠满时引爆：造成范围伤害并保留一半层数',
      delta: '引爆伤害与范围提升' },
    { id: 'dot_spread',   name: '辐射扩散', icon: '☣️', build: 'rad', rarity: 'epic', max: 3,
      desc: '敌人死亡时把层数传染给附近的敌人',
      delta: '传染层数与范围提升' },
    { id: 'dot_field',    name: '辐射场',   icon: '🌐', build: 'rad', rarity: 'epic', max: 3,
      desc: '机体周围形成辐射场，持续给附近敌人叠层',
      delta: '辐射场更大、叠层更快' },

    /* ---- 辐射流 · 金 ---- */
    { id: 'gold_dot_meltdown',    name: '熔毁协议', icon: '🌋', build: 'rad', rarity: 'gold', max: 1,
      desc: '（金色）层数上限翻倍，跳数间隔 −30%，持续伤害 +50%',
      delta: '金色增益已满级' },
    { id: 'gold_dot_plague',      name: '星尘瘟疫', icon: '🌫️', build: 'rad', rarity: 'gold', max: 1,
      desc: '（金色）扩散范围翻倍，传染时保留全部层数',
      delta: '金色增益已满级' },
    { id: 'gold_dot_singularity', name: '奇点衰变', icon: '🕳️', build: 'rad', rarity: 'gold', max: 1,
      desc: '（金色）持续伤害 ×3',
      delta: '金色增益已满级' },

    /* ================= ⚙️ 通用 · 子弹类型 ================= */
    { id: 'gen_laser',    name: '激光弹头', icon: '🔆', build: 'general', rarity: 'rare',   max: 3,
      desc: '子弹变细长：速度 +40%，额外穿透 1 个敌人',
      delta: '速度再 +40%，再穿透 1 个' },
    { id: 'gen_wave',     name: '波动弹',   icon: '〰️', build: 'general', rarity: 'common', max: 3,
      desc: '子弹左右摆动前进，横向覆盖更宽',
      delta: '摆动幅度 +60%，波频更高' },
    { id: 'gen_heavy',    name: '聚能弹',   icon: '🔴', build: 'general', rarity: 'rare',   max: 3,
      desc: '子弹体积 +60%、速度 −18%，伤害 +0.8',
      delta: '体积再 +60%，伤害再 +0.8' },
    { id: 'gen_homing',   name: '追踪弹头', icon: '🧭', build: 'general', rarity: 'epic',   max: 3,
      desc: '子弹自动追踪最近的敌机',
      delta: '追踪转向速度更快' },
    { id: 'gen_ricochet', name: '弹跳弹',   icon: '🎱', build: 'general', rarity: 'common', max: 2,
      desc: '子弹碰到屏幕两侧会反弹',
      delta: '反弹次数上限提高' },
    { id: 'gen_plasma',   name: '等离子弹', icon: '🟣', build: 'general', rarity: 'epic',   max: 3,
      desc: '紫白能量弹，命中时溅射伤害周围敌人',
      delta: '溅射范围与伤害提升' },
    { id: 'gen_frost',    name: '霜冻弹',   icon: '❄️', build: 'general', rarity: 'rare',   max: 3,
      desc: '冰蓝弹丸，命中后让目标减速',
      delta: '减速更强、持续更久' },
    { id: 'gen_arc',      name: '电弧弹',   icon: '⚡', build: 'general', rarity: 'rare',   max: 3,
      desc: '命中时放出电弧跳向最近的一个敌人',
      delta: '电弧伤害提升' },
    { id: 'gen_rail',     name: '轨道弹',   icon: '🚄', build: 'general', rarity: 'epic',   max: 2,
      desc: '极细高亮弹道：速度翻倍、穿透无限',
      delta: '速度再翻倍（已无限穿透）' },

    /* ================= ⚙️ 通用 · 基础 ================= */
    { id: 'gen_hitpower', name: '命中积累', icon: '🎖️', build: 'general', rarity: 'common', max: 5,
      desc: '每命中敌机 1 次，伤害永久 +0.0025/层（无上限）',
      delta: '每次命中的加成再 +0.0025' },
    { id: 'gen_pointdef', name: '点防系统', icon: '🛰️', build: 'general', rarity: 'rare',   max: 4,
      desc: '每隔一段时间清除机体周围的敌方子弹',
      delta: '清除更频繁、范围更大' },
    { id: 'gen_rapid',    name: '攻速强化', icon: '🔫', build: 'general', rarity: 'common', max: 5,
      desc: '射击间隔 −12%',
      delta: '射击间隔再 −12%' },
    { id: 'gen_speed',    name: '引擎超频', icon: '🚀', build: 'general', rarity: 'common', max: 4,
      desc: '移动速度 +15%',
      delta: '移动速度再 +15%' },
    { id: 'gen_agile',    name: '灵敏操控', icon: '🕹️', build: 'general', rarity: 'common', max: 3,
      desc: '跟随与转向更灵敏',
      delta: '操控再灵敏一档' },
    { id: 'gen_power',    name: '火力强化', icon: '🔥', build: 'general', rarity: 'common', max: 8,
      desc: '子弹伤害 +0.5',
      delta: '子弹伤害再 +0.5' },
    { id: 'gen_crit',     name: '精准打击', icon: '🎯', build: 'general', rarity: 'common', max: 6,
      desc: '暴击率 +8%',
      delta: '暴击率再 +8%' },
    { id: 'gen_critdmg',  name: '致命一击', icon: '💢', build: 'general', rarity: 'rare',   max: 5,
      desc: '暴击伤害 +60%',
      delta: '暴击伤害再 +60%' },
    { id: 'gen_bigshot',  name: '重型弹头', icon: '⚫', build: 'general', rarity: 'rare',   max: 4,
      desc: '子弹体积 +35%，伤害 +0.4',
      delta: '体积再 +35%，伤害再 +0.4' },
    { id: 'gen_vital',    name: '生命强化', icon: '❤️', build: 'general', rarity: 'epic',   max: 3,
      desc: '生命上限 +1，并立即回复 1 点',
      delta: '生命上限再 +1' },
    { id: 'gen_armor',    name: '复合装甲', icon: '🛡️', build: 'general', rarity: 'rare',   max: 4,
      desc: '15% 概率完全免疫伤害',
      delta: '免伤概率再 +15%' },
    { id: 'gen_invuln',   name: '紧急回避', icon: '⏱️', build: 'general', rarity: 'common', max: 3,
      desc: '受伤后的无敌时间 +0.6 秒',
      delta: '无敌时间再 +0.6 秒' },
    { id: 'gen_revive',   name: '凤凰核心', icon: '🕊️', build: 'general', rarity: 'epic',   max: 2,
      desc: '阵亡时原地复活并进入无敌',
      delta: '再多一次复活机会' },
    { id: 'gen_freeze',   name: '寒冰力场', icon: '🧊', build: 'general', rarity: 'rare',   max: 4,
      desc: '全场敌人移动速度下降 15%',
      delta: '全场减速再 +15%' },
    { id: 'gen_explode',  name: '爆裂弹',   icon: '💣', build: 'general', rarity: 'rare',   max: 4,
      desc: '击杀敌机时引发范围爆炸',
      delta: '爆炸范围与伤害提升' },
    { id: 'gen_chain',    name: '连锁闪电', icon: '🌩️', build: 'general', rarity: 'epic',   max: 4,
      desc: '击杀时电弧跳向附近敌机',
      delta: '多跳跃一次' },
    { id: 'gen_vamp',     name: '吸血装置', icon: '🩸', build: 'general', rarity: 'rare',   max: 3,
      desc: '累计击杀可回复生命（层数越高越快）',
      delta: '回血所需击杀更少' },
    { id: 'gen_orbit',    name: '环绕卫星', icon: '🪐', build: 'general', rarity: 'rare',   max: 4,
      desc: '卫星环绕机体，撞击并伤害敌人',
      delta: '再多一颗卫星' },
    { id: 'gen_combo',    name: '连击大师', icon: '🔗', build: 'general', rarity: 'rare',   max: 3,
      desc: '连续击杀可叠加得分倍率',
      delta: '连击倍率提升' },
    { id: 'gen_score',    name: '战果加成', icon: '💰', build: 'general', rarity: 'common', max: 5,
      desc: '所有得分 +20%',
      delta: '得分再 +20%' },
    { id: 'gen_berserk',  name: '背水一战', icon: '😤', build: 'general', rarity: 'rare',   max: 3,
      desc: '生命越少，伤害越高',
      delta: '低血量加成更强' },
    { id: 'gen_execute',  name: '弱点打击', icon: '☠️', build: 'general', rarity: 'rare',   max: 3,
      desc: '对高血量敌人伤害 +35%',
      delta: '对高血量敌人再加 35%' },
  ];

  const BUILD_NAME = { item: '道具流', level: '升级流', swarm: '弹幕流', fleet: '舰队流', rad: '持续伤害流', general: '通用' };

  const byId = {};
  for (const b of POOL) byId[b.id] = b;

  /* ============================================================
     二、状态
     ============================================================ */
  const owned = {};

  const state = {
    pending: false,
    offers: [],
    level: 0,
    kills: 0,
    hits: 0,
    combo: 0,
    comboT: 0,
    revives: 0,
    pointDefT: 2,
    airdropT: 14,
    dotFieldT: 0.6,
    drones: [],
    orbits: [],
    orbitAngle: 0,
    alchemy: 0,      // 点石成金累计
  };

  const RARITY_WEIGHT = { common: 62, rare: 30, epic: 12, gold: 0.8 };
  const GOLD_UNLOCK = 8;      // 某流派累计多少层后解锁该流派的金色增益
  const DRONE_CAP = 20;        // 僚机数量上限
  const DRONE_BASE_CD = 0.62;  // 僚机基础射击间隔（秒）
  const DRONE_MAX_BULLETS = 5; // 单架僚机每轮最多打几发（防止 20 架刷爆屏幕）
  const DRONE_FLEET_TAX = 0.035; // 僚机越多，单机射速略降（保持总输出可控）

  /* ============================================================
     三、属性汇总
     ============================================================ */
  function lv(id) {
    return owned[id] || 0;
  }

  function itemCount() {
    return (G.powerups && G.powerups.state && G.powerups.state.collected) || 0;
  }

  function playerLevel() {
    return (G.progress && G.progress.level) || 1;
  }

  /** 某流派累计投入的层数 */
  function buildCount(build) {
    let n = 0;
    for (const b of POOL) {
      if (b.build === build) n += lv(b.id);
    }
    return n;
  }

  /** 各流派的"亲和度"：玩得越多的流派权重越高，通用恒为 1 */
  function buildAffinity() {
    const inv = { swarm: 0, item: 0, level: 0, fleet: 0, rad: 0 };
    for (const b of POOL) {
      if (b.build === 'general') continue;
      if (!(b.build in inv)) inv[b.build] = 0;   // 新增流派自动纳入，避免 NaN
      inv[b.build] += lv(b.id);
    }

    let total = 0;
    for (const k in inv) total += inv[k];

    const aff = { general: 1 };

    if (total === 0) {
      for (const k in inv) aff[k] = 1;
      return aff;
    }

    for (const k in inv) {
      const share = inv[k] / total;       // 0 ~ 1
      aff[k] = 0.5 + 1.6 * share;         // 主导流派 ≈2.1，冷门流派 ≈0.5
    }
    return aff;
  }

  function recalc() {
    const S = G.stats;
    if (!S) return;

    const items = itemCount();
    const plv = playerLevel();
    const gained = plv - 1;

    /* ---------- 子弹类型：本体造型 + 元素光晕 ----------
       造型和元素拆开：以前拿了等离子弹，所有子弹都会变成又粗又紫的圆球，
       看起来像显示 bug；现在元素只作为套在弹体外的一圈光环。 */
    S.bulletStyle =
      lv('gen_rail') > 0 ? 'rail' :
      lv('gen_laser') > 0 ? 'laser' :
      lv('gen_heavy') > 0 ? 'heavy' : 'normal';

    S.bulletElements = [];
    if (lv('gen_plasma') > 0) S.bulletElements.push('plasma');
    if (lv('gen_frost') > 0) S.bulletElements.push('frost');
    if (lv('dot_venom') > 0) S.bulletElements.push('venom');
    if (lv('dot_burn') > 0) S.bulletElements.push('ember');

    /* ---------- 命中特效 ---------- */
    S.splash = lv('gen_plasma');
    S.frost  = lv('gen_frost');
    S.arc    = lv('gen_arc');

    /* ---------- 弹幕流：核心是"子弹数量" ---------- */
    let extra = 3 * lv('swarm_ammo') + 2 * lv('swarm_split') + 4 * lv('swarm_torrent');

    // 觉醒：每 4 级 +1 条弹道
    if (lv('lv_awaken') > 0) extra += Math.floor(gained / 4) * lv('lv_awaken');

    // 金色：无尽弹幕 —— 弹道总数翻倍
    if (lv('gold_swarm_storm') > 0) extra = extra * 2 + 2;

    S.extraBullets = extra;
    S.frontLanes   = 2 * lv('swarm_lance');
    S.mirror       = lv('swarm_mirror');
    S.spreadAngle  = 0.09 * lv('swarm_spread') + 0.16 * lv('swarm_saturation');
    S.sideGun      = lv('swarm_side');
    S.rearGun      = lv('swarm_rear');
    S.ringShot     = lv('swarm_ring');

    // 穿透：穿甲 + 激光 + 金色相位长枪（近乎无限）
    S.pierce = lv('swarm_pierce') + lv('gen_laser') + (lv('gold_swarm_lance') > 0 ? 999 : 0);

    /* ---------- 子弹速度 / 体积 ---------- */
    let speedMul = Math.pow(1.15, lv('swarm_speed'));
    let sizeMul = Math.pow(0.75, lv('swarm_micro')) * (1 + 0.35 * lv('gen_bigshot'));

    speedMul *= Math.pow(1.40, lv('gen_laser'));
    sizeMul *= Math.pow(0.55, lv('gen_laser'));

    speedMul *= Math.pow(0.82, lv('gen_heavy'));
    sizeMul *= Math.pow(1.60, lv('gen_heavy'));

    speedMul *= Math.pow(2.0, lv('gen_rail'));        // 轨道弹：速度翻倍
    sizeMul *= Math.pow(0.35, lv('gen_rail'));        //           极细

    S.bulletSpeedMul = speedMul;
    S.bulletSizeMul = sizeMul;

    S.bulletWave = lv('gen_wave');
    S.bulletRicochet = lv('gen_ricochet');
    S.homing = lv('gen_homing');

    /* ---------- 射速 ---------- */
    let cd = Math.pow(0.88, lv('gen_rapid'))
           * Math.pow(0.84, lv('swarm_rate'))
           * Math.pow(0.90, lv('swarm_micro'))
           * Math.pow(0.78, lv('swarm_swarm'))
           * Math.pow(0.996, state.alchemy);          // 金色：点石成金

    S.levelHaste = lv('lv_haste');
    if (S.levelHaste > 0) cd *= Math.pow(0.97, S.levelHaste * gained);

    S.fireRateMul = Math.max(0.20, cd);

    /* ---------- 舰队流：僚机编队 ---------- */
    S.drones = Math.min(DRONE_CAP,
      2 * lv('fleet_drone') +
      lv('fleet_rank') +
      (lv('gold_fleet_armada') > 0 ? 4 : 0));

    // 僚机继承本体数值的比例（基础 25%，可被数据同步 / 星海舰队拉高）
    S.droneInherit = Math.min(1,
      0.25 + 0.10 * lv('fleet_sync') + (lv('gold_fleet_armada') > 0 ? 0.25 : 0));

    S.droneDamageMul = Math.pow(1.25, lv('fleet_power'))
      * (lv('gold_fleet_overlord') > 0 ? 1 + 0.04 * S.drones : 1);

    S.droneFireMul = Math.pow(0.85, lv('fleet_rapid'))
      * Math.pow(0.75, lv('fleet_barrage'))
      * (lv('gold_fleet_overlord') > 0 ? 0.70 : 1);

    S.droneBullets   = lv('fleet_barrage') + 2 * lv('gold_fleet_phalanx');
    S.droneSpread    = 0.07 * lv('fleet_fan');
    S.dronePierce    = lv('fleet_pierce') + 2 * lv('gold_fleet_phalanx');
    S.droneHoming    = lv('fleet_aim');
    S.droneCrit      = lv('fleet_escort');
    S.dronePointDef  = lv('fleet_guard');

    // 每架僚机给本体带来的伤害加成（神经链接 / 旗舰指挥）
    S.fleetBodyDamage = 0.01 * lv('fleet_link') * S.drones
      + (lv('gold_fleet_overlord') > 0 ? 0.04 * S.drones : 0);

    /* 舰队流的"来源标记"（这些效果依赖僚机数量，单独留个字段便于面板与调试） */
    S.fleetLink    = lv('fleet_link');
    S.goldArmada   = lv('gold_fleet_armada');
    S.goldOverlord = lv('gold_fleet_overlord');
    S.goldPhalanx  = lv('gold_fleet_phalanx');

    /* ---------- 伤害 ---------- */
    let dmg = 1 + 0.5 * lv('gen_power') + 0.4 * lv('gen_bigshot') + 0.8 * lv('gen_heavy');
    dmg *= Math.pow(0.88, lv('swarm_ammo'));
    dmg *= Math.pow(0.92, lv('swarm_split'));
    dmg *= Math.pow(0.85, lv('swarm_torrent'));
    dmg *= Math.pow(0.90, lv('swarm_swarm'));
    if (lv('gold_swarm_storm') > 0) dmg *= 0.90;

    // 道具流：装备强化（可被点金之手放大、被物资宝库三倍化）
    let itemRate = 0.05 * lv('item_power');
    itemRate *= (1 + 0.5 * lv('item_midas'));
    if (lv('gold_item_hoard') > 0) itemRate *= 3;
    dmg += itemRate * items;

    // 升级流核心
    let levelRate = 0.22 * lv('lv_power') * (lv('gold_level_transcend') > 0 ? 2 : 1);
    dmg += levelRate * gained;

    // 道具共鸣衍生：转化装置
    dmg += 0.15 * lv('item_converter') * items;

    // 舰队流：僚机越多，本体越强（神经链接 / 旗舰指挥）
    dmg *= 1 + S.fleetBodyDamage;

    S.damage = Math.max(0.2, dmg);
    S.itemDamage = itemRate;
    S.levelDamage = levelRate;

    /* ---------- 命中积累：无上限，但每次加成很小 ---------- */
    S.hitDamage = 0.0025 * lv('gen_hitpower');
    S.hitDamageCap = Infinity;

    /* ---------- 经验 ---------- */
    let xpMul = Math.pow(1.25, lv('lv_xp'));
    if (lv('gold_level_surge') > 0) xpMul *= 2.5;
    S.xpMul = xpMul;
    S.xpCostCut = lv('lv_overflow');

    /* ---------- 暴击（上限 100%） ---------- */
    let crit = 0.08 * lv('gen_crit')
             + 0.05 * Math.floor(gained / 5) * lv('lv_instinct');
    if (lv('gold_level_transcend') > 0) crit += 0.005 * gained;

    S.critChance = Math.min(1, crit);          // ← 上限改为 100%
    S.critMul = 2 + 0.6 * lv('gen_critdmg')
              + 0.25 * Math.floor(gained / 5) * lv('lv_mastery');

    /* ---------- 生存 ---------- */
    S.maxLives        = 3 + lv('gen_vital') + lv('lv_vital') * Math.floor(gained / 3);
    S.invulnBonus     = 0.6 * lv('gen_invuln');
    S.armor           = 0.15 * lv('gen_armor');
    S.revive          = lv('gen_revive');
    S.shieldOnLevelUp = lv('lv_shield');
    S.healOnLevelUp   = lv('lv_heal');
    S.potential       = lv('lv_potential');

    /* ---------- 移动 ---------- */
    S.moveSpeedMul = Math.pow(1.15, lv('gen_speed'));
    S.agility      = 1 + 0.35 * lv('gen_agile');
    S.magnet       = 100 * lv('item_magnet');

    /* ---------- 道具流 ---------- */
    let dropRate = 0.09 * lv('item_drop');
    let doubleDrop = 0.25 * lv('item_double');
    if (lv('gold_item_shower') > 0) { dropRate += 0.60; doubleDrop = 1; }

    S.dropRate        = dropRate;
    S.doubleDrop      = doubleDrop;
    S.itemDurationMul = (1 + 0.60 * lv('item_duration')) * (1 + 1.0 * lv('item_overload'));
    S.itemRepair      = 0.25 * lv('item_repair');
    S.itemQuality     = lv('item_quality');
    S.itemBomb        = lv('item_bomb');
    S.itemResonance   = lv('item_resonance');
    S.itemMidas       = lv('item_midas');
    S.itemConverter   = lv('item_converter');
    S.itemHoard       = lv('gold_item_hoard');
    S.goldShower      = lv('gold_item_shower');
    S.goldAlchemy     = lv('gold_item_alchemy');
    S.airdrop         = lv('item_airdrop');

    /* ---------- 辐射流：持续伤害 DOT ----------
       整块只读 dot_* / gold_dot_* 增益，**不引用任何常规子弹属性**。
       这是"独立伤害类型"的落点：想把 DOT 做强，只能拿 DOT 自己的增益。 */
    const dotLv = lv('dot_core');

    // 点火条件：必须有辐射源。燃烧弹 / 剧毒弹只是"燃料"，不单独点火。
    const dotOn = dotLv > 0;

    S.dotPerStack = dotOn
      ? 0.32 * dotLv
        * (1 + 0.25 * lv('dot_power'))
        * (1 + 0.20 * lv('dot_burn'))
        * (1 + 0.18 * lv('dot_venom'))
        * (lv('gold_dot_meltdown') > 0 ? 1.50 : 1)
        * (lv('gold_dot_singularity') > 0 ? 3 : 1)
      : 0;

    S.dotPerHit = dotOn
      ? 1 + lv('dot_stack') + 2 * lv('dot_burn') + lv('dot_venom')
      : 0;

    S.dotMax = (15 + 6 * dotLv + 10 * lv('dot_cap') + 4 * lv('dot_burn'))
      * (lv('gold_dot_meltdown') > 0 ? 2 : 1);

    // 跳数间隔：越短，跳得越密 —— 注意它**真的影响 DPS**，见 tickDot 的注释
    S.dotInterval = Math.max(0.05,
      0.5 * Math.pow(0.88, lv('dot_haste')) * (lv('gold_dot_meltdown') > 0 ? 0.70 : 1));

    S.dotDuration = 4 + 1.5 * lv('dot_duration') + 2 * lv('dot_venom') + lv('dot_burn');

    // DOT 自己的暴击：基础 0%，拿"致命衰变"才有；暴击伤害基础 150%
    S.dotCritChance = Math.min(1, 0.10 * lv('dot_crit'));
    S.dotCritMul    = 1.5 + 0.40 * lv('dot_critdmg');
    S.dotCrit       = lv('dot_crit');          // 来源标记（面板/调试）
    S.dotCritDmg    = lv('dot_critdmg');

    S.dotDouble   = 0.25 * lv('dot_double');
    S.dotChain    = lv('dot_chain');
    S.dotBurst    = lv('dot_burst');
    S.dotSpread   = lv('dot_spread');
    S.dotField    = lv('dot_field');
    S.dotPlague   = lv('gold_dot_plague');
    S.dotMeltdown = lv('gold_dot_meltdown');
    S.dotSingularity = lv('gold_dot_singularity');

    // 面板/其它模块判断"DOT 是否激活"只看这一个字段
    S.dotActive = dotOn;

    /* ---------- 特效 ---------- */
    S.explodeOnKill = lv('gen_explode');
    S.chain         = lv('gen_chain');
    S.slow          = lv('gen_freeze');
    S.vamp          = lv('gen_vamp');
    S.pointDef      = lv('gen_pointdef');
    S.echoChance    = lv('gold_swarm_echo') > 0 ? 0.35 : 0;

    /* 金色 / 紫 的"来源标记"，便于面板与调试读取 */
    S.goldStorm     = lv('gold_swarm_storm');
    S.goldLance     = lv('gold_swarm_lance');
    S.goldSurge     = lv('gold_level_surge');
    S.goldTranscend = lv('gold_level_transcend');
    S.goldAscend    = lv('gold_level_ascend');
    S.lvAwaken      = lv('lv_awaken');
    S.lvMastery     = lv('lv_mastery');

    /* ---------- 经济 / 特殊 ---------- */
    S.luck     = lv('lv_luck');
    S.scoreMul = Math.pow(1.2, lv('gen_score'));
    S.combo    = lv('gen_combo');
    S.berserk  = lv('gen_berserk');
    S.execute  = lv('gen_execute');

    /* ---------- 召唤 ---------- */
    // 注意：S.drones 已经在"舰队流"那一段算好了，这里不要再覆盖
    S.orbits = lv('gen_orbit');

    if (G.lives > S.maxLives) G.lives = S.maxLives;
    if (G.hud && G.hud.invalidate) G.hud.invalidate();
  }

  function syncSummons() {
    const S = G.stats;
    while (state.drones.length < S.drones) {
      state.drones.push({ x: undefined, y: undefined, cd: Math.random() * 0.5, defCd: 0, init: false });
    }
    state.drones.length = S.drones;

    while (state.orbits.length < S.orbits) {
      state.orbits.push({ x: undefined, y: undefined, cd: 0 });
    }
    state.orbits.length = S.orbits;
  }

  /* ============================================================
     四、抽卡（含流派倾向与金色解锁）
     ============================================================ */
  function goldUnlocked(build) {
    return build !== 'general' && buildCount(build) >= GOLD_UNLOCK;
  }

  /** 是否已经满级 —— 满级增益的出现概率必须为 0 */
  function isMaxed(b) {
    return lv(b.id) >= b.max;
  }

  function rollOffers(n) {
    const S = G.stats || {};
    const aff = buildAffinity();
    const plv = playerLevel();

    // 满级增益直接剔除；金色还要满足流派解锁条件
    const avail = POOL.filter((b) => {
      if (isMaxed(b)) return false;
      if (b.rarity === 'gold') return goldUnlocked(b.build);
      return true;
    });

    const picks = [];
    const weights = avail.map((b) => {
      // 双保险：即使上面漏了，这里权重也归零
      if (isMaxed(b)) return 0;

      let w = RARITY_WEIGHT[b.rarity] || 1;

      if (b.rarity === 'gold') {
        w *= 1 + plv * 0.12;                 // 随玩家等级提升出现概率
      } else if (b.rarity === 'epic') {
        w *= 1 + 0.40 * (S.luck || 0);
      } else if (b.rarity === 'rare') {
        w *= 1 + 0.18 * (S.luck || 0);
      }

      w *= (aff[b.build] || 1);              // 流派倾向
      return w;
    });

    for (let k = 0; k < n && avail.length > 0; k++) {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) break;                 // 全都满级了

      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) { idx = i; break; }
        idx = i;
      }

      picks.push(avail[idx]);
      avail.splice(idx, 1);
      weights.splice(idx, 1);
    }

    return picks;
  }

  /* ============================================================
     五、界面
     ============================================================ */
  const els = { cards: null, level: null, ownedList: null };

  function cacheEls() {
    els.cards = document.getElementById('upgrade-cards');
    els.level = document.getElementById('upgrade-level');
    els.ownedList = document.getElementById('upgrade-owned');
  }
  cacheEls();

  function render() {
    if (els.level) els.level.textContent = state.level;

    if (els.cards) {
      els.cards.innerHTML = state.offers.map((b, i) => {
        const cur = lv(b.id);
        const after = cur + 1;
        const stack = cur > 0 ? ('Lv ' + cur + ' → ' + after) : '新获得';
        // 这一层是最后一层时明确标注
        const delta = (after >= b.max ? '满级 ' + b.delta : '升级 +1 级：' + b.delta);

        return '' +
          '<button class="card rarity-' + b.rarity + '" data-id="' + b.id + '">' +
            '<span class="card-hot">' + (i + 1) + '</span>' +
            '<span class="card-tag build-' + b.build + '">' + BUILD_NAME[b.build] + '</span>' +
            '<span class="card-icon">' + b.icon + '</span>' +
            '<span class="card-name">' + b.name + '</span>' +
            '<span class="card-desc">' + b.desc + '</span>' +
            '<span class="card-delta">' + delta + '</span>' +
            '<span class="card-stack">' + stack + '</span>' +
          '</button>';
      }).join('');
    }

    renderOwned();
  }

  function renderOwned() {
    if (!els.ownedList) return;

    const chips = POOL
      .filter((b) => lv(b.id) > 0)
      .map((b) => '<span class="chip build-' + b.build + '">' +
                  b.icon + ' ' + b.name + ' <b>×' + lv(b.id) + '</b></span>')
      .join('');

    els.ownedList.innerHTML = chips || '<span class="chip empty">尚未获得任何强化</span>';
  }

  if (els.cards && els.cards.addEventListener) {
    els.cards.addEventListener('click', (e) => {
      const t = e.target;
      const btn = t && t.closest ? t.closest('.card') : null;
      if (!btn) return;
      choose(btn.getAttribute('data-id'));
    });
  }

  window.addEventListener('keydown', (e) => {
    if (G.state !== 'upgrade') return;
    const map = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
    const idx = map[e.code];
    if (idx === undefined) return;
    e.preventDefault();
    if (state.offers[idx]) choose(state.offers[idx].id);
  });

  /* ============================================================
     六、流程
     ============================================================ */
  function request(level) {
    if (state.pending) return;
    if (G.state !== 'playing') return;

    const offers = rollOffers(3);
    if (offers.length === 0) {
      if (G.progress && G.progress.onChosen) G.progress.onChosen();
      return;
    }

    state.offers = offers;
    state.pending = true;
    state.level = level;

    render();

    G.state = 'upgrade';
    G.screen = 'upgrade';
    if (G.syncUI) G.syncUI();
  }

  function choose(id) {
    if (!state.pending) return;
    const def = byId[id];

    // 无效或已满级：直接退出选择界面，绝不让流程卡在强化面板
    if (!def || isMaxed(def)) {
      state.pending = false;
      G.state = 'playing';
      G.screen = null;
      if (G.syncUI) G.syncUI();
      if (G.progress && G.progress.onChosen) G.progress.onChosen();
      return;
    }

    owned[id] = lv(id) + 1;

    if (id === 'gen_revive') state.revives++;

    recalc();

    if (id === 'gen_vital') {
      G.lives = Math.min(G.stats.maxLives, G.lives + 1);
    }

    // 金色：飞升 —— 立刻提升 3 级
    if (id === 'gold_level_ascend' && G.progress) {
      let need = 0;
      for (let k = 0; k < 3; k++) {
        need += G.progress.xpFor(G.progress.state.level + k);
      }
      G.progress.addXp(need);
    }

    syncSummons();

    state.pending = false;
    G.state = 'playing';
    G.screen = null;
    if (G.syncUI) G.syncUI();
    if (G.hud) G.hud.invalidate();

    if (G.progress && G.progress.onChosen) G.progress.onChosen();

    const P = G.player;
    if (G.particles && P) {
      const gold = def.rarity === 'gold';
      G.particles.burst(P.x, P.y, {
        color: gold ? '#ffd166' : '#ffd166',
        count: gold ? 46 : 26,
        speed: gold ? 400 : 300,
      });
      if (gold && G.particles.ring) G.particles.ring(P.x, P.y, '#ffd166', 18, 620);
      G.particles.text(P.x, P.y - 40, def.icon + ' ' + def.name, '#ffe9a8', gold ? 20 : 17);
    }
    if (G.audio && G.audio.levelUp) G.audio.levelUp();
  }

  /* ============================================================
     七、特殊效果
     ============================================================ */
  /**
   * 范围伤害
   * @param {object} [opts] 透传给 enemies.damage / boss.areaDamage
   *        { dot: true } 表示"这笔伤害来自 DOT"，不再叠加 DOT 层数（否则会自我循环）
   */
  function areaDamage(x, y, radius, dmg, depth, opts) {
    const o = { depth: depth, dot: !!(opts && opts.dot), flash: !!(opts && opts.flash) };
    const E = G.enemies;
    if (E) {
      for (let j = E.list.length - 1; j >= 0; j--) {
        const en = E.list[j];
        if (Math.hypot(en.x - x, en.y - y) <= radius + en.r) {
          E.damage(j, dmg, o);
        }
      }
    }
    if (G.boss && G.boss.areaDamage) G.boss.areaDamage(x, y, radius, dmg, opts);
  }

  function chainLightning(x, y, jumps, depth, dmgOverride) {
    const E = G.enemies;
    if (!E || !E.list.length) return;

    const used = [];
    const dmg = dmgOverride == null ? 0.85 * (G.stats.chain || 1) : dmgOverride;
    let cx = x;
    let cy = y;

    for (let k = 0; k < jumps; k++) {
      let best = -1;
      let bestD = Infinity;

      for (let j = 0; j < E.list.length; j++) {
        const en = E.list[j];
        if (used.indexOf(en.uid) !== -1) continue;
        const d = (en.x - cx) * (en.x - cx) + (en.y - cy) * (en.y - cy);
        if (d < bestD) { bestD = d; best = j; }
      }

      if (best < 0 || bestD > 280 * 280) break;

      const en = E.list[best];
      if (G.particles) G.particles.bolt(cx, cy, en.x, en.y, '#9ad8ff');

      used.push(en.uid);
      cx = en.x;
      cy = en.y;
      E.damage(best, dmg, { depth: depth });
    }
  }

  /* ============================================================
     DOT 管线：辐射 / 剧毒 / 燃烧 三种伤害在此完全合流
     ------------------------------------------------------------
     这是与常规子弹**并列**的第二条伤害通道：
       · 伤害只由 S.dot* 决定，不读 bullets 的任何加成
       · 直接扣 hp，不经过 damageMultiplier / hitBonus / execute / berserk
       · 不调用 addHit()，所以不会喂"命中积累"
     ============================================================ */

  /**
   * DOT 的"参考间隔"。跳伤按它计算，而不是按本次实际间隔 ——
   * 否则间隔会被约掉，缩短间隔的增益全部失效（详见 tickDot 注释）。
   */
  const DOT_REF_INTERVAL = 0.5;

  /**
   * 给任意目标叠持续伤害层数（敌机 / Boss 通用）
   * @returns {number} 实际叠上去的层数
   */
  function applyDot(t, stacks) {
    const S = G.stats;
    if (!t || !S || !S.dotActive || !(S.dotPerHit > 0) || !(stacks > 0)) return 0;

    const before = t.dotStacks || 0;
    t.dotStacks = Math.min(S.dotMax, before + stacks);
    t.dotT = S.dotDuration || 4;
    return t.dotStacks - before;
  }

  /**
   * 跳数间隔：衰变链让高层数跳得更快（0.05 秒为硬下限）
   */
  function dotTickInterval(stacks) {
    const S = G.stats || {};
    let iv = S.dotInterval || DOT_REF_INTERVAL;
    if (S.dotChain > 0) iv /= 1 + 0.008 * stacks * S.dotChain;
    return Math.max(0.05, iv);
  }

  /**
   * 通用 DOT 结算：跳数 + 跳伤 + DOT 专属暴击 + 双重 + 临界引爆
   * 敌机和 Boss 共用同一套公式，避免两边数值漂移。
   *
   * ⚠️ 跳伤用**固定参考间隔** DOT_REF_INTERVAL 计算，而不是本次的实际间隔。
   *    如果写成 `层数 × 每层DPS × 实际间隔`，那么
   *        DPS = 跳伤 / 间隔 = 层数 × 每层DPS
   *    间隔会被完全约掉 —— 于是"高频衰变"和"衰变链"这两个增益一点用都没有。
   *    用固定参考间隔后：DPS = 层数 × 每层DPS × (参考间隔 / 实际间隔)，
   *    间隔越短，DPS 越高。
   *
   * @returns {{dead:boolean, dmg:number, crit:boolean, burst:null|{radius:number,dmg:number}}}
   */
  function tickDot(t, dt) {
    const out = { dead: false, dmg: 0, crit: false, burst: null };
    if (!t || !(t.dotStacks > 0)) return out;

    const S = G.stats || {};

    t.dotT -= dt;
    if (t.dotT <= 0) {
      t.dotStacks = 0;
      t.dotTick = 0;
      return out;
    }

    t.dotTick -= dt;
    if (t.dotTick > 0) return out;

    const iv = dotTickInterval(t.dotStacks);
    t.dotTick = iv;

    // 每跳伤害 = 层数 × 每层每秒伤害 × 固定参考间隔
    let tickDmg = t.dotStacks * (S.dotPerStack || 0) * DOT_REF_INTERVAL;

    // DOT 专属暴击：只吃"致命衰变 / 毁伤衰变"，和子弹暴击完全无关
    if (S.dotCritChance > 0 && Math.random() < S.dotCritChance) {
      tickDmg *= (S.dotCritMul || 2);
      out.crit = true;
    }

    // 双重衰变：概率多跳一次
    if (S.dotDouble > 0 && Math.random() < S.dotDouble) {
      tickDmg *= 2;
      out.crit = true;      // 双跳也用高亮飘字，让玩家看得见
    }

    t.hp -= tickDmg;
    out.dmg = tickDmg;
    if (t.hp <= 0) out.dead = true;

    if (G.particles && Math.random() < dt * 26) {
      const rad = t.r || t.radius || 24;
      G.particles.spark(
        t.x + (Math.random() - 0.5) * rad,
        t.y + (Math.random() - 0.5) * rad,
        '#9ae66e'
      );
    }

    // 临界引爆：层数叠满就地炸开，保留一半层数继续衰变
    if (S.dotBurst > 0 && t.dotStacks >= S.dotMax) {
      out.burst = {
        radius: 60 + 22 * S.dotBurst,
        dmg: t.dotStacks * 0.6 * S.dotBurst * (S.dotPerStack || 0) * DOT_REF_INTERVAL * 6,
      };
      t.dotStacks = Math.floor(t.dotStacks / 2);
      t.dotTick = Math.max(0.05, iv);
    }

    return out;
  }

  /**
   * 给指定范围内的敌人叠层（辐射场 / 扩散用）
   * @returns {number} 命中的敌机数
   */
  function igniteAround(x, y, radius, stacks) {
    const E = G.enemies;
    const S = G.stats;
    if (!E || !S || !S.dotActive || !(stacks > 0)) return 0;

    let n = 0;
    for (let j = E.list.length - 1; j >= 0; j--) {
      const en = E.list[j];
      if (!en) continue;
      if (Math.hypot(en.x - x, en.y - y) <= radius + en.r) {
        applyDot(en, stacks);
        n++;
      }
    }
    return n;
  }

  /**
   * 点防系统的清除半径 —— 本体和僚机共用这一处换算，
   * 保证"画出来的指示环"和"实际清掉的范围"永远一致。
   */
  function pointDefRadius(def, isDrone) {
    return isDrone ? 60 + 22 * (def || 0) : 110 + 32 * (def || 0);
  }

  /** 辐射场的覆盖半径（结算与绘制共用，避免画的和算的不一致） */
  function dotFieldRadius(def) {
    return 90 + 32 * (def || 0);
  }

  function clearNearbyBullets(x, y, radius, max) {
    const B = G.bullets;
    if (!B) return 0;

    let n = 0;
    for (let i = B.hostile.length - 1; i >= 0 && n < max; i--) {
      const b = B.hostile[i];
      if (Math.hypot(b.x - x, b.y - y) <= radius) {
        B.hostile.splice(i, 1);
        n++;
        if (G.particles) G.particles.spark(b.x, b.y, '#9ad8ff');
      }
    }
    return n;
  }

  function dropAirdrop() {
    if (!G.powerups || !G.powerups.spawn) return;
    const types = ['spread', 'rapid', 'shield', 'heal'];
    const t = types[(Math.random() * types.length) | 0];
    G.powerups.spawn(t, 50 + Math.random() * Math.max(1, G.W - 100), -20);
    if (G.particles) G.particles.text(G.W / 2, 70, '🪂 空投补给', '#ffd166', 16);
  }

  /* ---------------- 舰队流 · 僚机 ---------------- */

  /**
   * 僚机数值 = 基础值 + (本体数值 − 基础值) × 继承比例
   *
   * 也就是「本体吃到的加成，僚机吃一半」（比例可由数据同步 / 星海舰队拉高）。
   * 弹道数量、射速、弹速、体积、穿透、追踪、暴击……全都按同一套规则继承。
   */
  function droneStats() {
    const S = G.stats;
    const k = S.droneInherit == null ? 0.5 : S.droneInherit;
    const lerp = (base, cur) => base + ((cur == null ? base : cur) - base) * k;

    // 弹道：本体的额外弹道按比例继承，再叠加僚机专属弹道
    // 用 round 而不是 floor：25% 继承下 floor 会让 3 条额外弹道白白归零，
    // 玩家会觉得"僚机完全没继承"，round 让继承可见且曲线更平滑
    const lanes = Math.round((S.extraBullets || 0) * k) + (S.droneBullets || 0);

    return {
      damage: lerp(1, S.damage) * (S.droneDamageMul || 1),
      cdMul: lerp(1, S.fireRateMul) * (S.droneFireMul || 1),
      // 上限保护：20 架僚机各自狂射会把屏幕和帧率一起打爆
      bullets: Math.max(1, Math.min(DRONE_MAX_BULLETS, 1 + lanes)),
      spread: (S.spreadAngle || 0) * k + (S.droneSpread || 0),
      speedMul: lerp(1, S.bulletSpeedMul),
      sizeMul: lerp(1, S.bulletSizeMul),
      pierce: Math.round((S.pierce || 0) * k) + (S.dronePierce || 0),
      homing: (S.droneHoming || 0) + (S.homing || 0) * k,
      // 只有拿了"精英护航"僚机才吃暴击（保持半继承的取舍感）
      critChance: (S.droneCrit || 0) > 0
        ? Math.min(1, (S.critChance || 0) * k + 0.25 * ((S.droneCrit || 1) - 1))
        : 0,
      critMul: S.critMul || 2,
      style: S.bulletStyle || 'normal',
      pointDef: S.dronePointDef || 0,
    };
  }

  function updateDrones(dt) {
    const P = G.player;
    if (!P || !P.alive) return;

    const n = state.drones.length;
    if (!n) return;

    const ds = droneStats();
    const spd = 700 * ds.speedMul;

    // 舰队越大，单架僚机射速略降：否则 20 架一起狂射会把屏幕和帧率一起打爆
    const fleetTax = 1 + DRONE_FLEET_TAX * (n - 1);

    for (let i = 0; i < n; i++) {
      const d = state.drones[i];

      // V 字编队：左右分列，越靠后的僚机越往外、越靠后
      const side = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2);
      const tx = Math.max(14, Math.min(G.W - 14, P.x + side * (44 + tier * 11)));
      const ty = Math.min(G.H - 14, P.y + 16 + tier * 7);

      if (!d.init) { d.x = tx; d.y = ty; d.init = true; }

      const k = Math.min(1, dt * 7);
      d.x += (tx - d.x) * k;
      d.y += (ty - d.y) * k;

      /* ---- 护航点防：僚机自己清掉身边的敌弹 ---- */
      if (ds.pointDef > 0) {
        d.defCd = (d.defCd || 0) - dt;
        if (d.defCd <= 0) {
          d.defCd = Math.max(1.2, 4.5 - 0.9 * ds.pointDef);
          const r = pointDefRadius(ds.pointDef, true);
          clearNearbyBullets(d.x, d.y, r, 1 + ds.pointDef);
          if (G.particles && G.particles.sweep) {
            G.particles.sweep(d.x, d.y, r, '#8fe9ff', 0.32, 1.6);
          }
        }
      }

      /* ---- 开火 ---- */
      d.cd -= dt;
      if (d.cd > 0) continue;
      d.cd = Math.max(0.10, DRONE_BASE_CD * ds.cdMul * fleetTax);

      const B = G.bullets;
      if (!B || !B.spawnPlayer) continue;

      const cnt = ds.bullets;
      const opt = {
        r: 3 * ds.sizeMul,
        damage: ds.damage,
        pierce: ds.pierce,
        homing: ds.homing,
        style: ds.style,
        critChance: ds.critChance,
      };

      for (let b = 0; b < cnt; b++) {
        const off = b - (cnt - 1) / 2;
        const a = -Math.PI / 2 + off * ds.spread;
        B.spawnPlayer(
          d.x + off * 6,
          d.y - 10,
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          opt
        );
      }
    }
  }

  function updateOrbits(dt) {
    const P = G.player;
    const S = G.stats;
    const n = state.orbits.length;
    if (!n || !P || !P.alive) return;

    state.orbitAngle += dt * 2.1;
    const R = 68;
    const dmg = 0.9 * S.damage;
    const hits = [];

    for (let i = 0; i < n; i++) {
      const o = state.orbits[i];
      const a = state.orbitAngle + i * (Math.PI * 2 / n);
      o.x = P.x + Math.cos(a) * R;
      o.y = P.y + Math.sin(a) * R * 0.72;
      o.cd = Math.max(0, (o.cd || 0) - dt);
      if (o.cd > 0) continue;

      const E = G.enemies;
      if (!E) continue;

      for (let j = E.list.length - 1; j >= 0; j--) {
        const en = E.list[j];
        if (hits.indexOf(en.uid) !== -1) continue;
        if (Math.hypot(en.x - o.x, en.y - o.y) <= en.r + 12) {
          o.cd = 0.22;
          hits.push(en.uid);
          if (G.particles) G.particles.spark(o.x, o.y, '#7bffd0');
          E.damage(j, dmg, { depth: 0 });
          break;
        }
      }
    }
  }

  /* ============================================================
     八、对外接口
     ============================================================ */
  G.upgrades = {
    POOL,
    BUILD_NAME,
    state,
    owned,
    GOLD_UNLOCK,
    RARITY_WEIGHT,
    DRONE_CAP,
    DRONE_MAX_BULLETS,
    DRONE_FLEET_TAX,

    lv,
    has(id) { return lv(id) > 0; },
    pending() { return state.pending; },
    request,
    choose,
    recalc,
    syncSummons,
    droneStats,
    buildCount,
    buildAffinity,
    goldUnlocked,
    isMaxed,
    rollOffers,

    reset() {
      for (const k in owned) delete owned[k];
      state.pending = false;
      state.offers = [];
      state.level = 0;
      state.kills = 0;
      state.hits = 0;
      state.combo = 0;
      state.comboT = 0;
      state.revives = 0;
      state.pointDefT = 2;
      state.airdropT = 14;
      state.dotFieldT = 0.6;
      state.drones.length = 0;
      state.orbits.length = 0;
      state.orbitAngle = 0;
      state.alchemy = 0;
      recalc();
      syncSummons();
      if (G.state !== 'upgrade') renderOwned();
    },

    update(dt) {
      const S = G.stats;
      const P = G.player;

      if (state.comboT > 0) {
        state.comboT -= dt;
        if (state.comboT <= 0) state.combo = 0;
      }

      if (S.pointDef > 0 && P && P.alive) {
        state.pointDefT -= dt;
        if (state.pointDefT <= 0) {
          state.pointDefT = Math.max(1.4, 4.4 - 0.8 * S.pointDef);
          const radius = pointDefRadius(S.pointDef, false);
          clearNearbyBullets(P.x, P.y, radius, 2 + S.pointDef);

          // 把"作用范围"画出来：玩家能一眼看到这一下覆盖了多大一圈
          if (G.particles && G.particles.sweep) {
            G.particles.sweep(P.x, P.y, radius, '#9ad8ff', 0.42, 2.5);
          }
        }
      }

      if (S.airdrop > 0) {
        state.airdropT -= dt;
        if (state.airdropT <= 0) {
          state.airdropT = Math.max(8, 20 - 4 * S.airdrop);
          dropAirdrop();
        }
      }

      // 辐射场：机体周围持续给敌人叠层
      if (S.dotField > 0 && P && P.alive) {
        state.dotFieldT -= dt;
        if (state.dotFieldT <= 0) {
          state.dotFieldT = Math.max(0.25, 1.1 - 0.22 * S.dotField);
          igniteAround(P.x, P.y, dotFieldRadius(S.dotField),
            1 + Math.floor(S.dotPerHit * 0.5));
        }
      }

      updateDrones(dt);
      updateOrbits(dt);
    },

    draw() {
      const ctx = G.ctx;

      // 辐射场光环：让玩家看得见自己的辐射覆盖范围
      const S = G.stats;
      const P = G.player;
      if (S && S.dotField > 0 && P && P.alive) {
        const range = dotFieldRadius(S.dotField);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10 + 0.045 * Math.sin(G.time * 3);
        const g = ctx.createRadialGradient(P.x, P.y, range * 0.35, P.x, P.y, range);
        g.addColorStop(0, 'rgba(150,230,90,0)');
        g.addColorStop(0.75, 'rgba(150,230,90,0.35)');
        g.addColorStop(1, 'rgba(190,255,120,0.85)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(P.x, P.y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const d of state.drones) {
        if (d.x === undefined) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.fillStyle = '#8fe9ff';
        ctx.strokeStyle = 'rgba(220,250,255,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (state.orbits.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const o of state.orbits) {
          if (o.x === undefined) continue;
          const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 17);
          g.addColorStop(0, 'rgba(150,255,225,0.9)');
          g.addColorStop(1, 'rgba(60,255,190,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.x, o.y, 17, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#d6fff3';
          ctx.beginPath();
          ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    },

    /* ---------- 供 combat / enemies / powerups 调用 ---------- */

    damageMultiplier(enemy) {
      const S = G.stats;
      let m = 1;

      if (S.execute > 0 && enemy && enemy.maxHp >= 4) {
        m *= 1 + 0.35 * S.execute;
      }
      if (S.berserk > 0) {
        const missing = Math.max(0, (S.maxLives || 3) - G.lives);
        m *= 1 + 0.15 * S.berserk * missing;
      }
      return m;
    },

    scoreMultiplier() {
      const S = G.stats;
      let m = S.scoreMul || 1;
      if (S.combo > 0 && state.combo > 0) {
        m *= 1 + Math.min(state.combo, 60) * 0.01 * S.combo;
      }
      return m;
    },

    onKill(enemy, depth) {
      const S = G.stats;
      depth = depth || 0;

      if (S.vamp > 0) {
        state.kills++;
        const need = Math.max(8, 26 - (S.vamp - 1) * 6);
        if (state.kills >= need) {
          state.kills = 0;
          if (G.heal && G.heal(1) && G.particles && G.player) {
            G.particles.text(G.player.x, G.player.y - 34, '+1 生命', '#ff8fb0', 16);
          }
        }
      }

      if (S.combo > 0) {
        state.combo++;
        state.comboT = 2.5;
      }

      if (depth >= 3) return;

      if (S.explodeOnKill > 0) {
        const radius = 55 + 20 * S.explodeOnKill;
        const dmg = 0.7 * S.explodeOnKill;
        if (G.particles) {
          G.particles.ring(enemy.x, enemy.y, '#ffb03a', 8, 330);
          G.particles.burst(enemy.x, enemy.y, { color: '#ff9a3a', count: 10, speed: 200 });
        }
        areaDamage(enemy.x, enemy.y, radius, dmg, depth + 1);
      }

      if (S.chain > 0) {
        chainLightning(enemy.x, enemy.y, S.chain, depth + 1);
      }
    },

    tryRevive() {
      if (state.revives > 0) {
        state.revives--;
        return true;
      }
      return false;
    },

    /** 每次命中：命中积累 +1；点石成金由 powerups 调用 */
    addHit(n) {
      state.hits += (n || 1);
    },

    /** 当前"命中积累"提供的额外伤害（无上限） */
    hitBonus() {
      const S = G.stats;
      if (!S || !S.hitDamage) return 0;
      return state.hits * S.hitDamage;
    },

    /** 金色：点石成金 —— 拾取道具时累计射速 */
    addAlchemy(n) {
      if (lv('gold_item_alchemy') <= 0) return;
      state.alchemy += (n || 1);
      recalc();
    },

    clearBulletsAround(x, y, radius, max) {
      return clearNearbyBullets(x, y, radius, max);
    },

    blastAround(x, y, radius, dmg, opts) {
      areaDamage(x, y, radius, dmg, 0, opts);
    },

    areaDamage,
    chainLightning,
    igniteAround,
    applyDot,
    tickDot,
    dotTickInterval,
    pointDefRadius,
    dotFieldRadius,
  };

  recalc();
  console.log('[星际突袭] Roquelike 增益系统就绪 · 池子 ' + POOL.length +
    ' 个（含金色品质与流派倾向）');
})();
