# 真实浏览器验证

由 `tools/browser-check.js` 驱动实际 Microsoft Edge（Chromium，无头模式）完成，不是 Canvas 桩或另画的概念图。

## 截图范围

- `01-normal-play.png`：点击开局、方向键移动后的普通战斗。
- `02-enemy-formation.png`：调试生成的全部敌机队形，检查各PNG、精英标识、血条与DOT；不是自然关卡队形。
- `boss-*.png`：调试召唤对应Boss后等待实际入场、射击与星球渐显。六Boss均检查第三阶段；终焉之影额外有隐身图。
- `03-mobile-boss.png`：390×844、DPR2的触控浏览器模拟。
- `04-landscape-boss.png`：同一场战斗切换横屏。
- `05-image-failure-fallback.png`：故意阻止所有PNG请求，旧Canvas机体仍能正常运行。
- `06-offline-single-file.png`：断网浏览器通过本地文件打开打包HTML，所有21张PNG由内联数据解码。

`report.json` 记录浏览器版本、检查项、资源加载和实际绘制次数。仲裁者/噬星者正常使用拆分图层，因此对应整张备选PNG的绘制次数为0属于正常情况。

## 边界

覆盖普通开局与调试的后期场景，**不是自然连续通关60关**。触控为浏览器输入模拟，不是真手机硬件验收；无人工声音试听。测试使用独立临时Edge配置，结束后关闭测试浏览器和临时本地服务器，不修改个人浏览器配置。
