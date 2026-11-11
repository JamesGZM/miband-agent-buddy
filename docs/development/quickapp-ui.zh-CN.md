# 快应用界面开发

[English](quickapp-ui.md) · **简体中文** · [繁體中文](quickapp-ui.zh-TW.md)

Buddy 手环界面应尽可能使用代码绘制。更换绘制方式时，保留已确认的角色、胶囊外框、资源布局和交互。绘图原型用于验证设备能力，不代表另做一套产品设计。相关边界见[开发指南](README.zh-CN.md)、[架构](../architecture/README.zh-CN.md)与[绘制决策](../architecture/ADR-008-animation-and-task-rings.zh-CN.md)。

## 代码与图片原则

现有界面使用原生 `div`、`text` 和弧形 `progress`，与桌面预览共享几何和动画计算。这些组件已经过目标手环实测；不要假定 Vela 支持浏览器 Canvas API。能力查询 API 缺失表示支持情况未知，不等于组件不受支持。

| 资源 | 项目规则 |
| --- | --- |
| 角色、外框、资源环和动画 | 使用代码生成几何，不恢复 PNG 逐帧动画或整屏界面图片。 |
| 手环应用入口图标 | 保留必需的 `common/icon.png`，由已确认的母图生成，与内页绘制分开。 |
| 桌面主题缩略图 | 三张生成的缩略图仅供 Mac 使用，不进入手环 RPK。 |
| 后续确有位图需求 | 说明原生绘制不适合的原因，控制尺寸和数量，测量包体、解码后内存及实机表现。 |

当前构建会检查 RPK，仅允许入口图标这一张图片。若确需改变资源原则，必须同时更新检查与文档。压缩文件小不代表解码内存及缓存开销小；代码绘制也有成本，节点、观察器或逐帧分配过多同样可能卡顿。性能收益需要用实际负载比较。

## 源码职责

| 源文件 | 修改内容 |
| --- | --- |
| `packages/buddy-shared/presentation/geometry.js` | 统一的 490×192 布局、角色、胶囊路径及原生 192×490 坐标投影；保持纯 ES5 CommonJS。 |
| `packages/buddy-shared/presentation/native-ui.js` | 共享动画时间与有效帧率策略。 |
| `apps/band/src/controllers/page-controller.js` | 注入平台 API、更新观察数据，以及页面和定时器生命周期。 |
| `apps/band/src/pages/index/index.ux` | 原生模板、样式和文字布局。 |
| `apps/desktop/ui/preview.js` | 使用相同原生几何与时间的 Canvas 预览。 |
| `scripts/prepare_shared.py` | 从统一共享模块生成 Vela／浏览器适配文件。 |
| `scripts/render_band_ui.py` | 三张桌面缩略图及已知废弃帧目录的清理。 |
| `scripts/prepare_band_icon.py` | 从 `apps/desktop/artwork/app-icon.png` 生成入口图标。 |

修改源文件和生成器后重新构建，不手改暂存的应用副本或生成资源。废弃资源由对应生成器清理，不顺手删除其他本地文件。

## 动画与重绘开销

多 AI 状态计算属于 Mac：聚合会话、选择优先级／模式并编译有序配色后再发送快照。支持的新手环收到 `activityRing`，不接收聚合输入，只应用方案并播放本地动画。兼容旧主机时每次快照转换一次计数，不逐帧转换；保留本地断线回退和亮屏看门狗（[ADR-009](../architecture/ADR-009-host-activity-display.zh-CN.md)）。

- 保持观察数组和图形 ID 稳定，仅原地更新变化字段；缓存不变的角色几何，通过单个数值偏移移动整组，避免每帧重建所有绑定对象。与 UI 无关的数据不要放进观察模型，参考官方[内存优化](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html)。
- 每个绘制器只缓存当前任务配色布局和最多 33 行小型色阶数据；任务数、主题或状态变化时使缓存失效。移动高光的每段复用固定的矩形／圆弧节点。绘制耗时计入帧预算，不在绘制后再等待完整间隔。这些措施减少重复计算和组件增删，保留 loading 效果，也不通过蓝牙逐帧传图；实机流畅度仍需测量。
- 控制组件数量、嵌套和动态样式，参考官方[业务优化](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html)。资源显示值不变时跳过几何更新；页面隐藏时停止动画，销毁时取消所属定时器和监听器。
- 固定背景和填充的层级。Vela [stack](https://iot.mi.com/vela/quickapp/zh/components/container/stack.html) 的后置直接子组件覆盖前面的组件；底轨应放在固定背景容器，避免动态子节点盖住进度线。
- 保留先投影到原生坐标、再绑定图形的实现。实机出现 CPU 弧线累积缺口后，已移除图形父容器旋转。直线／曲线接点与运动端点都要实测，几何单元测试不能证明固件重绘正确。

已采用的内存优化：诊断计数与资源插值状态保留在控制器闭包，不放入响应式页面模型。只有常量资源标签使用 `static`，数值、图形和颜色仍保持动态。颜色缓存直接比较有界列表，不逐帧拼接字符串键。亮度接口只在前台切换或设置变化时调用，不进入动画计时器。不要定时执行 `runGC`：官方内存文档明确指出频繁 GC 会造成卡顿。

`buddyFps` 为 10–30 的整数，默认 10，使用数字输入框，通过保存或 Enter 提交。省电模式固定有效帧率为 10，并保留原选择。桌面预览使用相同几何与有效帧率，以新鲜 ACK 时间对齐动画阶段。预览是场景重建，不是手环截图；字体与栅格化差异仍需目测对比。

设置值及 ACK 的 `drawing.effectiveFps` 仅表示调度目标，JavaScript 帧计数也不等于面板实际刷新帧率。持续运行上限及耗电尚未测量，30 FPS 是测试目标，不是性能保证。

## 构建与实机验证

在仓库根目录构建手环资源，运行相关几何、控制器和预览测试，再执行公共检查：

```sh
npm run build
node --test tests/band/code-probe.test.mjs tests/band/native-ui.test.mjs tests/contracts/preview-animation.test.mjs
npm test
npm run check:architecture
```

预览或随包 RPK 改变后重新构建桌面包；本地测试版本见[开发指南](README.zh-CN.md)。构建不代表安装或发布。修改资源生成方式时，记录 RPK 字节数和图片清单。

实机需检查两页、所有主题／活动状态、跨越直线与曲线接点的资源值、连续百分比变化、隐藏／返回与重复前台启动。验证省电及帧率选择恢复，再分别观察持续任务和任务结束后的熄屏延迟。记录型号、固件、时长与物理结果；传输成功或 ACK 不能证明绘制、稳定性或亮屏。

在 Smart Band 9 NFC 固件 3.1.32 上，用户报告本地 code.3 卡死并重启；该版以 30 Hz 替换观察数组，观察器／渲染压力是排查假设，尚无崩溃证据证明根因。改为原地更新、固定层级及原生坐标绘制后，用户在 code.8 的短时检查中确认方向正常、CPU 弧线缺口未再出现。这不代表长期稳定、帧率上限已测得，或原来的偶发熄屏／断线已解决。验证范围见[测试与限制](../testing.zh-CN.md)。
