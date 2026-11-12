# 安全与隐私

[English](../../SECURITY.md) · **简体中文** · [繁體中文](../zh-TW/SECURITY.md)

## 报告安全漏洞

请使用 GitHub 私密的[报告漏洞表单](https://github.com/JamesGZM/miband-agent-buddy/security/advisories/new)。在协商披露计划前，漏洞详情和验证材料应留在私密报告中。

请提供受影响版本、使用合成数据的最小复现、预期影响与建议修复。不要包含密码、小米 cookies、认证密钥、真实设备标识或他人资料。维护者尽力处理，但不保证响应或修复时限。

普通错误与连接问题请提交到 [Issues](https://github.com/JamesGZM/miband-agent-buddy/issues)，复现信息要求见[支持指南](SUPPORT.md)。报告旧版本问题时说明最新版是否也受影响；是否回移修复逐案决定。

## 本地数据

偏好设置与账号凭据保存在：

```text
~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/
```

目录权限为 `0700`，私密文件为 `0600`。凭据没有保存在 Keychain，也未由本 App 加密；以同一 macOS 用户运行的进程可能读取它们。不要上传或分享这个目录。

退出账号会删除保存的凭据文件和账号设备选择记录，不会撤销其他小米账号会话。设备状态仅在本机使用；桌面状态不包含序列号和 IMEI。

Windows 预览版使用 Tauri 的用户 App 数据目录（`%APPDATA%/io.github.jamesgzm.miband-agent-buddy/`）。设置与认证资料在写入前使用当前用户范围的 Windows DPAPI 保护，不会降级保存为明文；复制文件不能迁移登录。同一 Windows 用户下的程序仍可能请求解密，请勿分享此目录。

## 网络与接入边界

- 账号登录使用小米网页流程。登录窗口不能访问本地应用 IPC，导航和认证重定向限制在小米 HTTPS 域名。
- App 更新来自本项目的 GitHub Releases；替换前验证架构、下载摘要与解压后的应用。
- AI 接入向回环地址发送生命周期事件和派生的会话标识，不转发提示词、工具参数或对话。
- 接收器绑定 `127.0.0.1:10731`，限制请求大小并拒绝浏览器来源写入；它不能隔离同一台 Mac 上的其他进程。
- 凭据通过继承的管道传给本地 worker，不放入命令行或环境变量。原始上游日志已关闭。
- App 不包含分析或遥测服务。

当前安装包使用 ad-hoc 签名，未经 Apple 公证。请从[官方仓库 Releases](https://github.com/JamesGZM/miband-agent-buddy/releases)下载。校验和只能验证下载完整性，不能证明 Apple 公证。

## 安全分享诊断

可分享 App/macOS 版本、手环型号与固件、复现步骤和脱敏错误信息。上传截图前移除账号、蓝牙地址、序列号与私密项目名称。测试与漏洞演示使用合成数据。

不要在公开 Issue 或 PR 中上传应用数据目录、认证文件、原始蓝牙流量及未经脱敏的 AI 对话。
