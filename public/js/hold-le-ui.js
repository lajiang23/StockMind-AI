/* ═══════════════════════════════════════════
   StockMind AI · UI Layer — Rendering Functions
   ═══════════════════════════════════════════ */
/* globals INDUSTRIES, METRICS_CONFIG, REAL_METRICS_CONFIG */

function renderSidebar(selectedIndustry) {
  const el = document.getElementById('industryList');
  el.innerHTML = INDUSTRIES.map(
    (ind) =>
      `<button class="sidebar__item ${selectedIndustry === ind.id ? 'active' : ''}"
              data-industry="${ind.id}">
      <span>${ind.name}</span>
      <span class="count">${ind.count}</span>
    </button>`
  ).join('');

  el.querySelectorAll('.sidebar__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.app.selectIndustry(btn.dataset.industry);
    });
  });
}

function renderMetrics(selectedIndustry, stockDB) {
  const stocks = stockDB[selectedIndustry];
  if (!stocks || !stocks.length) return;

  const industryName = INDUSTRIES.find((i) => i.id === selectedIndustry)?.name || selectedIndustry;

  document.getElementById('aShareSub').textContent = `${industryName} · ${stocks.length} 只股票`;
  document.getElementById('aShareSub').innerHTML +=
    ` <span class="badge" style="font-size:11px;background:#ff9500;color:#fff;padding:2px 8px;border-radius:4px;margin-left:6px">模拟数据</span>`;

  let html = `<div class="industry-info">📌 当前行业：<strong>${industryName}</strong> · 共 <strong>${stocks.length}</strong> 只股票 · 按六大财务指标排名展示</div>`;
  html += '<div class="metrics-grid">';

  METRICS_CONFIG.forEach((metric) => {
    const sorted = [...stocks].sort((a, b) => {
      return metric.higherBetter ? b[metric.key] - a[metric.key] : a[metric.key] - b[metric.key];
    });

    html += `<div class="metric-card">
      <div class="metric-card__header">
        <div class="name">${metric.name} <span class="en">(${metric.en})</span></div>
        <div class="desc">${metric.desc}</div>
      </div>
      <div class="metric-card__list">`;

    sorted.slice(0, 30).forEach((s, i) => {
      const val = s[metric.key];
      const isPos = val > 0;
      html += `<div class="metric-row" data-code="${s.code}">
        <span class="metric-row__name">
          <span class="rank">${i + 1}</span>
          ${s.name}
        </span>
        <span class="metric-row__value ${isPos ? 'positive' : 'negative'}">
          ${val}${metric.suffix}
        </span>
      </div>`;
    });

    html += `</div></div>`;
  });

  html += '</div>';
  document.getElementById('aShareMetrics').innerHTML = html;

  document.querySelectorAll('#aShareMetrics .metric-row').forEach((row) => {
    row.addEventListener('click', () => {
      const name = row.querySelector('.metric-row__name').textContent.trim();
      const code = row.dataset.code;
      // 从 stockDB 中找完整数据
      const stock = findStock(code);
      if (stock) showStockModal(stock);
    });
  });
}

/**
 * 渲染真实数据的行业股票排名（替代 renderMetrics 的 Mock 版本）
 * 数据格式由 fetchRealIndustryStocks() 返回，字段与 mock 不同
 */
