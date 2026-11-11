# 快應用介面開發

[English](quickapp-ui.md) · [简体中文](quickapp-ui.zh-CN.md) · **繁體中文**

Buddy 手環介面應盡可能使用程式繪製。更換繪製方式時，保留已確認的角色、膠囊外框、資源佈局和互動。繪圖原型用於驗證裝置能力，不代表另做一套產品設計。相關邊界見[開發指南](README.zh-TW.md)、[架構](../architecture/README.zh-TW.md)與[繪製決策](../architecture/ADR-008-animation-and-task-rings.zh-TW.md)。

## 程式與圖片原則

現有介面使用原生 `div`、`text` 和弧形 `progress`，與桌面預覽共用幾何和動畫計算。這些元件已經過目標手環實測；不要假定 Vela 支援瀏覽器 Canvas API。能力查詢 API 缺失表示支援情況未知，不等於元件不受支援。

| 資源 | 專案規則 |
| --- | --- |
| 角色、外框、資源環和動畫 | 使用程式產生幾何，不恢復 PNG 逐幀動畫或整屏介面圖片。 |
| 手環應用入口圖示 | 保留必需的 `common/icon.png`，由已確認的母圖產生，與內頁繪製分開。 |
| 桌面主題縮圖 | 三張產生的縮圖僅供 Mac 使用，不進入手環 RPK。 |
| 後續確有點陣圖需求 | 說明原生繪製不適合的原因，控制尺寸和數量，測量套件、解碼後記憶體及實機表現。 |

目前建置會檢查 RPK，僅允許入口圖示這一張圖片。若確需改變資源原則，必須同時更新檢查與文件。壓縮檔案小不代表解碼記憶體及快取開銷小；程式繪製也有成本，節點、觀察器或逐幀配置過多同樣可能卡頓。效能收益需要用實際負載比較。

## 原始碼職責

| 原始檔 | 修改內容 |
| --- | --- |
| `packages/buddy-shared/presentation/geometry.js` | 統一的 490×192 佈局、角色、膠囊路徑及原生 192×490 座標投影；保持純 ES5 CommonJS。 |
| `packages/buddy-shared/presentation/native-ui.js` | 共用動畫時間與有效幀率策略。 |
| `apps/band/src/controllers/page-controller.js` | 注入平台 API、更新觀察資料，以及頁面和計時器生命週期。 |
| `apps/band/src/pages/index/index.ux` | 原生模板、樣式和文字佈局。 |
| `apps/desktop/ui/preview.js` | 使用相同原生幾何與時間的 Canvas 預覽。 |
| `scripts/prepare_shared.py` | 從統一共用模組產生 Vela／瀏覽器適配檔案。 |
| `scripts/render_band_ui.py` | 三張桌面縮圖及已知廢棄幀目錄的清理。 |
| `scripts/prepare_band_icon.py` | 從 `apps/desktop/artwork/app-icon.png` 產生入口圖示。 |

修改原始檔和產生器後重新建置，不手改暫存的應用副本或產生資源。廢棄資源由對應產生器清理，不順手刪除其他本地檔案。

## 動畫與重繪開銷

多 AI 狀態計算屬於 Mac：彙總會話、選擇優先序／模式並編譯有序配色後再發送快照。支援的新手環收到 `activityRing`，不接收彙總輸入，只套用方案並播放本地動畫。相容舊主機時每次快照轉換一次計數，不逐幀轉換；保留本地斷線回退和亮屏看門狗（[ADR-009](../architecture/ADR-009-host-activity-display.zh-TW.md)）。

- 保持觀察陣列和圖形 ID 穩定，僅原地更新變化欄位；快取不變的角色幾何，透過單個數值偏移移動整組，避免每幀重建所有綁定物件。與 UI 無關的資料不要放進觀察模型，參考官方[記憶體最佳化](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html)。
- 每個繪製器只快取目前任務配色佈局和最多 33 列小型色階資料；任務數、主題或狀態變化時使快取失效。移動高光的每段重用固定的矩形／圓弧節點。繪製耗時計入幀預算，不在繪製後再等待完整間隔。這些措施減少重複計算和元件增刪，保留 loading 效果，也不透過藍牙逐幀傳圖；實機流暢度仍需測量。
- 控制元件數量、巢狀層級和動態樣式，參考官方[業務最佳化](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html)。資源顯示值不變時跳過幾何更新；頁面隱藏時停止動畫，銷毀時取消所屬計時器和監聽器。
- 固定背景和填充的層級。Vela [stack](https://iot.mi.com/vela/quickapp/zh/components/container/stack.html) 的後置直接子元件覆蓋前面的元件；底軌應放在固定背景容器，避免動態子節點蓋住進度線。
- 保留先投影到原生座標、再綁定圖形的實作。實機出現 CPU 弧線累積缺口後，已移除圖形父容器旋轉。直線／曲線接點與運動端點都要實測，幾何單元測試不能證明韌體重繪正確。

已採用的記憶體最佳化：診斷計數與資源插值狀態保留在控制器閉包，不放入響應式頁面模型。只有常量資源標籤使用 `static`，數值、圖形和顏色仍保持動態。顏色快取直接比較有界清單，不逐幀串接字串鍵。亮度介面只在前景切換或設定變化時呼叫，不進入動畫計時器。不要定時執行 `runGC`：官方記憶體文件明確指出頻繁 GC 會造成卡頓。

`buddyFps` 為 10–30 的整數，預設 10，使用數字輸入框，透過儲存或 Enter 提交。省電模式固定有效幀率為 10，並保留原選擇。桌面預覽使用相同幾何與有效幀率，以新鮮 ACK 時間對齊動畫階段。預覽是場景重建，不是手環截圖；字型與點陣化差異仍需目測對比。

設定值及 ACK 的 `drawing.effectiveFps` 僅表示排程目標，JavaScript 幀計數也不等於面板實際刷新幀率。持續執行上限及耗電尚未測量，30 FPS 是測試目標，不是效能保證。

## 建置與實機驗證

在儲存庫根目錄建置手環資源，執行相關幾何、控制器和預覽測試，再執行公共檢查：

```sh
npm run build
node --test tests/band/code-probe.test.mjs tests/band/native-ui.test.mjs tests/contracts/preview-animation.test.mjs
npm test
npm run check:architecture
```

預覽或隨包 RPK 改變後重新建置桌面套件；本地測試版本見[開發指南](README.zh-TW.md)。建置不代表安裝或發佈。修改資源產生方式時，記錄 RPK 位元組數和圖片清單。

實機需檢查兩頁、所有主題／活動狀態、跨越直線與曲線接點的資源值、連續百分比變化、隱藏／返回與重複前台啟動。驗證省電及幀率選擇恢復，再分別觀察持續任務和任務結束後的熄屏延遲。記錄型號、韌體、時長與物理結果；傳輸成功或 ACK 不能證明繪製、穩定性或亮屏。

在 Smart Band 9 NFC 韌體 3.1.32 上，使用者報告本地 code.3 卡死並重啟；該版以 30 Hz 替換觀察陣列，觀察器／渲染壓力是排查假設，尚無崩潰證據證明根因。改為原地更新、固定層級及原生座標繪製後，使用者在 code.8 的短時檢查中確認方向正常、CPU 弧線缺口未再出現。這不代表長期穩定、幀率上限已測得，或原來的偶發熄屏／斷線已解決。驗證範圍見[測試與限制](../testing.zh-TW.md)。
