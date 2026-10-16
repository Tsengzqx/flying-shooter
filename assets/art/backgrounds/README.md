# 深空与 Boss 星球预览

这些图片由游戏实际使用的 `js/background.js` 直接渲染，不是另一套概念稿，也不是网上下载的星球照片。游戏本身通过程序生成背景，因此无需加载这些 PNG，离线单文件版同样可用。

## 看哪张

- `deep-space.png`：普通关卡的深空、银河尘埃与细星群。
- `boss-planets-sheet.png`：六种 Boss 星球对照，上半部战场等比例裁剪。
- `readability-preview.png`：实际背景叠加示例弹幕和玩家三角，用于比较可读性，**不是浏览器实战截图**。
- `planet-*.png`：600×900 的完整背景场景。

| 文件 | Boss | 星球 |
|---|---|---|
| `planet-hive.png` | 钢铁蜂巢 | 金色荒岩星 |
| `planet-reaver.png` | 虚空掠夺者 | 紫色气态星 |
| `planet-dread.png` | 熔核巨舰 | 红橙熔岩星 |
| `planet-arbiter.png` | 深空仲裁者 | 青色冰海星 |
| `planet-endwalker.png` | 终焉之影 | 较小的暗紫霜岩星 |
| `planet-devourer.png` | 噬星者 | 大型橙金带环巨行星 |

Boss 出现与击破时，星球约用 2.6 秒浮现或隐去；换 Boss 交叉淡化，暂停和强化选择时冻结。星球仅为远景，不挡子弹、不参与碰撞。

## 生成与验证

完整仓库中的 `tools/background-preview.js` 使用可选的 `@napi-rs/canvas` 开发后端，重放同一背景代码；`--bundle` 验证单文件版本。此依赖不参与游戏运行。

`render-validation.json` 记录本次纹理覆盖、亮度、缓存和画布状态检查。性能数字仅反映本机原生 Canvas 重放，不代表所有浏览器或手机；首次生成和缓存后耗时分开记录。整合版本另外完成了真实 Edge 检查，截图与报告位于完整仓库的 `artifacts/browser/`；不要把这里的示意图当作实战截图。
