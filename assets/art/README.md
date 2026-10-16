# 星际突袭 · MK.II 美术资源

这是一套为《星际突袭》绘制的俯视科幻战机资源，沿用已确认的蓝白玩家机和琥珀黄冲角机风格：分层装甲、机械接缝、散热结构、传感器、局部能量灯，以及清楚的小尺寸轮廓。

**玩家机、全部小怪、Boss 与精英标识已接入游戏。运行时使用 `runtime/` 精简 PNG，原始高清 PNG/SVG 保留供编辑；宇宙背景由程序生成。碰撞、伤害与 Boss 技能没有改变。**

## 先看预览

- [完整机库](previews/collection-overview.png)：全部机型一览。
- [玩家与全部小怪](previews/enemies-sheet.png)：玩家机、7 种敌机，以及精英叠层示例。
- [六位 Boss](previews/bosses-sheet.png)：更大幅面的旗舰设计。
- [Boss 星球背景](backgrounds/boss-planets-sheet.png)：六种颜色、尺寸与表面材质的星球。
- [深空背景](backgrounds/deep-space.png) / [弹幕可读性示意](backgrounds/readability-preview.png)：直接由实际背景代码输出。

## 资源清单

每个机型都有 **透明 PNG** 和 **可编辑 SVG**。文件名对应游戏内部的机型名称；原图的透明留白会在生成运行副本时归一化，不改变碰撞尺寸。

### 玩家与小怪

| 文件名 | 名称 | 外观重点 |
|---|---|---|
| `player/player` | 玩家截击机 | 已确认的 MK.II 蓝白机体、离子核心与双联炮 |
| `enemies/scout` | 侦察机 | 橙色轻型轮廓与侦察传感器 |
| `enemies/zigzag` | 游走机 | 紫色机动结构与侧向推进器 |
| `enemies/gunship` | 炮艇 | 红色宽体重装甲与多炮组 |
| `enemies/diver` | 冲角机 | 已确认的 MK.II 琥珀黄机体、俯冲矛尖与光学锁定器 |
| `enemies/weaver` | 织网者 | 青色横向发射阵列 |
| `enemies/splitter` | 分裂体 | 绿色双核心与可分离机舱 |
| `enemies/escort` | 护卫舰 | 粉紫重装护卫舰体与双段火力结构 |

### Boss

| 文件名 | 名称 | 外观重点 |
|---|---|---|
| `bosses/hive` | 钢铁蜂巢 | 金色蜂巢母舰与发射机库 |
| `bosses/reaver` | 虚空掠夺者 | 紫色镰翼与跃迁结构 |
| `bosses/dread` | 熔核巨舰 | 红橙装甲城塞、重炮与熔核散热 |
| `bosses/arbiter` | 深空仲裁者 | 青色双机械圆环与中央菱形核心 |
| `bosses/endwalker` | 终焉之影 | 暗紫幽灵翼、虚空空腔与隐形阵列 |
| `bosses/devourer` | 噬星者 | 橙金重甲与齿状吞噬核心 |

### 精英标识

`effects/elite-overlay.png` / `.svg` 是独立的金色机械环与星标，不包含机身。可以与任意小怪叠放，避免为每种精英再保存一张重复机体。预览中的精英侦察机只是组合示范。

## 图片规格与使用提醒

- 玩家、小怪和精英标识：**1024 × 1024**。
- Boss：**1536 × 1536**。
- 舰船与精英标识 PNG 为透明背景，不含星空、卡片、名称或预览页装饰；背景场景 PNG 则为完整画面。
- SVG 是原始矢量资源，无联网依赖、无脚本、无外部字体文件或素材引用；微型机身标识使用系统字体，跨平台字体可能略有不同，PNG 的外观已经固定。
- 玩家朝上；一般敌机朝下；圆环型 Boss 按径向结构设计。
- 图片四周有透明留白。**图片尺寸不是碰撞范围**，接入时应保留现有游戏判定，并单独调节显示比例。
- 高清 Boss 图为基础外观，不是三阶段动画帧；游戏叠加阶段颜色、受损与击破效果，保留隐身。仲裁者双环和噬星者吞噬口使用独立 PNG 图层旋转。
- 图片未就绪或损坏时自动回退原 Canvas 机体，不阻塞游戏；单文件版内联全部运行 PNG，支持离线。
- 未使用下载的飞机素材；微型编号为装饰设计，不代表真实产品或品牌。资源适合继续改色、拆层和制作动画。

## 文件组织

```text
assets/art/
  player/       玩家 PNG / SVG
  enemies/      7 种敌机 PNG / SVG
  bosses/       6 位 Boss PNG / SVG
  effects/      精英标识 PNG / SVG
  previews/     3 张舰船预览图
  backgrounds/  深空、六种Boss星球、对照预览及真实像素验证报告
  runtime/      21张运行PNG：256px小机体/精英、512px Boss及旋转图层
  manifest.json 机型对应、分辨率、朝向、透明范围与图片校验值
  validation.json 本次资源完整性检查结果
  _source/      批量绘图及图片导出工具，不参与游戏运行
```

## 重新导出（只在需要编辑素材时使用）

SVG 可以直接用矢量编辑器修改。`_source/generate-enemies.js` 和 `_source/generate-bosses.js` 可重新生成对应的新机型；重新运行会覆盖这些 SVG，手工编辑后请先备份。玩家与冲角机以已确认的 SVG 为源文件。

透明 PNG、图鉴预览和清单由 `_source/render-assets.js` 统一生成。它需要 Node.js 和 `@resvg/resvg-js`，**这些只是素材工具，不是游戏依赖**。

可以把渲染工具安装到项目外的临时目录，随后在项目根目录执行（PowerShell）：

```powershell
$renderer = Join-Path $env:TEMP 'starstrike-svg-renderer'
npm install --prefix $renderer --ignore-scripts --no-audit --no-fund @resvg/resvg-js
$env:ART_RENDER_MODULE = Join-Path $renderer 'node_modules/@resvg/resvg-js'
node assets/art/_source/render-assets.js
# 在完整仓库中生成裁剪后的运行贴图（只改runtime，不改原图）
node tools/prepare-art.js
# 图片改动后重新构建离线单文件与源码包
node tools/build.js
```

渲染器会对照当前 `js/enemies.js` 和 `js/boss.js` 检查所有机型是否有资源，同时检查 SVG 能否解析、输出尺寸、透明背景、留白边界及非空图片。预览中的中文依赖本机可用中文字体。
