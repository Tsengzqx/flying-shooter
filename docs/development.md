# 开发与数值说明

这份文档面向修改代码、验证平衡或打包发布的人。玩家入门请看 [README](../README.md)，历次修复见 [更新日志](../CHANGELOG.md)。

> 以下命令在**完整仓库的根目录**运行。用于分享游戏的源码压缩包不包含 `tools/` 开发工具；需要开发或测试时，请获取完整仓库。

## 运行与打包

游戏由原生 HTML、CSS、JavaScript 和 Canvas 构成，没有运行时第三方依赖。直接打开 `index.html` 即可运行；开发工具需要 Node.js，CI 使用 Node 20。

```sh
node tools/build.js
node tools/build.js --keep-comments
```

构建会生成：

- `dist/星际突袭.html`：内联样式、脚本和21张运行PNG的单文件游戏。
- `dist/flying-shooter-source.zip`：可解压运行的游戏源码、文档和 `assets/art/runtime/`，不含开发工具或高清美术源图。

默认去除部分注释、保留换行，并检查脚本语法、外部引用和 ZIP 完整性。`--keep-comments` 保留注释，便于调试。修改代码或文档后，需要重新打包才能同步分享包。

## 模块分工

模块统一挂在 `window.Game` 上，入口和加载顺序见 `index.html`。

| 文件 | 职责 |
|---|---|
| `js/main.js` | 画布适配、主循环、状态切换、基础属性、HUD、战绩保存 |
| `js/background.js` | 程序深空、六种Boss星球、渐入渐出及离屏纹理缓存 |
| `js/art.js` | PNG一次性加载/解码、失败回退、机体及旋转图层绘制 |
| `js/input.js` / `js/audio.js` | 键盘与指针输入、合成音效 |
| `js/player.js` / `js/bullets.js` | 玩家移动与自动射击、子弹更新及绘制 |
| `js/enemies.js` / `js/boss.js` | 敌机、波次、Boss 阶段和技能 |
| `js/combat.js` | 路径碰撞、伤害结算、伤害数字和秒伤统计 |
| `js/progress.js` | 经验、等级、升级奖励和待选强化 |
| `js/upgrades.js` | 增益池、抽取、属性计算、召唤物与 DOT |
| `js/powerups.js` / `js/particles.js` | 道具掉落与拾取、装饰粒子 |
| `js/panel.js` / `js/codex.js` | 战斗数值面板、游戏内图鉴 |
| `css/style.css` | 菜单、HUD、强化卡片与布局 |

增益由 `upgrades.recalc()` 汇总到 `Game.stats`，战斗模块读取属性。改动新机制时，应同步卡面、图鉴、测试和必要的玩家说明。

## 验证

### 冒烟测试

在 Node VM 中加载游戏，用 DOM、Canvas 和 WebAudio 桩驱动游戏逻辑。覆盖增益、碰撞、状态切换、绘制约束和已修复问题；断言数量以最后的 `RESULT` 为准。

```sh
# bash：固定种子，便于复现
SMOKE_SEED=123 node tools/smoke-test.js

# 验证单文件版
SMOKE_BUNDLE='dist/星际突袭.html' SMOKE_SEED=123 node tools/smoke-test.js
```

PowerShell：

```powershell
$env:SMOKE_SEED='123'
node tools/smoke-test.js
$env:SMOKE_BUNDLE='dist/星际突袭.html'
node tools/smoke-test.js
Remove-Item Env:SMOKE_BUNDLE
```

### 随机稳定性测试

```sh
node tools/fuzz.js 20261006 15 1800
node tools/chaos.js 424242 120
```

- `fuzz.js`：种子、轮数、每轮帧数；随机构筑与输入，检查异常值、崩溃和对象数量。
- `chaos.js`：种子、轮数；随机暂停、重开、死亡、升级、拾取与开关图鉴，检查生命周期。
- 两者支持 `--json`。设置 `SMOKE_BUNDLE` 时也可以验证单文件版。

### DOT 平衡基准

