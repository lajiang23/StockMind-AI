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

function renderPyramid(stocks, isMock) {
  const list = document.getElementById('pyramidList');
  if (!stocks || stocks.length === 0) {
    list.innerHTML = '<div class="pyramid-empty">暂无数据，请稍后再试</div>';
    return;
  }

  // 显示数据来源标记
  const sourceBadge = isMock
    ? '<div class="pyramid-badge mock">📊 模拟数据（真实数据源暂不可达）</div>'
    : '<div class="pyramid-badge real">📈 实时数据</div>';

  list.innerHTML =
    sourceBadge +
    stocks
      .map((s) => {
        const rankClass = s.rank <= 3 ? 'top3' : s.rank <= 10 ? 'top10' : 'normal';
        const changeClass = s.changePercent > 0 ? 'up' : s.changePercent < 0 ? 'down' : '';
        const dims = s.dimensions || {};

        return `<div class="pyramid-item" data-code="${s.code}" data-stock='${encodeURIComponent(JSON.stringify(s))}'>
        <div class="pyramid-item__rank ${rankClass}">${s.rank}</div>
        <div class="pyramid-item__info">
          <div>
            <span class="pyramid-item__name">${s.name}</span>
            <span class="pyramid-item__code">${s.code}</span>
            <span class="pyramid-item__change ${changeClass}">${s.changePercent != null ? (s.changePercent > 0 ? '+' : '') + s.changePercent + '%' : '—'}</span>
          </div>
          <div class="pyramid-item__meta">${s.industry || ''} · PE ${s.pe != null ? s.pe : '—'} · PB ${s.pb != null ? s.pb : '—'}</div>
          <div class="pyramid-item__dims">
            <div class="dim-bar" title="估值安全 ${dims.valuation || 0}分"><span class="dim-label">估</span><span class="dim-track"><span class="dim-fill" style="width:${dims.valuation || 0}%;background:#0071e3"></span></span></div>
            <div class="dim-bar" title="市值规模 ${dims.scale || 0}分"><span class="dim-label">规</span><span class="dim-track"><span class="dim-fill" style="width:${dims.scale || 0}%;background:#34c759"></span></span></div>
            <div class="dim-bar" title="市场信号 ${dims.momentum || 0}分"><span class="dim-label">势</span><span class="dim-track"><span class="dim-fill" style="width:${dims.momentum || 0}%;background:#ff9500"></span></span></div>
            <div class="dim-bar" title="流动性 ${dims.turnover || 0}分"><span class="dim-label">流</span><span class="dim-track"><span class="dim-fill" style="width:${dims.turnover || 0}%;background:#af52de"></span></span></div>
            <div class="dim-bar" title="稳定性 ${dims.stability || 0}分"><span class="dim-label">稳</span><span class="dim-track"><span class="dim-fill" style="width:${dims.stability || 0}%;background:#ff3b30"></span></span></div>
          </div>
        </div>
        <div class="pyramid-item__score">
          <div class="pyramid-item__score-val">${s.score}</div>
          <div class="pyramid-item__score-label">综合评分</div>
        </div>
      </div>`;
      })
      .join('');

  list.querySelectorAll('.pyramid-item').forEach((item) => {
    item.addEventListener('click', () => {
      const raw = item.dataset.stock;
      if (raw) {
        try {
          const stock = JSON.parse(decodeURIComponent(raw));
          showStockModal(stock);
          return;
        } catch {}
      }
      // fallback
      const name = item.querySelector('.pyramid-item__name').textContent;
      const code = item.dataset.code;
      showStockModal({ code, name });
    });
  });
}

