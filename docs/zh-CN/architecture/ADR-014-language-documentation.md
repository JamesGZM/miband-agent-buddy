# ADR-014: 按语言组织文档

[English](../../en/architecture/ADR-014-language-documentation.md) · **简体中文** · [繁體中文](../../zh-TW/architecture/ADR-014-language-documentation.md)

## 问题

同级翻译让根目录拥挤，各指南目录也混杂三种语言。

## 决定

根目录仅保留 README.md；其他语言主页放 docs/readme。指南在 docs/en、docs/zh-CN、docs/zh-TW 使用一致路径，各有用户与开发者入口。图片和原始许可证共享；英文项目政策、更新记录、第三方声明保留 GitHub 与打包所需的根入口。现行架构为 docs/en/architecture/README.md 及对应翻译。只保留既有英文架构转接页，更新项目内链接。

## 替代方案

删除翻译会降低可访问性；只移动 README 无法整理指南；为每个旧翻译路径保留转接会重现拥挤。

## 兼容性

用户明确授权文件搬移，旧语言 README 和已搬移指南 URL 不再有文件。docs/architecture/README.md、docs/ARCHITECTURE.md、docs/open-source/ARCHITECTURE.md 仍指向现行架构。运行逻辑、npm 命令、许可证数据和可执行技能入口不变。

## 证据

文档契约检查根目录唯一 README、语言切换、当前语言导航、Markdown/HTML 图片链接、锚点和相同可执行示例。展示图使用实际前端与共享几何，数据为示例，不是设备实拍。
