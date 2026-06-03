# StockMind AI 开发日志

## 2026-06-04 — 接入真实 A 股数据

### 背景

原网站使用完全 Mock 数据（`hold-le-data.js` 中的 `generateStockDB()`），无法满足小红书引流的可信度需求。

### 数据源

东方财富公开 API（免费，无需 Key）：

- `push2.eastmoney.com/api/qt/clist/get` — 行业股票列表 + 实时行情
- `push2.eastmoney.com/api/qt/stock/get` — 单只股票行情
- `datacenter.eastmoney.com/securities/api/data/v1/get` — 财务指标（RoE/毛利率等）
- `searchadapter.eastmoney.com/api/suggest/get` — 股票搜索

### 文件变更

| 文件                        | 变更                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `services/eastmoney.js`     | **新建** — 东方财富数据服务，含两级缓存（内存+文件）、断路器、重试逻辑      |
| `server.js`                 | **修改** — 新增 6 个 `/api/stocks/*` 和 `/api/market/*` 路由                |
| `public/js/hold-le-data.js` | **修改** — 新增 `fetchRealIndustryStocks()` 等 API 函数，保留 Mock 作为回退 |
| `public/js/hold-le-ui.js`   | **修改** — 新增 `renderMetricsReal()` 和加载状态组件                        |
| `public/js/hold-le-app.js`  | **修改** — `selectIndustry` 改为异步，先试 API 再切 Mock                    |
| `public/css/hold-le.css`    | **修改** — 新增 `@keyframes spin` 动画                                      |
| `DEVLOG.md`                 | **新建** — 本文                                                             |

### 架构要点

```
用户点击行业
    ↓
app.js: selectIndustry(id)
    ↓
fetchRealIndustryStocks(id) → GET /api/stocks/industry/:id
    ↓
eastmoney.js: fetchStocksByIndustry(id)
    ├── 成功 → renderMetricsReal() — 六维实时数据（PE/PB/市值/换手率/涨跌幅/主力净占比）
    └── 失败 → renderMetrics() — 回退 Mock 数据（RoE/现金比率/毛利率/营业利润率/净利率/分红率）
```

### 断路器

东方财富 API 对非国内 IP 有限制。连续 3 次请求失败后，断路器会暂停所有请求 120 秒，防止前端长时间等待。断路器状态在服务进程内存中，重启后重置。

### 代码过滤

API 返回的板块指数（BK 开头）会被自动过滤，只保留标准 6 位数字 A 股代码。

### 修复记录

2026-06-04 Bug: 筛选器无法展示内容

**原因**: 在 `hold-le-ui.js` 中添加 `clearContainer()` 函数时，失误删除了紧跟其后的 `function findStock(code) {` 函数头。导致 `const db = window.__stockDB` 变成全局孤儿代码，整个 JS 文件语法错误无法执行。

**影响**: `renderSidebar`、`renderMetrics`、`findStock`、`renderPyramid`、`renderContrast`、`showSearchResults` 等所有 UI 渲染函数全部失效，筛选器页面点击行业后无任何内容显示。

**修复**: 在 `clearContainer` 函数后补回 `function findStock(code) {`。

### 边界情况

1. **API 不可达**（如当前开发环境）：自动回退 Mock，Mock 数据带「模拟数据」标签
2. **部分行业数据为空**：空行业正常显示，不影响其他行业
3. **搜索时 API 失败**：降级到本地全量 Mock 搜索
4. **AI 分析时找不到股票**：先尝试 API 搜索，再返回「未找到」