```sh
node tools/dot-probe.js
```

固定种子，只使用合法增益层数。对照第 10、30、60、100 关 Boss 的新旧 DOT 输出，检查前期弹幕定位、百分比预算、子弹独立性和点火前置；断言失败时返回非零退出码。

**这是固定命中基准，不是完整实战模拟。** Boss 测量固定每秒 10 次有效叠层，从零层起步，只计 DOT 与引爆，不计子弹直伤、走位、护卫和过载；每关配置对应的历史 Boss 击破奖励。基线仅关闭新增高层倍率与侵蚀，其余使用相同实现。

| Boss | 辐射投入 | 基线耗时 | 强化后耗时 |
|---|---:|---:|---:|
| 10 | 8 层增益 | 42.42 秒 | 42.42 秒 |
| 30 | 24 层增益 | 23.57 秒 | 15.04 秒 |
| 60 | 满配 60 层增益 | 78.26 秒 | 12.27 秒 |
| 100 | 满配 60 层增益 | 超过 600 秒 | 45.87 秒 |

上表是当前固定配置的参考输出，不是实战承诺。前期同为 8 点投入、8 秒全命中基准中，弹幕构筑约 165.4 DPS，DOT 构筑约 30.5 DPS。

CI 配置见 [tests.yml](../.github/workflows/tests.yml)。纯 Node 桩验证不能替代真实浏览器中的画面、触屏、音频和性能检查。旧 `tools/boss-gallery.html` 未加载图片模块，只用于检查 Canvas 回退造型，不作为新 PNG 的验收截图。

## 宇宙背景与视觉验证

`js/background.js` 独立维护星空与 Boss 星球，只读取 Boss 的 `def.id` 和存活状态。`main.js` 接入 `resize/update/draw/reset`，始终先画背景，再画战斗对象。无需加载 `assets/` 图片，因此单文件版和离线运行不增加联网依赖。

- 使用独立种子与整数噪声，不消费战斗的 `Math.random()`。
- 六个配置在 `background.defs`，控制材质、布局、半径与最大视觉强度；`layout()` 按屏幕短边缩放。
- 淡入淡出 2.6 秒，换 Boss 保留旧星球淡出；暂停和强化冻结；返回菜单/重开立即清理。
- 纹理最多为一张 320×384 星空和六张 512×512 星球，RGBA 像素约 6.5 MiB；不含浏览器额外开销。首次使用生成，窗口变化/重开不重新生成。
- 未提供像素 API 的测试桩使用低成本渐变降级。普通冒烟测试覆盖生命周期；**不能仅靠桩测试宣称球面纹理已验证**。

真实像素预览使用可选的 `@napi-rs/canvas`，只作为开发工具安装到项目外的临时目录：

```powershell
$renderer = Join-Path $env:TEMP 'starstrike-canvas-renderer'
npm install --prefix $renderer --ignore-scripts --no-audit --no-fund @napi-rs/canvas
$env:CANVAS_RENDER_MODULE = Join-Path $renderer 'node_modules/@napi-rs/canvas'
node tools/background-preview.js
node tools/background-preview.js --bundle
```

工具执行与游戏完全相同的背景代码，输出 `assets/art/backgrounds/` 中的六种场景、总览、弹幕可读性示意与检查报告。`--bundle` 从当前单文件版提取背景模块再验证。检查实际像素纹理、背景亮度、缓存复用、透明混合、Canvas 状态恢复与横竖屏布局。

这里的耗时是本机原生 Canvas 重放测量，不是浏览器/手机帧率承诺；首次纹理生成与缓存后单帧耗时应分开看。预览里的弹幕/玩家三角是明确标注的示意，不是实际通关截图。发布前仍应做浏览器和触屏实玩。

## 舰船图片与真实浏览器验证

`js/art.js` 在实体模块之前加载，异步解码21张本地PNG。`Game.art.ready` 在全部完成或失败时返回状态；游戏不等待图片才能开始，损坏/缺失/超时均回退原Canvas机体。使用运行副本不改变碰撞半径或战斗规则，保留护盾、DOT、精英标识、Boss隐身、阶段与击破提示。