function renderMetricsReal(selectedIndustry, apiResult) {
  const { industry, industryName, stocks } = apiResult;
  if (!stocks || !stocks.length) {
    document.getElementById('aShareMetrics').innerHTML =
      `<div class="empty-state"><div class="icon">📊</div><p>该行业暂无数据</p></div>`;
    return;
  }

  document.getElementById('aShareSub').textContent =
    `${industryName} · ${stocks.length} 只股票 · 实时`;
  document.getElementById('aShareSub').innerHTML +=
    ` <span class="badge badge--live" style="font-size:11px;background:#34c759;color:#fff;padding:2px 8px;border-radius:4px;margin-left:6px">LIVE</span>`;

  let html = `<div class="industry-info">📌 当前行业：<strong>${industryName}</strong> · 共 <strong>${stocks.length}</strong> 只股票 · 六维度实时数据</div>`;
  html += '<div class="metrics-grid">';

  REAL_METRICS_CONFIG.forEach((metric) => {
    const sorted = [...stocks].sort((a, b) => {
      const va = a[metric.key] ?? 0;
      const vb = b[metric.key] ?? 0;
      return metric.higherBetter ? vb - va : va - vb;
    });

    html += `<div class="metric-card">
      <div class="metric-card__header">
        <div class="name">${metric.name} <span class="en">(${metric.en})</span></div>
        <div class="desc">${metric.desc}</div>
      </div>
      <div class="metric-card__list">`;

    sorted.slice(0, 30).forEach((s, i) => {
      const val = s[metric.key];
      let display;
      if (metric.key === 'marketCap') {
        display =
          val >= 10000 ? (val / 10000).toFixed(2) + '万亿' : (val / 10000).toFixed(2) + '亿';
      } else if (val !== null && val !== undefined) {
        display = val.toFixed(2) + (metric.suffix || '');
      } else {
        display = '—';
      }
      const isPos = val > 0;

      html += `<div class="metric-row" data-code="${s.code}" data-name="${s.name}">
        <span class="metric-row__name">
          <span class="rank">${i + 1}</span>
          ${s.name}
        </span>
        <span class="metric-row__value ${isPos ? 'positive' : 'negative'}">
          ${display}
        </span>
      </div>`;
    });

    html += `</div></div>`;
  });

  html += '</div>';
  document.getElementById('aShareMetrics').innerHTML = html;

  // 点击股票打开详情弹窗（使用真实财务数据）
  document.querySelectorAll('#aShareMetrics .metric-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const code = row.dataset.code;
      const name = row.dataset.name;
      try {
        const detail = await fetchRealStockDetail(code);
        const stockData = detail || {
          code,
          name,
          roe: null,
          grossMargin: null,
          netMargin: null,
          opMargin: null,
          dividendRate: null,
        };
        showStockModal(stockData);
      } catch {
        showStockModal({
          code,
          name,
          roe: null,
          grossMargin: null,
          netMargin: null,
          opMargin: null,
          dividendRate: null,
        });
      }
    });
  });
}

/**
 * 显示加载状态
 */
function showLoading(containerId, text) {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = `<div class="loading-state" style="text-align:center;padding:40px;color:var(--text-secondary)">
      <div style="display:inline-block;width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:12px"></div>
      <p>${text || '加载中...'}</p>
    </div>`;
  }
}

/**
 * 隐藏加载状态清空容器
 */
