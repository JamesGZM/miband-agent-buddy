# 依賴許可證補充記錄

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

`scripts/collect_licenses.py` 讀取所選構建目標鎖定的 Cargo 元數據，從桌面和傳輸包沿普通依賴關係收集 LICENSE、LICENCE、COPYING、COPYRIGHT、NOTICE（包括嵌套聲明），記錄版本、聲明許可證、作者與儲存庫。僅用於構建的工具不進入分發清單。

部分 crate 發佈包遺漏儲存庫根目錄許可證。`receipts.json` 將補充文件限制為準確版本、聲明許可證及 `.cargo_vcs_info.json` 提交；每份文件都有 SHA-256，`sources.json` 還記錄上游 Git blob。構建時不下載許可證。升級依賴如需新補充，必須先審閱記錄，否則構建失敗。

pbjson、alloc-stdlib、crc-catalog 來自 receipts 指定的準確上游提交。五個 objc2 提交的許可證聲明相同，Git blob 為 `540ae4c81adb5f64a9f61e222b688880da24300e`：`d7d2fa23ceaa5e6096c923b081040e5d81b3b9df`、`b4167b582b2f75f9a1be75495c41b765344fd03c`、`8852b424193ca41602281b3d7540d7c8ed51e49a`、`7b1abfd750a2cacaea71d6a56ecfb83cb7de560b`、`8d214f5477365ffcbcbb7de058c86ed9a518efb7`。

鎖定的 objc2 聲明連結到標準條款；dispatch 在 Cargo 元數據聲明 MIT，但沒有獨立許可文件。這些包包含完整發佈原始碼、原作者元數據和未修改的 SPDX MIT 模板。模板佔位符不聲稱版權持有人身份，也不虛構版權聲明。selectors 包包含原 MPL 文件頭、完整原始碼及標準 MPL-2.0 條款。本地適配的上游 crate 同樣附帶原始碼，排除 Git 元數據和構建產物。

生成內容在 macOS 桌面包中位於 `Contents/Resources/licenses/rust`，在 Windows 中位於 `licenses/rust`，不作為 vendored 原始碼提交。清單僅記錄上游條款，不授予額外權利；再分發時保留原始原始碼及聲明。所有許可證原文保持不變。

mac-notification-sys 0.6.15 的補充記錄保留上游 `deb559683962d314a7693478476bf8d052efa84e` 版本原始 MIT/Apache 文字，發佈包的 include 清單遺漏了這些檔案。

Windows 的 webview2-com 0.39.1 和 webview2-com-sys 0.39.1 補充記錄保留上游 `edc2caf886175ccaebe86078c9cfe1ae2a187328` 的儲存庫根目錄原始 MIT 文字；webview2-com-macros 0.8.1 對應 `dffa41a8a46d3f5565eefbff2de57d38d399f158`。兩個提交的許可證 Git blob 均為 `de9a7e660e173136b351982a34f715af424ff812`，這些發佈子包遺漏了該檔案。補充文字隨附各包完整發佈原始碼。
