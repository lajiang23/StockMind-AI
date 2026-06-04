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

  async function open(stockData) {
    currentStock = stockData;
    overlay.classList.add('open');

    // 先尝试获取真实数据
    title.textContent = `${stockData.name} (${stockData.code})`;
    body.innerHTML = `<div class="stock-modal__placeholder">
      <div class="stock-modal__icon">⏳</div>
      <p>正在获取实时数据...</p>
    </div>`;

    try {
      const res = await fetch(`/api/stocks/metrics/${stockData.code}`);
      if (res.ok) {
        const realData = await res.json();
        // 合并真实数据（覆盖 mock 中的空值）
        stockData = { ...stockData, ...realData };
        currentStock = stockData;
      }
    } catch {
      // 静默失败，使用传入的数据
    }

    // 渲染视图 + AI 分析
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
    const hasRealData = stock.price != null;
    const metrics = [
      { key: 'roe', label: 'RoE', val: stock.roe, fmt: (v) => (v != null ? `${v}%` : '—') },
      {
        key: 'eps',
        label: 'EPS（每股收益）',
        val: stock.eps,
        fmt: (v) => (v != null ? `${v}` : '—'),
      },
      {
        key: 'grossMargin',
        label: '毛利率',
        val: stock.grossMargin,
        fmt: (v) => (v != null ? `${v}%` : '—'),
      },
      {
        key: 'opMargin',
        label: '营业利润率',
        val: stock.opMargin,
        fmt: (v) => (v != null ? `${v}%` : '—'),
      },
      {
        key: 'netMargin',
        label: '净利率',
        val: stock.netMargin,
        fmt: (v) => (v != null ? `${v}%` : '—'),
      },
      {
        key: 'dividendRate',
        label: '分红率',
        val: stock.dividendRate,
        fmt: (v) => (v != null ? `${v}%` : '—'),
      },
      { key: 'pe', label: '市盈率 (PE)', val: stock.pe, fmt: (v) => (v != null ? `${v}` : '—') },
      { key: 'pb', label: '市净率 (PB)', val: stock.pb, fmt: (v) => (v != null ? `${v}` : '—') },
      {
        key: 'marketCap',
        label: '总市值',
        val: stock.marketCap,
        fmt: (v) => (v != null ? `${v.toFixed(0)}亿` : '—'),
      },
      {
        key: 'turnoverRate',
        label: '换手率',
        val: stock.turnoverRate,
        fmt: (v) => (v != null ? `${v}%` : '—'),
      },
    ];

    const mktTag =
      stock.code && stock.code.startsWith('6')
        ? 'SH'
        : stock.code && (stock.code.startsWith('0') || stock.code.startsWith('3'))
          ? 'SZ'
          : '';

    // 价格和涨跌
    const price = stock.price != null ? stock.price.toFixed(2) : '—';
    const change = stock.changePercent != null ? stock.changePercent : null;
    const changeStr = change != null ? (change > 0 ? '+' : '') + change.toFixed(2) + '%' : '—';
    const changeClass = change != null ? (change > 0 ? 'up' : change < 0 ? 'down' : '') : '';

    return `<div class="stock-analysis">
      <h2>${stock.name || '未知'} <span class="stock-code">${stock.code || ''}${mktTag ? '.' + mktTag : ''}</span></h2>
      <div class="quote-bar">
        <div class="quote-item">
          <span class="label">${hasRealData ? '最新价' : '价格'}</span>
          <span class="value ${changeClass}">${price}</span>
        </div>
        <div class="quote-item">
          <span class="label">${hasRealData ? '涨跌幅' : '涨跌'}</span>
          <span class="value ${changeClass}">${changeStr}</span>
        </div>
        ${stock.industry ? `<div class="quote-item"><span class="label">行业</span><span class="value" style="font-size:14px">${stock.industry}</span></div>` : ''}
      </div>
      ${!hasRealData ? '<div style="font-size:12px;color:#aeaeb2;margin:-8px 0 12px;text-align:center">⚠️ 实时数据暂不可用，显示本地参考数据</div>' : ''}
      <table class="metrics-table">
        <tr><th>指标</th><th>数值</th></tr>
        ${metrics
          .filter((m) => m.val != null || stock[m.key] != null)
          .map((m) => {
            const displayVal = m.fmt(stock[m.key]);
            return `<tr><td>${m.label}</td><td>${displayVal}</td></tr>`;
          })
          .join('')}
        ${metrics.filter((m) => m.val != null || stock[m.key] != null).length === 0 ? '<tr><td colspan="2" style="color:#aeaeb2;text-align:center">暂无数据</td></tr>' : ''}
      </table>
      ${hasRealData ? '<div style="font-size:11px;color:#aeaeb2;margin-top:8px;text-align:right">数据来源：腾讯行情 · 东方财富</div>' : ''}
      <div class="ai-section ai-loading">
        <span class="ai-label">AI 分析</span>
        <span style="color:#aeaeb2;">⏳ 正在生成分析报告...</span>
      </div>
    </div>`;
  }

  function buildMetrics(stock) {
    const m = [];
    if (stock.roe != null) m.push({ label: 'RoE 股东权益报酬率', value: `${stock.roe}%` });
    if (stock.eps != null) m.push({ label: 'EPS 每股收益', value: `${stock.eps}` });
    if (stock.grossMargin != null) m.push({ label: '营业毛利率', value: `${stock.grossMargin}%` });
    if (stock.opMargin != null) m.push({ label: '营业利益率', value: `${stock.opMargin}%` });
    if (stock.netMargin != null) m.push({ label: '纯益率/净利率', value: `${stock.netMargin}%` });
    if (stock.dividendRate != null) m.push({ label: '分红率', value: `${stock.dividendRate}%` });
    if (stock.pe != null) m.push({ label: '市盈率 PE', value: `${stock.pe}` });
    if (stock.pb != null) m.push({ label: '市净率 PB', value: `${stock.pb}` });
    return m.length ? m : [{ label: '暂无可用财务数据', value: '' }];
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