运行纹理在 `assets/art/runtime/`：玩家/敌机/精英为256²，Boss为512²；仲裁者双环与噬星者吞噬口拆为独立旋转层。`tools/prepare-art.js` 从高清SVG与透明范围生成统一留白的运行副本，不改原图。按 `assets/art/README.md` 的导出说明，设置 `ART_RENDER_MODULE` 指向项目外的 resvg 开发依赖。修改SVG后依次重导出原图/清单、运行副本，再重新构建游戏。

`tools/build.js` 将 `ART_SOURCES_BEGIN/END` 内的资源表替换为PNG data URL，并把运行图片加入源码ZIP。不要手工修改单文件内的资源表。

```sh
node tools/art-test.js
node tools/build.js
```

真实浏览器自动化使用独立的 Edge 临时配置，通过 CDP 控制真实按键和触摸输入；不会使用个人浏览器配置。需要可选的 `playwright-core`，运行结束关闭浏览器和临时本地服务器。

```powershell
$deps = Join-Path $env:TEMP 'starstrike-browser'
npm install --prefix $deps --ignore-scripts --no-audit --no-fund playwright-core
# 如执行环境提权后TEMP会改变，保留下面解析后的绝对路径。
$env:BROWSER_TEST_MODULE = Join-Path $deps 'node_modules/playwright-core'
node tools/browser-check.js
```

默认 `EDGE_PATH` 是 Windows Edge 安装位置，可用环境变量覆盖。系统沙箱如果拒绝启动浏览器进程，需要批准相应进程权限，不是关闭游戏的安全设置。

最新真实 Edge 检查已通过：普通开局移动与射击、全部敌机、六Boss与阶段、隐身/旋转层、背景渐变、暂停/死亡/重开、390×844 DPR2触控模拟与横屏、故意图片失败回退，以及断网 `file://` 单文件加载。截图和机器报告在 `artifacts/browser/`。

**范围说明：**使用真实浏览器的无头模式；后期Boss通过调试召唤覆盖，不是自然打满60关。触控是浏览器模拟，不是真机硬件测试；不包含人工音效试听。最终仍可根据实际设备反馈继续调整。

## DOT 数值与约束

持续伤害必须由「辐射源」激活；燃烧、剧毒和辐射共用目标的 `dotStacks`。普通跳伤不读取子弹伤害、子弹暴击或命中积累，也不调用 `addHit()`。

### 平伤通道

```text
每层基础伤害 = 0.32 × 辐射源等级
             × (1 + 0.25 × 衰变强化)
             × (1 + 0.20 × 燃烧弹)
             × (1 + 0.18 × 剧毒弹)
             × 熔毁协议倍率 × 奇点衰变倍率 × 击破奖励
层数上限 = (15 + 6 × 辐射源 + 10 × 临界质量 + 4 × 燃烧弹)
         × 熔毁协议层数倍率
高层反应 = 1 + (max(0, 当前层数 − 30) / 50)^1.4
每跳平伤 = 当前层数 × 每层基础伤害 × 0.5 × 高层反应
实际间隔 = max(0.05, 属性跳数间隔 / (1 + 0.008 × 当前层数 × 衰变链))
```

- 熔毁协议：平伤 ×1.5、层数上限 ×2、属性跳数间隔 ×0.7；未持有时倍率为 1。
- 奇点衰变：平伤 ×3；击破奖励为 `2^本局已击破Boss数`。
- 属性跳数间隔由 `0.5 × 0.88^高频衰变` 计算，再应用熔毁倍率及下限。
- DOT 专属暴击和双重衰变在平伤上结算；临界引爆也获得高层反应倍率。
- **参考间隔固定为 0.5 秒**，不能把每跳伤害改为乘实际间隔，否则提高跳频不再提升 DPS。

### Boss 侵蚀通道

解锁要求：辐射源至少 3 级，辐射流增益累计至少 12 层。