function fetchAndRenderPyramid() {
  const list = document.getElementById('pyramidList');
  list.innerHTML =
    '<div class="pyramid-loading"><div class="spinner"></div><span>正在扫描全市场，计算金字塔评分...</span></div>';

  fetch('/api/stocks/pyramid?count=20')
    .then((r) => r.json())
    .then((data) => {
      renderPyramid(data.stocks || [], data.mock === true);
    })
    .catch((err) => {
      console.error('[Pyramid] 加载失败:', err);
      list.innerHTML = '<div class="pyramid-empty">数据加载失败，请刷新重试</div>';
    });
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

// ═══════════════════════════════════════════
// Course Detail Content & Render
// ═══════════════════════════════════════════

const COURSE_CHAPTERS = {
  'ch-01': {
    num: '01',
    title: '信息收集 — AI 帮你过滤噪音',
    badge: '信息',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '学会用 AI 工具自动收集市场资讯、个股新闻、行业动态和资金流向数据，不再被碎片化的信息淹没，建立高效的信息筛选系统。',
      },
      {
        heading: '📌 为什么信息收集是第一步？',
        body: `A 股市场每天产生海量信息：公告、研报、新闻、社媒讨论、资金流向数据……散户最大的痛点不是"信息太少"，而是"噪音太多"——90% 的信息对投资决策没有帮助。AI 的核心价值就在这里：它能帮你过滤掉 90% 的噪音，只呈现那 10% 真正重要的内容。`,
      },
      {
        heading: '🤖 AI 工具实战',
        body: `用 StockMind AI 的智能分析功能，你只需要输入股票代码或名称，AI 就会自动完成：获取该股票的实时行情和财务数据，整理关键财务指标（PE/PB/ROE/毛利率等），用自然语言生成分析简报。整个过程不需要你自己去翻财报或找数据。`,
      },
      {
        heading: '📋 日常信息收集清单',
        body: '作为一名 AI 辅助的投资者，每天/每周可以关注这些信息：大盘概况（上证指数、深证成指的趋势），行业动态（你关注的行业是否有政策变化），个股公告（持仓股票的财报、重大合同、分红公告），资金流向（北向资金、主力资金动向）。',
      },
      {
        heading: '⚠️ 常见误区',
        body: '❌ 每天刷无数条财经新闻 → 信息过载，反而影响判断\n✅ 让 AI 帮你整理关键信息，只看结论\n❌ 看到跌幅大就恐慌\n✅ 看数据而不是看价格——基本面没变就不是问题',
      },
      {
        heading: '💡 小结',
        body: '信息收集是投资的基础，但不要做信息的奴隶。AI 工具的价值不是给你更多信息，而是帮你从海量信息中快速找到真正重要的内容。用好 AI 过滤器，把精力留给分析和决策。',
      },
    ],
  },
  'ch-02': {
    num: '02',
    title: '数据获取 — 一键拉取真实数据',
    badge: '数据',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '学会使用 AI 工具自动拉取 A 股真实行情和财务数据，理解关键数据指标（PE/PB/ROE/毛利率等）从哪里来，告别手动翻财报的繁琐过程。',
      },
      {
        heading: '📌 数据的价值',
        body: '投资决策应该基于数据，而不是感觉或消息。一个公司的基本面如何，最终要落到数字上：它赚多少钱、增长多快、估值贵不贵。以前获取这些数据需要翻财报→手动录入→计算指标→对比历史→对比同行。AI 可以在几秒内完成以上所有步骤。',
      },
      {
        heading: '🔢 核心数据指标速览',
        body: '以下是 AI 自动获取和分析的核心指标：\n\n📊 估值指标\nPE（市盈率）= 股价 ÷ 每股盈利 → 判断"贵不贵"\nPB（市净率）= 股价 ÷ 每股净资产 → 判断"资产值不值"\n\n💰 盈利指标\nROE（净资产收益率）= 净利润 ÷ 净资产 → 公司"赚钱能力"\n毛利率 =（收入 - 成本）÷ 收入 → 产品"竞争力"\n净利率 = 净利润 ÷ 收入 → 最终"利润率"\n\n📈 成长指标\n营收增长率 → 公司还在增长吗？\n利润增长率 → 增长的质量如何？',
      },
      {
        heading: '🤖 AI 数据获取实操',
        body: '在 StockMind AI 中：\n1. 打开首页 → AI 智能分析输入框\n2. 输入股票代码（如 600519）或名称\n3. 点击"分析"按钮\n4. AI 自动获取数据并生成分析报告\n\n你也可以在筛选器中按行业浏览，所有数据都是实时从东方财富 API 拉取的，确保数据的真实性和时效性。',
      },
      {
        heading: '⚠️ 数据注意事项',
        body: '数据来源：东方财富公开 API（免费公开数据）。更新频率：行情数据实时更新，财务数据随财报发布更新。历史数据：AI 可以获取最近 4 期财报数据用于趋势对比。数据延迟：实时行情约 3-5 秒延迟，不影响分析判断。',
      },
      {
        heading: '💡 小结',
        body: '数据获取是 AI 最擅长的领域。你不需要会 SQL、不需要会爬虫，只需要输入股票名称，AI 就能把完整的数据报告呈现给你。把时间花在理解数据上，而不是获取数据上。',
      },
    ],
  },
  'ch-03': {
    num: '03',
    title: '财务指标分析 — AI 帮你读财报',
    badge: '财务',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '理解 ROE、毛利率、净利率等核心财务指标的含义和判断标准，学会用 AI 解读财报数据，快速判断一家公司的基本面质量。',
      },
      {
        heading: '📌 为什么财务指标重要？',
        body: '买股票就是买公司的一部分。财务指标是判断一家公司"好不好"的最客观标准。就像体检报告上的各项指标能反映你的健康状况一样，财务指标能反映一家公司的健康程度。AI 的作用：把枯燥的数字翻译成大白话，并告诉你"这个数字是好还是不好"。',
      },
      {
        heading: '🏆 最重要的三个指标',
        body: '1️⃣ ROE（净资产收益率）— "赚钱效率"\n含义：每投入 1 元股东权益，能赚回多少利润\n判断：15% 以上 = 优秀，20%+ = 非常优秀\n注意：ROE 高可能是负债高杠杆驱动，要结合负债率看\n\n2️⃣ 毛利率 — "护城河"\n含义：产品卖出去后，扣除直接成本还剩多少\n判断：40%+ = 有竞争力，70%+ = 强护城河\n注意：毛利率要跟同行比，不同行业差异巨大\n\n3️⃣ 净利率 — "最终赚多少"\n含义：每 100 元收入，最终能变成多少净利润\n判断：10%+ = 不错，20%+ = 优秀',
      },
      {
        heading: '🤖 AI 财务分析实操',
        body: '在 StockMind AI 中，你可以在以下位置查看财务指标：\n• 首页 AI 分析 → 输入股票 → 自动分析 ROE/毛利率/净利率\n• 行业筛选器 → 选择行业 → 按财务指标排名（支持 6 大指标排名）\n• 金字塔评分 → AI 自动计算综合评分\n\n当你看到不理解的指标时，直接问 AI："这个 ROE 是什么意思？好还是不好？"',
      },
      {
        heading: '📊 财务分析框架（AI 自动完成）',
        body: '一个好的财务分析应该包含以下维度——AI 帮你一次性完成：\n✅ 盈利能力：ROE、毛利率、净利率\n✅ 成长能力：营收增长率、利润增长率\n✅ 财务健康：资产负债率、流动比率\n✅ 估值水平：PE、PB 与历史及同行对比\n✅ 现金流：经营现金流是否健康',
      },
      {
        heading: '💡 小结',
        body: '财务指标是投资分析的核心语言。你不需要成为会计，但需要理解几个关键指标的含义。AI 的作用是把这些数字变成你可以理解的判断，但最终"好还是不好"的判断标准，需要你在实践中慢慢积累。',
      },
    ],
  },
  'ch-04': {
    num: '04',
    title: '技术指标入门 — AI 辅助看趋势',
    badge: '技术',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '了解常用的技术指标（均线、MACD、KDJ）的基本原理，学会用 AI 辅助解读技术图表信号，理解技术分析的局限性和正确用法。',
      },
      {
        heading: '📌 技术分析 vs 基本面分析',
        body: '基本面分析 = 研究公司本身"好不好"（财报、行业、管理层）。技术分析 = 研究股价走势"怎么走"（价格、成交量、趋势）。AI 可以辅助做技术分析：计算各种技术指标，识别趋势和形态，生成易懂的信号解读。但请记住：技术指标反映的是过去的价格行为，不等于未来走势。',
      },
      {
        heading: '📈 最常用的三个技术指标',
        body: '1️⃣ 均线（MA）— "趋势线"\n含义：过去 N 天的平均收盘价连成的线\n常用：5日（短期）、20日（中期）、60日（长期）\n信号：股价在均线上方 = 短期趋势偏强\n金叉：短期均线上穿长期均线 → 可能上涨信号\n死叉：短期均线下穿长期均线 → 可能下跌信号\n\n2️⃣ MACD — "动量指标"\n含义：衡量股价上涨/下跌的动能强弱\n组成：快线(DIF)、慢线(DEA)、柱状图\n信号：快线上穿慢线（金叉）→ 动能转强\n\n3️⃣ KDJ — "超买超卖指标"\n含义：判断价格是否涨过头或跌过头\n范围：0-100，K 值 > 80 = 超买（可能回调）\nK 值 < 20 = 超卖（可能反弹）',
      },
      {
        heading: '🤖 AI 如何辅助技术分析',
        body: '目前 StockMind AI 的技术分析能力包括综合计算多指标信号，用自然语言解释技术形态，给出多周期技术面综合判断。你可以用 AI 快速理解当前的技术面状态，而不需要自己盯着 K 线图看。',
      },
      {
        heading: '⚠️ 技术分析的原则',
        body: '1️⃣ 技术指标是工具，不是预言\n2️⃣ 不要单独使用一个指标——多个指标共振更可靠\n3️⃣ 技术分析在震荡市中准确率较低\n4️⃣ 大趋势比小信号更重要（看周线比日线更可靠）\n5️⃣ 永远把基本面放在第一位，技术面辅助进出场时机',
      },
      {
        heading: '💡 小结',
        body: '技术分析是投资工具箱中的一把工具，但不是万能钥匙。建议初学者先掌握基本面分析，再逐步了解技术指标。用 AI 辅助解读技术信号，可以大大降低学习门槛。',
      },
    ],
  },
  'ch-05': {
    num: '05',
    title: '行业对比 — AI 横向扫描',
    badge: '筛选',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '学会用 AI 工具快速对比同行业多只股票的核心指标，找出数据最突出的标的，理解"横向对比"在投资决策中的重要性。',
      },
      {
        heading: '📌 为什么行业对比重要？',
        body: '单独看一家公司的数据没有意义——"好"和"坏"是比较出来的。一家毛利率 40% 的公司放在白酒行业里算差的，但放在零售行业里就是顶尖的。行业对比能帮你回答：这个行业的龙头是谁？这个行业谁最赚钱？这个行业谁最便宜？',
      },
      {
        heading: '🔍 行业对比的核心维度',
        body: 'StockMind AI 的行业筛选器支持六大维度的排名对比。估值维度：PE 排名（低到高）找出被低估的，PB 排名（低到高）找出股价低于资产的。盈利维度：ROE 排名（高到低），毛利率排名（高到低）。市场维度：市值排名（高到低），涨跌幅排名。每个指标卡片都可以看到 Top 30 排名。',
      },
      {
        heading: '🤖 金字塔评分 — AI 综合排名',
        body: '金字塔评分是 StockMind AI 的核心分析工具，它把五个维度的数据综合成一个分数：\n① 估值安全（30%）— PE/PB 越低越好\n② 市值规模（20%）— 大市值更稳定\n③ 市场信号（25%）— 主力资金流向 + 稳定性\n④ 流动性（10%）— 换手率适中\n⑤ 稳定性（15%）— 振幅越小越稳定\n\n评分越高 = 在当前市场环境下综合表现越好。打开筛选器 → 金字塔评分，即可看到全市场 Top 20 排名。',
      },
      {
        heading: '📋 行业对比实操步骤',
        body: '1. 打开 StockMind AI → 筛选器 → 行业排名\n2. 选择一个行业（如"食品饮料"）\n3. 查看六大指标的排名列表\n4. 关注多指标同时排名靠前的股票\n5. 点击感兴趣的股票查看详细财务分析\n\n实战技巧：同时看 ROE + 毛利率 + PE 三个指标：赚钱能力强又不贵的公司，就是好标的。',
      },
      {
        heading: '💡 小结',
        body: '行业对比是筛选优质标的的利器。不需要复杂的模型，用好 AI 的横向对比功能，你可以在几分钟内完成过去需要数小时的研究工作。从"选行业"开始，再到"选股票"，让 AI 帮你大幅缩小研究范围。',
      },
    ],
  },
  'ch-06': {
    num: '06',
    title: '综合判断 — AI 辅助决策框架',
    badge: '决策',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '学会将前面学到的信息收集、数据获取、指标分析整合到一个完整的决策框架中，用 AI 生成分析简报辅助你做出独立的投资判断。',
      },
      {
        heading: '📌 AI 辅助决策的核心原则',
        body: '最重要的原则：AI 不是决策者，你是。AI 的定位是数据收集和整理、指标计算和解读、生成结构化的分析报告。AI 不做买卖建议、不预测涨跌、不承担你的投资风险。记住：你是在"用 AI 做研究"，而不是"让 AI 帮你炒股"。',
      },
      {
        heading: '📋 完整的分析检查清单',
        body: '在做出投资决策前，用 AI 完成以下检查清单：\n\n📡 信息层面\n□ 该公司最近有没有重大公告？\n□ 行业近期有没有政策变化？\n\n📊 数据层面\n□ PE 处于历史什么水平？\n□ ROE 是否连续 3 年 > 15%？\n□ 毛利率是否稳定或提升？\n□ 营收和利润是否同步增长？\n\n🔍 对比层面\n□ 在行业中排名如何？\n□ 龙头 vs 竞争对手的数据差异？\n\n⚖️ 风险层面\n□ 负债率是否过高？\n□ 估值是否远高于同行？',
      },
      {
        heading: '🤖 AI 分析简报模板',
        body: '在 StockMind AI 首页输入股票代码后，AI 会生成一份包含以下内容的结构化分析简报：公司概况（主营业务、行业地位），财务健康（ROE、毛利率、净利率分析），增长趋势（营收/利润变化趋势），估值评估（PE/PB 合理度判断），综合评估（AI 的客观总结）。',
      },
      {
        heading: '🧠 如何做出最终判断',
        body: '在看了 AI 的分析报告后，问自己这几个问题：\n1. 这家公司做的事我理解吗？——不懂的生意不要投\n2. 它的赚钱能力怎么样？——ROE 高不高、稳不稳\n3. 现在价格合理吗？——PE 跟同行比贵不贵\n4. 如果跌了 20% 我慌不慌？——不慌才说明你真的了解它',
      },
      {
        heading: '💡 小结',
        body: '综合判断是投资的最后一步，也是最依赖"人"的一步。AI 可以把所有信息、数据、指标整理成一份清晰的分析报告，但最终"买不买"的决定，需要你对这家公司有足够的了解后自己做。这就是"AI 辅助"的真正含义。',
      },
    ],
  },
  'ch-E': {
    num: 'E',
    title: '实战演练 — 用 AI 分析一只股票完整流程',
    badge: '实战',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '以贵州茅台（600519）为例，完整走一遍 AI 辅助投资分析的全流程：信息收集→数据获取→指标分析→行业对比→综合判断。',
      },
      {
        heading: '📌 实战案例：贵州茅台（600519）',
        body: '我们用 AI 工具完成以下完整的分析流程：\nStep 1: 打开 StockMind AI 首页\nStep 2: 在 AI 分析输入框输入"贵州茅台"或"600519"\nStep 3: 点击分析，等待 AI 生成分析简报\nStep 4: 查看 AI 整理的核心财务数据\nStep 5: 切换到筛选器，选择"食品饮料"行业\nStep 6: 对比茅台在行业中的各项指标排名\nStep 7: 打开金字塔评分，看看茅台的综合评分\nStep 8: 根据自己的理解做出判断',
      },
      {
        heading: '📊 茅台核心数据分析',
        body: '以下是 AI 会为你呈现的茅台核心数据：\n🏆 ROE ≈ 30%+：极其优秀的赚钱效率\n🛡️ 毛利率 ≈ 90%+：几乎无敌的护城河\n💰 净利率 ≈ 50%+：每赚 100 元有 50 元是净利润\n📈 营收增长 ≈ 15%+：持续稳健增长\n⚖️ PE ≈ 30-40：估值中等偏上\n\n这些数据告诉你：茅台是一个盈利能力极强、护城河极深、增长稳健的公司。但"贵不贵"需要你自己判断。',
      },
      {
        heading: '🤖 全流程 AI 工具使用',
        body: '在这个实战过程中，你用了哪些 AI 功能？\n1️⃣ AI 智能分析 → 快速生成个股分析报告\n2️⃣ 行业筛选器 → 按指标排名，横向对比\n3️⃣ 金字塔评分 → 多维度综合评分\n4️⃣ AI 搜索 → 查找和了解感兴趣的股票\n\n整个流程只需要 5-10 分钟，而传统方法需要数小时甚至数天。',
      },
      {
        heading: '📝 实战练习建议',
        body: '学完这个实战后，建议你自己练习分析以下股票：\n• 招商银行（600036）— 银行龙头，看 ROE 和资产质量\n• 宁德时代（300750）— 新能源龙头，看成长性\n• 美的集团（000333）— 家电龙头，看全球化和分红\n• 恒瑞医药（600276）— 医药龙头，看研发投入',
      },
      {
        heading: '🎓 毕业总结',
        body: '恭喜你完成了全部 7 个章节的学习！现在你已经掌握了：用 AI 过滤信息噪音，用 AI 获取真实数据，理解核心财务指标，了解技术分析基础，用 AI 做行业对比，建立自己的决策框架，完整分析一只股票。\n\nAI 工具会不断升级，但分析框架和思维方式是永恒的。\n记得：数据是客观的，但决策是你自己的。祝你在投资路上越走越稳！🚀',
      },
    ],
  },
  'ch-07': {
    num: '07',
    title: 'AI 分析功能拆解 — 数据流与实现逻辑',
    badge: '原理',
    sections: [
      {
        heading: '🎯 本章目标',
        body: '理解 StockMind AI 的 AI 分析功能背后是怎么工作的：数据从哪里来、经过哪些处理、最终如何呈现给用户。掌握这些能帮你更好地利用这个工具。',
      },
      {
        heading: '📡 数据采集层',
        body: 'AI 分析依赖三个数据源：\n\n① 腾讯行情 API（qt.gtimg.cn）：提供实时股价、涨跌幅、成交量、换手率、PE/PB、市值等行情数据\n② 东方财富数据中心：提供财务指标（RoE、毛利率、净利率、EPS）和分红数据\n③ 东方财富 F10：提供公司简介和主营业务描述\n\n所有数据都是公开的、免费的，不需要 API Key。',
      },
      {
        heading: '🔄 数据流流程',
        body: '当你在首页或个股弹窗点击"分析"时，后端执行以下步骤：\n\nStep 1 — 并行请求：同时获取行情数据 + 公司简介 + 财务指标（约 0.5~1 秒）\nStep 2 — 组装 Prompt：将结构化数据填入分析模板（系统角色设定 + 用户数据）\nStep 3 — 调用 LLM：发送给 DeepSeek（或你配置的其他模型）生成分析报告\nStep 4 — 返回前端：将 AI 生成的 Markdown 文本渲染为可读的卡片\n\n整个流程通常在 2~5 秒内完成。',
      },
      {
        heading: '📋 发送给 LLM 的完整数据',
        body: '以贵州茅台为例，大模型每次分析收到以下数据：\n\n【公司简介】\n主营业务：茅台酒及系列酒的生产与销售\n\n【行情数据】\n当前股价: 1268 元 | 涨跌幅: -1.09% | 涨跌额: -13.96 | 昨收: 1281.96 | 开盘: 1275 | 最高: 1280 | 最低: 1260 | 振幅: 1.56% | 成交量: 25836 手 | 成交额: 328560 万元 | 换手率: 0.27% | 市盈率 PE: 19.16 | 市净率 PB: 5.92 | 总市值: 15851 亿\n\n【财务指标】\nRoE 股东权益报酬率: 10.57% | EPS 每股收益: 21.76 | 营业毛利率: 89.76% | 纯益率/净利率: 52.22% | 市盈率 PE: 19.16 | 市净率 PB: 5.92',
      },
      {
        heading: '🤖 LLM 角色设定（System Prompt）',
        body: '每次分析前，系统会设定 AI 的身份：\n\n"你是一个专业的价值投资分析师，擅长用通俗易懂的中文分析 A 股上市公司。请根据提供的财务数据和行情信息，输出结构化的分析报告，包括：公司概览、财务健康、估值判断、优势与风险、综合建议。"\n\n注意：提示词中特别要求"不构成投资建议"和"保持客观"，这是为了确保 AI 的输出合规且中立。',
      },
      {
        heading: '⚙️ 参数配置',
        body: 'AI 分析的参数设置：\n• Temperature（温度）= 0.3：低随机性，确保输出稳定一致\n• Max Tokens = 1500：足够生成完整的分析报告（约 1000 个汉字）\n• 模型：默认 deepseek-chat，可在 .env 中切换为 deepseek-v4-flash 或其它模型\n\n你可以在服务器根目录的 .env 文件中修改这些配置。',
      },
      {
        heading: '📊 数据局限性与未来改进',
        body: '当前 AI 分析的局限性：\n\n① 缺少历史趋势：只发了当期数据，LLM 无法判断指标是变好还是变坏\n② 缺少行业基准：无法做横向对比，只能说"毛利率高"但不知道在行业中排第几\n③ 缺少技术面：没有 K 线、均线、MACD 等图表数据\n④ 靠 LLM 自身知识补全：公司简介来自 API，但如果 API 返回空，LLM 会用自己的训练数据"猜"\n\n未来计划：加入历史趋势对比、行业排名百分位、技术指标评分等功能，让分析更全面。',
      },
    ],
  },
};

function renderCourseDetail(chapterId) {
  const chapter = COURSE_CHAPTERS[chapterId];
  if (!chapter) return;

  const container = document.getElementById('courseDetailContent');
  container.innerHTML = chapter.sections
    .map(
      (s) => `
    <div class="cd-section">
      <h3 class="cd-section__heading">${s.heading}</h3>
      <div class="cd-section__body">${s.body.replace(/\n/g, '<br>')}</div>
    </div>`
    )
    .join('');

  document.getElementById('courseDetailBadge').textContent = chapter.badge;
  document.getElementById('courseDetailBadge').className =
    `cd-badge ${chapter.badge === '信息' || chapter.badge === '决策' || chapter.badge === '实战' ? 'highlight' : ''}`;
  document.getElementById('courseDetailNum').textContent = chapter.num;
  document.getElementById('courseDetailTitle').textContent = chapter.title;
}
