# ADR-004：项目级本地 AI Hooks

[English](ADR-004-local-agent-hooks.md) · **简体中文** · [繁體中文](ADR-004-local-agent-hooks.zh-TW.md)

## 问题

原来的 Codex 专用设置缺少新用户项目接入引导，不支持 Claude Code 或自定义 harness，也不能清楚表达并发 AI 工作。

## 决策

保留原三字段回环事件与状态／唤醒策略，在进程边界适配工具，新 provider 在会话哈希前加命名空间，映射为标准事件。仓库 skill 通过安全合并安装器配置已验证项目：Codex 为 `.codex/hooks.json`，Claude Code 为 `.claude/settings.local.json`；明确要求时仍可全局安装。配置存在与真实事件送达分开报告。

安装器保留无关设置，使用私密备份与原子替换，拒绝错误或链接配置，只移除匹配命令。聚合状态统计思考、执行、等待，不导出会话身份。自定义工具必须明确发送生命周期与终止事件，不能根据模型或产品名推断普通桌面聊天支持。

## 替代方案

- 直接 HTTP Hooks 可能转发完整提示词和工具载荷，本地脱敏命令维持隐私。
- 统一全局配置隐藏项目意图与 scope，因此 skill 默认项目级。
- provider 元数据有利于来源标签，但聚合显示不需要；命名空间哈希隔离会话，无需改变协议。

## 兼容

保留 `npm run hooks:install`、`scripts/install_codex_hooks.mjs`、`mac/codex-hook.mjs`、旧 Codex 哈希、地址／header 及事件。客户端和安装器有独立适配测试，核心不导入平台模块。不增加云服务、模型 API 或权限决定。

## 证据

官方 [Codex Hooks](https://learn.chatgpt.com/docs/hooks)说明发现与信任；[Claude Code Hooks](https://code.claude.com/docs/en/hooks)说明配置与生命周期载荷。合成测试覆盖隐私隔离、失败映射、并发聚合、scope、备份合并移除、幂等及 fail-open。工具实际信任和手环显示仍需手动验证。
