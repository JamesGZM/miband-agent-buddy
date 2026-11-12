# ADR-001：明确边界，保留现有技术栈

[English](../../en/architecture/ADR-001-project-boundaries.md) · **简体中文** · [繁體中文](../../zh-TW/architecture/ADR-001-project-boundaries.md)

日期：2026-11-10 Asia/Singapore。状态：用户重构计划已接受。

## 问题

原型混合已退役和受支持源码，桌面／运行时生命周期集中在入口，测试与构建耦合源码位置；集成测试通过替换源码改变依赖与时间。

## 决策

保留 Tauri + Node + Rust SPP + Vela，明确 apps／services／native／shared 边界。入口只负责组合，IPC 类型化并校验，共享模块为纯 ES5，运行时与控制器注入依赖，CI 增加小型边界检查。保留兼容入口、存储格式与协议。

## 参考与采用思路

以下为 2026-11-10 阅读的主要源码，仅参考设计，不复制实现。

- [Yaak platform](https://github.com/mountain-loop/yaak/tree/main/packages/platform/src)及[开发指南](https://github.com/mountain-loop/yaak/blob/main/DEVELOPMENT.md)，main：隔离系统访问，明确 Node sidecar 边界；不采用其 gRPC、插件和多包工作区。
- [Clash Verge Rev commands](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/cmd/mod.rs)，blob `1bb2d30411f9ea55bb79c097ffb890d272198107`，及[入口](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/main.rs)，blob `eb0af31951e108fc3b03ca6df45f8c3c4c275190`：分离原生组装、命令与进程操作；不采用其全局服务及运行时调优。
- [GitButler 开发规则](https://github.com/gitbutlerapp/gitbutler/blob/master/AGENTS.md)，blob `996c996250a22ef567bd8a543cdbac18e15479f1`：版本化目录职责、聚焦改动与验证要求；本项目不需要同等构建编排。

## 替代方案与影响

纯 Rust 后端可减少语言与进程，但需重写已验证的采样、Hooks、唤醒。只移动目录无法消除生命周期耦合，通用设备／AI 插件系统无当前需求，均暂不采用。

生成包装增加准备步骤，但保留单一共享源码且不引入 bundler。协议保留可加字段，持久化账号保留原 token 类型；明确批准安装迁移前保留兼容入口。采样工具不承担传输策略。

验证保留原案例，补充假时钟协调、生命周期清理、IPC 一致、兼容及负面架构测试，执行两种构建；物理测试证据单独记录。
