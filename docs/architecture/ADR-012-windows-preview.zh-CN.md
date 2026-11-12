# ADR-012：Windows 预览安装包

[English](ADR-012-windows-preview.md) · **简体中文** · [繁體中文](ADR-012-windows-preview.zh-TW.md)

## 问题

仅添加 Windows 工作流无法编译依赖 Mac 的原生入口、私有文件权限、运行时布局与更新器。用户需要 x64 和 ARM64 安装包，Windows 远程构建成功与否不作为 Mac 发布门槛。

## 决定

保持 Mac 发布流程和 IOBluetooth 主线程归属不变。编译时选择固定版本的 Windows SPP 实现，在 Core 认证前启动接收订阅，使用普通 Tokio 线程。唤醒、投递与多 AI 策略仍由共享运行时负责。Windows 通过 Node 采集 CPU，以总量与空闲量计算内存，并采集用户盘根目录。原生 Node 与传输程序随保留源码布局的运行时打包，私有子进程不弹控制台。

Windows vault 在落盘前使用当前用户范围的 DPAPI，加密/解密失败不能降级为明文，使用 MoveFileExW 原子替换。禁止机器范围 DPAPI。设置也通过 Windows vault 加载；Mac 现有文件字节与权限保持不变。系统语言通过 Windows 原生 API 读取。

## 备选方案与兼容性

直接运行 Mac 构建脚本不会生成可用的 Windows 安装包。改写上游或替换运行时会扩大风险。因此使用独立构建脚本和固定版本 Tauri CLI，在原生 x64/ARM64 runner 上生成无证书 NSIS 安装包，包含 Node、依赖声明、校验值与对应源码。手动工作流只有读取权限，仅上传 Artifact，不发布也不阻挡 Mac。Windows 暂不支持 App 内更新；固定项目/下载链接通过系统打开，不插入 shell。没有新增应用云端接口。

## 证据与限制

Mac Node/架构/Rust 套件以及 Windows PE 校验测试覆盖共享行为和架构拒绝逻辑；Windows x64 原生传输层通过跨目标 cargo check。Windows 桌面编译、NSIS 安装、账号 WebView、配对、SPP、电量/充电、通知及持续渲染仍需 runner/实机验证；编译或打包不等于物理验证。Windows Actions 结果由用户自行确认。

## 参考资料

[Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/) · [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) · [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