function clearContainer(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

function findStock(code) {
  const db = window.__stockDB || {};
  for (const arr of Object.values(db)) {
    const found = arr.find((s) => s.code === code);
    if (found) return found;
  }
  return null;
}

function renderPyramid(pyramidData) {
  const list = document.getElementById('pyramidList');
  list.innerHTML = pyramidData
    .map((s) => {
      const rankClass = s.rank <= 3 ? 'top3' : s.rank <= 10 ? 'top10' : 'normal';
      return `<div class="pyramid-item" data-code="${s.code}">
      <div class="pyramid-item__rank ${rankClass}">${s.rank}</div>
      <div class="pyramid-item__info">
        <div>
          <span class="pyramid-item__name">${s.name}</span>
          <span class="pyramid-item__code">${s.code}</span>
        </div>
        <div class="pyramid-item__sector">${s.sector}</div>
      </div>
      <div class="pyramid-item__score">
        <div class="pyramid-item__score-val">${s.score}</div>
        <div class="pyramid-item__score-label">StockMind AI 评分</div>
      </div>
    </div>`;
    })
    .join('');

  list.querySelectorAll('.pyramid-item').forEach((item) => {
    item.addEventListener('click', () => {
      const name = item.querySelector('.pyramid-item__name').textContent;
      const code = item.dataset.code;
      const stock = findStock(code);
      if (stock) {
        showStockModal(stock);
      } else {
        showStockModal({
          code,
          name,
          roe: 0,
          cashRatio: 0,
          grossMargin: 0,
          opMargin: 0,
          netMargin: 0,
          dividendRate: 0,
        });
      }
    });
  });
}

function renderContrast(contrastStocks) {
  const contrastTags = document.getElementById('contrastTags');
  const contrastTableArea = document.getElementById('contrastTableArea');

  contrastTags.innerHTML = contrastStocks
    .map(
      (s) =>
        `<span class="tag">
      ${s.name} <span class="code" style="opacity:0.6">${s.code}</span>
      <button class="remove" data-code="${s.code}">×</button>
    </span>`
    )
    .join('');

  contrastTags.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.app.removeContrastStock(btn.dataset.code);
    });
  });

  if (contrastStocks.length < 2) {
    contrastTableArea.innerHTML = `<div class="empty-state"><div class="icon">⇆</div><p>请添加至少 2 只股票进行对比（按 Enter 添加）</p></div>`;
    return;
  }

  const metrics = [
    { key: 'roe', label: 'RoE 股东权益报酬率(%)', fmt: (v) => `${v}%` },
    { key: 'cashRatio', label: '现金与约当现金比率(%)', fmt: (v) => `${v}%` },
    { key: 'grossMargin', label: '营业毛利率(%)', fmt: (v) => `${v}%` },
    { key: 'opMargin', label: '营业利益率(%)', fmt: (v) => `${v}%` },
    { key: 'netMargin', label: '纯益率/净利率(%)', fmt: (v) => `${v}%` },
    { key: 'dividendRate', label: '分红率(%)', fmt: (v) => `${v}%` },
  ];

  let html = '<div class="contrast-table-wrap"><table class="contrast-table">';
  html += '<tr class="stock-header"><th>指标</th>';
  contrastStocks.forEach((s) => {
    html += `<th>${s.name}<br><span style="font-weight:400;font-size:11px;color:var(--text-tertiary)">${s.code}</span></th>`;
  });
  html += '</tr>';

  metrics.forEach((m) => {
    html += `<tr><td>${m.label}</td>`;
    contrastStocks.forEach((s) => {
      const val = s[m.key];
      html += `<td class="${val > 0 ? 'positive' : 'negative'}">${m.fmt(val)}</td>`;
    });
    html += '</tr>';
  });

  html += '</table></div>';
  contrastTableArea.innerHTML = html;
}

function showSearchResults(query, allStocks) {
  const q = query.toLowerCase();
  const results = allStocks
    .filter((s) => s.code.includes(q) || s.name.toLowerCase().includes(q))
    .slice(0, 8);

  const searchResults = document.getElementById('searchResults');
  const searchOverlay = document.getElementById('searchOverlay');

  if (!results.length) {
    searchResults.innerHTML = `<div class="empty-state" style="padding:20px"><p>未找到匹配的股票</p></div>`;
  } else {
    searchResults.innerHTML = results
      .map(
        (s) =>
          `<div class="search-overlay__item" data-code="${s.code}">
        <div>
          <span class="name">${s.name}</span>
          <span class="code">${s.code}</span>
        </div>
        <span style="font-size:12px;color:var(--text-tertiary)">${INDUSTRIES.find((i) => i.id === s.industry)?.name || ''}</span>
      </div>`
      )
      .join('');
    searchResults.querySelectorAll('.search-overlay__item').forEach((item) => {
      item.addEventListener('click', () => {
        const code = item.dataset.code;
        const name = item.querySelector('.name').textContent;
        const stock = findStock(code);
        if (stock) showStockModal(stock);
        searchOverlay.classList.remove('open');
        document.getElementById('globalSearch').blur();
      });
    });
  }
  searchOverlay.classList.add('open');
}
