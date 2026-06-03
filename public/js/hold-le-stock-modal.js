/* ═══════════════════════════════════════════
   StockMind AI · AI 个股分析弹窗
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  let currentStock = null;
  let isAnalyzing = false;

  const MODAL_HTML = `
  <div class="stock-modal-overlay" id="stockModalOverlay">
    <div class="stock-modal" id="stockModal">
      <div class="stock-modal__header">
        <div class="stock-modal__title" id="stockModalTitle">个股详情</div>
        <button class="stock-modal__close" id="stockModalClose">×</button>
      </div>
      <div class="stock-modal__body" id="stockModalBody">
        <div class="stock-modal__placeholder">
          <div class="stock-modal__icon">📈</div>
          <p>选择一只股票查看 AI 分析报告</p>
        </div>
      </div>
    </div>
  </div>`;

  const STOCK_CSS = `
  .stock-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 2000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }
  .stock-modal-overlay.open { display: flex; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  .stock-modal {
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    width: 100%;
    max-width: 640px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s ease;
    overflow: hidden;
  }
  .stock-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    border-bottom: 1px solid #e8e8ed;
    flex-shrink: 0;
  }
  .stock-modal__title {
    font-weight: 700;
    font-size: 17px;
  }
  .stock-modal__close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: #f5f5f7;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    color: #6e6e73;
    line-height: 1;
  }
  .stock-modal__close:hover { background: #e8e8ed; }
  .stock-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: 22px;
  }
  .stock-modal__placeholder {
    text-align: center;
    padding: 40px 20px;
    color: #aeaeb2;
  }
  .stock-modal__placeholder .stock-modal__icon { font-size: 48px; margin-bottom: 12px; }

  /* AI 分析内容样式 */
  .stock-analysis { line-height: 1.8; color: #1d1d1f; font-size: 14px; }
  .stock-analysis h2 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .stock-analysis .stock-code { font-size: 13px; color: #6e6e73; font-weight: 400; }
  .stock-analysis .quote-bar {
    display: flex; gap: 16px;
    padding: 14px 16px;
    background: #f5f5f7;
    border-radius: 12px;
    margin: 14px 0 18px;
    flex-wrap: wrap;
  }
  .stock-analysis .quote-item { text-align: center; }
  .stock-analysis .quote-item .label { font-size: 11px; color: #aeaeb2; display: block; }
  .stock-analysis .quote-item .value { font-size: 16px; font-weight: 600; }
  .stock-analysis .quote-item .value.up { color: #248a3d; }
  .stock-analysis .quote-item .value.down { color: #bf3a2b; }
  .stock-analysis .ai-section {
    margin-top: 16px;
    padding: 14px 16px;
    background: #f8f9fa;
    border-left: 3px solid #0071e3;
    border-radius: 8px;
    font-size: 14px;
    color: #1d1d1f;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .stock-analysis .ai-section.ai-loading {
    background: #f5f5f7;
    border-left-color: #aeaeb2;
    color: #6e6e73;
  }
  .stock-analysis .ai-section .ai-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0071e3;
    font-weight: 600;
    display: block;
    margin-bottom: 6px;
  }
  .stock-analysis .ai-section.ai-loading .ai-label { color: #aeaeb2; }

  .stock-analysis .metrics-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
  }
  .stock-analysis .metrics-table th,
  .stock-analysis .metrics-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #e8e8ed;
  }
  .stock-analysis .metrics-table th {
    background: #f5f5f7;
    font-weight: 600;
    font-size: 12px;
    color: #6e6e73;
  }
  .stock-analysis .metrics-table td { font-family: 'Inter', monospace; }
  .stock-analysis .metrics-table td.pos { color: #248a3d; }
  .stock-analysis .metrics-table td.neg { color: #bf3a2b; }

  .stock-analysis .ai-error {
    color: #bf3a2b;
    font-size: 13px;
  }

  @media (max-width: 600px) {
    .stock-modal { max-height: 90vh; border-radius: 16px; }
    .stock-modal__body { padding: 16px; }
  }`;

  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = STOCK_CSS;
  document.head.appendChild(styleEl);

  // Inject modal HTML
  const container = document.createElement('div');
  container.innerHTML = MODAL_HTML;
  document.body.appendChild(container.firstElementChild);

  // DOM refs
  const overlay = document.getElementById('stockModalOverlay');
  const modal = document.getElementById('stockModal');
  const title = document.getElementById('stockModalTitle');
  const body = document.getElementById('stockModalBody');
  const closeBtn = document.getElementById('stockModalClose');

  // Events
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  function close() {
    overlay.classList.remove('open');
    currentStock = null;
  }

  function open(stockData) {
    currentStock = stockData;
    title.textContent = `${stockData.name} (${stockData.code})`;
    body.innerHTML = `<div class="stock-modal__placeholder">
      <div class="stock-modal__icon">⏳</div>
      <p>正在获取分析报告...</p>
    </div>`;
    overlay.classList.add('open');

    // 触发 AI 分析
    fetchAnalysis(stockData);
  }

  async function fetchAnalysis(stockData) {
    // 先显示本地数据摘要
    const localHtml = buildLocalView(stockData);
    body.innerHTML = localHtml;

    const aiSection = body.querySelector('.ai-section');
    if (!aiSection) return;

    try {
      // 尝试调用 AI 分析
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: stockData.code,
          name: stockData.name,
          metrics: buildMetrics(stockData),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        aiSection.innerHTML = `<span class="ai-label">AI 分析</span>
          <div class="ai-error">⚠️ ${err.error || 'AI 分析暂时不可用'}</div>
          <div style="margin-top:8px;font-size:12px;color:#aeaeb2;">
            💡 提示：请确保已在服务器 .env 文件中配置 ANTHROPIC_API_KEY
          </div>`;
        return;
      }

      const data = await res.json();
      if (data.analysis) {
        // 将 AI 返回的 markdown 转为纯文本显示
        aiSection.innerHTML = `<span class="ai-label">AI 分析</span>${formatAnalysis(data.analysis)}`;
      } else {
        aiSection.innerHTML = `<span class="ai-label">AI 分析</span>
          <div class="ai-error">⚠️ 未能生成分析报告</div>`;
      }
    } catch (err) {
      aiSection.innerHTML = `<span class="ai-label">AI 分析</span>
        <div class="ai-error">⚠️ 网络错误：${err.message}</div>`;
    }
  }

  function buildLocalView(stock) {
    const metrics = [
      { key: 'roe', label: 'RoE', fmt: (v) => `${v}%` },
      { key: 'cashRatio', label: '现金比率', fmt: (v) => `${v}%` },
      { key: 'grossMargin', label: '毛利率', fmt: (v) => `${v}%` },
      { key: 'opMargin', label: '营业利润率', fmt: (v) => `${v}%` },
      { key: 'netMargin', label: '净利率', fmt: (v) => `${v}%` },
      { key: 'dividendRate', label: '分红率', fmt: (v) => `${v}%` },
    ];

    const mktTag = stock.code.startsWith('6') ? 'SH' : 'SZ';

    return `<div class="stock-analysis">
      <h2>${stock.name} <span class="stock-code">${stock.code}.${mktTag}</span></h2>
      <div class="quote-bar">
        <div class="quote-item">
          <span class="label">模拟价格</span>
          <span class="value">${(Math.random() * 100 + 10).toFixed(2)}</span>
        </div>
        <div class="quote-item">
          <span class="label">模拟涨跌</span>
          <span class="value ${Math.random() > 0.5 ? 'up' : 'down'}">
            ${(Math.random() * 5).toFixed(2)}%
          </span>
        </div>
      </div>
      <table class="metrics-table">
        <tr><th>指标</th><th>数值</th><th>行业参考</th></tr>
        ${metrics
          .map((m) => {
            const val = stock[m.key] || 0;
            return `<tr><td>${m.label}</td><td class="${val > 10 ? 'pos' : 'neg'}">${m.fmt(val)}</td>
            <td style="color:#aeaeb2;font-size:12px;">—</td></tr>`;
          })
          .join('')}
      </table>
      <div class="ai-section ai-loading">
        <span class="ai-label">AI 分析</span>
        <span style="color:#aeaeb2;">⏳ 正在生成分析报告...</span>
      </div>
    </div>`;
  }

  function buildMetrics(stock) {
    return [
      { label: 'RoE 股东权益报酬率', value: `${stock.roe || 0}%` },
      { label: '现金与约当现金比率', value: `${stock.cashRatio || 0}%` },
      { label: '营业毛利率', value: `${stock.grossMargin || 0}%` },
      { label: '营业利益率', value: `${stock.opMargin || 0}%` },
      { label: '纯益率/净利率', value: `${stock.netMargin || 0}%` },
      { label: '分红率', value: `${stock.dividendRate || 0}%` },
    ];
  }

  function formatAnalysis(text) {
    // 简单处理：加粗标记、段落分隔
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  // Expose for external calls
  window.showStockModal = open;
})();