```text
侵蚀上限 = min(0.025,
  0.0008 × 辐射源等级
  × (1 + 0.25 × 衰变强化)
  × (1 + 0.12 × 临界质量)
  × 熔毁侵蚀倍率 × 奇点侵蚀倍率)
关卡系数 = clamp((Boss关卡 − 10) / 30, 0, 1)
层数饱和度 = min(1, 当前层数 / 100)^2
成熟度 = 连续高层挂毒时间 / 8秒，最多为1
侵蚀每秒伤害 = Boss最大生命 × 侵蚀上限 × 关卡系数 × 饱和度 × 成熟度
```

- 熔毁侵蚀倍率为 1.2，奇点侵蚀倍率为 1.35；未持有时为 1。合法满配上限为 2.3976%/秒。
- 仅真实 Boss 对象可获得侵蚀；至少 40 层才开始积累成熟度。低于 40 层重置，DOT 过期时层数、成熟度和未释放预算全部清空。
- 每帧按游戏时间积累预算，在跳伤时单独释放。**不再吃暴击、双跳、跳频、击破奖励或子弹增伤**，不复制到引爆、溅射和传播。
- `tickDot()` 的 `flatDmg` 和 `erosion` 分开报告，两者之和计入 `dmg`。不同帧率和跳频下应维持百分比预算一致。

## 其它实现注意事项

- **碰撞**：高速弹按首次接触顺序处理路径上的目标。范围伤害可能递归移除敌机，因此先快照对象、结算前重查存活状态与位置。
- **子弹回收**：先结算越界前的路径碰撞，再删除越界子弹。
- **升级**：连续升级逐级发放奖励；飞升直接授予 3 级，不经经验倍率。改变经验需求后立即刷新门槛，结算避免重入。
- **低光视觉**：拖尾普通上限 40 像素、低光 24 像素；超过 120 发、射击间隔 ≤0.09 秒或弹速 >1800 时，本局保持低光，重开恢复。不要通过削弱弹速或伤害来减少特效。
- **Boss 成长**：血量曲线、机型倍率与轮回倍率见 `boss.start()`；每 10 关的台阶倍率与 `enemies.tierMul()` 共用。
- **过载**：Boss 战 600 秒后每秒损失 2% 最大生命，是保底机制；不能计入玩家秒伤或用于证明某流派的输出提升。

## 调参入口

| 位置 | 调整内容 |
|---|---|
| `progress.xpFor()` | 升级经验曲线 |
| `enemies.js` 的 `TYPES`、`hpScale()`、`waveCount()`、`pickType()` | 敌机属性、血量、数量、出现关卡 |
| `enemies.js` 的 `EASY_UNTIL`、`ELITE_FROM`、`spawn()` | 简单期、精英解锁、冲角机速度和蓄力 |
| `boss.js` 的 `ROSTER`、`start()`、`fireKernel()` | Boss 特性、成长和弹幕 |
| `upgrades.js` 的 `POOL`、`recalc()` | 强化文案、上限与属性计算 |
| `upgrades.js` 的 `RARITY_WEIGHT`、`GOLD_UNLOCK`、`buildAffinity()` | 品质、金色门槛与流派倾向 |
| `upgrades.js` 的 `droneStats()`、`DRONE_*` | 僚机继承、数量、射速和弹道限制 |
| `upgrades.js` 的 `applyDot()`、`tickDot()`、`dotStackMultiplier()`、`dotBossRate()` | DOT 叠层、跳伤、高层反应和侵蚀 |
| `powerups.js` 的 `DROP_BASE` | 基础掉落概率 |
| `player.js` 的 `BASE_CD`、`effectiveCd()`、`shootVolley()` | 本体射速和弹道 |
| `panel.js` 的布局参数 | 战斗面板位置与自适应 |

## 部署

项目是静态页面，仓库里的 `netlify.toml` 用于 Netlify 部署配置。本地修改文件不会自动更新线上站点；需要发布相应提交或重新部署。
