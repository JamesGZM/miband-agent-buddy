# 第三方聲明

[English](THIRD_PARTY_NOTICES.md) · [简体中文](THIRD_PARTY_NOTICES.zh-CN.md) · **繁體中文**

## AstroBox — AstralSightStudios

MiBand Agent Buddy 使用 [AstralSightStudios](https://github.com/AstralSightStudios) 的協議與帳號組件，保留其 AGPL-3.0 許可證及附加署名聲明。

| 組件 | 儲存庫 | 版本與適配 |
| --- | --- | --- |
| Account | https://github.com/AstralSightStudios/AstroBox-NG-Module-Account | `dae3188a9c3a9c757555f51d00a6774ab13f1257`；vendored 代碼以 reqwest 替換私有 hostio HTTP，限制重定向與等待範圍，不使用上游日誌。原始碼隨附 LICENSE 和 NOTICE。 |
| Core | https://github.com/AstralSightStudios/AstroBox-NG-Module-Core | 版本鎖定在 `native/transport/upstream-lock.json`。`core-no-network.patch` 與 `core-without-vivo.patch` 隔離可選功能；上游預設網絡、RPC、Vivo 功能保持原樣，本項目關閉它們。`core-sar-ack-reuse.patch` 在序號回繞時僅清除復用序號的舊確認，保留其他未消費的 MASS 確認，並有回歸測試。 |
| Classic SPP | https://github.com/AstralSightStudios/AstroBox-NG-Plugin-BtClassicSpp | 使用鎖定版本的 macOS 實現，保留原始原始碼與許可證。 |
| Bluetooth | https://github.com/AstralSightStudios/AstroBox-NG-Module-Bluetooth | 鎖定的構建依賴，bootstrap 保留原始許可證。 |
| Protocol buffers | https://github.com/AstralSightStudios/AstroBox-NG-Module-Pb | 鎖定的構建依賴，bootstrap 保留原始許可證。 |
| Vivo MsgPack | https://github.com/AstralSightStudios/AstroBox-NG-Module-Vivo-MsgPack | Core 的可選依賴，所檢查版本沒有獨立 LICENSE。bootstrap 下載它以保持上游功能相容，但本 App 禁用 `vivo` 和 `rpc`；它不在 App 的 Cargo 鎖文件、依賴樹及桌麵包內。在解決再分發條款前不要啟用或分發。 |

上游 Core、Bluetooth、SPP 的 README 除 AGPL 條款外還要求作者與儲存庫署名。本文件及 App 關於頁面提供這些署名。下載的原始碼和許可證保持完整；儲存庫提交版本鎖與補丁，不提交下載樹。Vivo／RPC 排除是獨立的本地構建適配，不修改上游預設行為，也不授予額外分發權限。

## 其他依賴

桌面構建執行 `scripts/collect_licenses.py`，將實際解析的 macOS Rust 依賴許可證及署名放入 `Contents/Resources/licenses/rust`。經審閱的補充記錄見[許可證記錄](docs/open-source/licenses/README.zh-TW.md)。發佈 crate 缺少完整許可證、MPL 包及本地適配的上游 crate 同時附帶對應包原始碼。帳號模塊聲明和官方 Node 分發包許可證單獨包含。

Tauri 及插件、Rust 依賴和 Vela `aiot-toolkit` 保留各自許可證，準確版本記錄在 Cargo.lock 與 apps/band/package-lock.json。Pillow 僅用於本地生成圖像。可移動 macOS 包在 `Contents/Resources/licenses` 保留 Node 與上游組件聲明。對應 GitHub 標籤提供準確項目原始碼，額外原始碼歸檔包含修改後的上游原始碼與連結的 Rust 包。鎖定版本及獨立補丁由 `native/transport/upstream-lock.json` 和 bootstrap 標識。構建拒絕非系統 dylib，發佈打包拒絕啟用 Vivo MsgPack 依賴。

## 靈感與圖像

Dan Wahlin 的 [Agent Buddy](https://github.com/DanWahlin/agent-buddy) 啟發了基於生命週期的伴侶交互。膠囊、符號、圓環與幾何 Buddy 圖像由 `scripts/render_band_ui.py` 生成。品牌與工具名稱僅用於描述主題和接入，不代表背書或商標授權。許可證原文保持不變；譯文不授予額外權利。
