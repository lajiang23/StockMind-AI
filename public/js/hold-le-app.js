/* ═══════════════════════════════════════════
   StockMind AI · App Entry — State, Navigation, Events
   ═══════════════════════════════════════════ */
/* globals INDUSTRIES, generateStockDB, generatePyramid,
   renderSidebar, renderMetrics, renderPyramid, renderContrast, showSearchResults */

(function () {
  'use strict';

  // ════════════════════════════════════════════
  // State
  // ════════════════════════════════════════════

  const stockDB = generateStockDB();
  // Expose for UI layer's findStock()
  window.__stockDB = stockDB;
  const allStocks = Object.values(stockDB).flat();
  const pyramidData = generatePyramid();

  let currentView = 'home';
  let selectedIndustry = null;
  let contrastStocks = [];
  // 跟踪当前使用的数据源模式：'real' | 'mock' | null
  let dataMode = null;

  // Expose state mutators so UI layer can call back
  window.app = {
    async selectIndustry(id) {
      selectedIndustry = id;
      renderSidebar(selectedIndustry);

      // 尝试加载真实数据
      showLoading(
        'aShareMetrics',
        `正在获取 ${INDUSTRIES.find((i) => i.id === id)?.name || ''} 行业数据...`
      );
      document.getElementById('aShareSub').textContent = '加载中...';

      const realData = await fetchRealIndustryStocks(id);
      if (realData && realData.stocks && realData.stocks.length) {
        dataMode = 'real';
        renderMetricsReal(selectedIndustry, realData);
      } else {
        // 回退到 Mock 数据
        dataMode = 'mock';
        renderMetrics(selectedIndustry, stockDB);
      }
    },
    removeContrastStock(code) {
      contrastStocks = contrastStocks.filter((s) => s.code !== code);
      renderContrast(contrastStocks);
    },
  };

  // ════════════════════════════════════════════
  // Navigation
  // ════════════════════════════════════════════

  function switchView(view) {
    currentView = view;

    document.querySelectorAll('.view-section').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById(`view-${view}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.navbar__link').forEach((l) => {
      l.classList.toggle('active', l.dataset.view === view);
    });
    document.querySelectorAll('.dropdown__item').forEach((l) => {
      l.classList.toggle('active', l.dataset.view === view);
    });

    document.getElementById('filterDropdown').classList.remove('open');

    const sidebar = document.getElementById('sidebar');
    if (view === 'a-share') {
      sidebar.style.display = 'block';
      selectedIndustry = null;
      renderSidebar(selectedIndustry);
      document.getElementById('aShareMetrics').innerHTML =
        `<div class="empty-state"><div class="icon">📊</div><p>请从左侧选择一个行业查看财务数据</p></div>`;
      document.getElementById('aShareSub').textContent = '请从左侧选择一个行业';
    } else {
      sidebar.style.display = 'none';
    }

    if (view === 'pyramid') renderPyramid(pyramidData);
    if (view === 'contrast') renderContrast(contrastStocks);
  }

  // ════════════════════════════════════════════
  // Event Bindings
  // ════════════════════════════════════════════

  // Dropdown toggle
  const dd = document.getElementById('filterDropdown');
  document.querySelector('.dropdown__trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    dd.classList.toggle('open');
  });
  document.addEventListener('click', () => dd.classList.remove('open'));

  // Nav links
  document.querySelectorAll('.dropdown__item').forEach((item) => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
  document.querySelectorAll('.navbar__link').forEach((link) => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });
  // Home CTA → courses
  document.querySelector('.cta-home .btn')?.addEventListener('click', () => switchView('courses'));

  // Listing year filter
  document.getElementById('listingFilterA').addEventListener('change', () => {
    if (currentView === 'a-share' && selectedIndustry) {
      window.app.selectIndustry(selectedIndustry);
    }
  });

  // Contrast search
  const contrastInput = document.getElementById('contrastInput');
  contrastInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && contrastInput.value.trim()) {
      e.preventDefault();
      const query = contrastInput.value.trim().toLowerCase();
      const match = allStocks.find((s) => s.code.includes(query) || s.name.includes(query));
      if (match) {
        if (contrastStocks.length >= 5) {
          alert('最多对比 5 只股票');
        } else if (!contrastStocks.find((s) => s.code === match.code)) {
          contrastStocks.push(match);
          renderContrast(contrastStocks);
        }
        contrastInput.value = '';
      } else {
        alert('未找到该股票');
      }
    }
  });

  // Global search — real API with mock fallback
  const searchInput = document.getElementById('globalSearch');
  const searchOverlay = document.getElementById('searchOverlay');
  let searchDebounce = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) {
      searchOverlay.classList.remove('open');
      return;
    }

    searchDebounce = setTimeout(async () => {
      // 先尝试 API 搜索
      const apiResults = await fetchSearchResults(q);
      if (apiResults.length) {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = apiResults
          .map(
            (s) =>
              `<div class="search-overlay__item" data-code="${s.code}">
            <div>
              <span class="name">${s.name}</span>
              <span class="code">${s.code}</span>
            </div>
            <span style="font-size:12px;color:var(--text-tertiary)">${s.market || ''}</span>
          </div>`
          )
          .join('');
        searchResults.querySelectorAll('.search-overlay__item').forEach((item) => {
          item.addEventListener('click', async () => {
            const code = item.dataset.code;
            const name = item.querySelector('.name').textContent;
            const detail = await fetchRealStockDetail(code);
            showStockModal(detail || { code, name });
            searchOverlay.classList.remove('open');
            document.getElementById('globalSearch').blur();
          });
        });
        searchOverlay.classList.add('open');
      } else {
        // 回退到本地 Mock 数据搜索
        showSearchResults(q, allStocks);
      }
    }, 300);
  });

  // focus 事件保留原行为
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.navbar__search')) {
      searchOverlay.classList.remove('open');
    }
  });

  // ════════════════════════════════════════════
  // 首页 AI 智能分析
  // ════════════════════════════════════════════

  const homeAiInput = document.getElementById('homeAiSearch');
  const homeAiBtn = document.getElementById('homeAiSearchBtn');
  const homeAiResult = document.getElementById('homeAiResult');

  function findStockByQuery(query) {
    const q = query.trim().toLowerCase();
    return allStocks.find((s) => s.code.includes(q) || s.name.toLowerCase().includes(q)) || null;
  }

  async function runHomeAiAnalysis(query) {
    const stock = findStockByQuery(query);
    if (!stock) {
      // 尝试从 API 搜索
      const apiResults = await fetchSearchResults(query);
      if (apiResults && apiResults.length) {
        const s = apiResults[0];
        // 用 API 搜索到的代码继续分析
        const detail = await fetchRealStockDetail(s.code);
        const metrics = detail
          ? [
              { label: 'RoE 股东权益报酬率', value: detail.roe != null ? `${detail.roe}%` : '—' },
              {
                label: '现金与约当现金比率',
                value: detail.cashRatio != null ? `${detail.cashRatio}%` : '—',
              },
              {
                label: '营业毛利率',
                value: detail.grossMargin != null ? `${detail.grossMargin}%` : '—',
              },
              { label: '营业利益率', value: detail.opMargin != null ? `${detail.opMargin}%` : '—' },
              {
                label: '纯益率/净利率',
                value: detail.netMargin != null ? `${detail.netMargin}%` : '—',
              },
              {
                label: '分红率',
                value: detail.dividendRate != null ? `${detail.dividendRate}%` : '—',
              },
            ]
          : [];

        homeAiResult.innerHTML = `
          <div class="ai-result-card">
            <div class="ai-result-header">
              <div>
                <h3>${s.name} <span class="sub">${s.code}</span></h3>
              </div>
              <div class="status loading">⏳ 正在分析...</div>
            </div>
            <div class="ai-result-body ai-muted">正在获取数据并生成分析报告，请稍候...</div>
          </div>`;
        homeAiResult.classList.add('open');
        homeAiBtn.disabled = true;

        try {
          const res = await fetch('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: s.code, name: s.name, metrics }),
          });
          const statusEl = homeAiResult.querySelector('.status');
          const bodyEl = homeAiResult.querySelector('.ai-result-body');
          if (res.ok) {
            const data = await res.json();
            statusEl.className = 'status done';
            statusEl.textContent = '✅ 分析完成';
            if (bodyEl) bodyEl.innerHTML = formatAiAnalysis(data.analysis || '未能生成分析报告');
          } else {
            statusEl.className = 'status error';
            statusEl.textContent = '❌ 分析失败';
            if (bodyEl)
              bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ AI 分析暂时不可用</span>`;
          }
        } catch (err) {
          const statusEl = homeAiResult.querySelector('.status');
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = '❌ 网络错误';
          }
        }
        homeAiBtn.disabled = false;
        return;
      }

      homeAiResult.innerHTML = `
        <div class="ai-result-card">
          <div class="ai-result-header">
            <div>
              <h3>未找到</h3>
              <div class="sub">请尝试输入股票代码（如 600519）或名称</div>
            </div>
            <div class="status error">❌ 无匹配</div>
          </div>
        </div>`;
      homeAiResult.classList.add('open');
      return;
    }

    homeAiResult.innerHTML = `
      <div class="ai-result-card">
        <div class="ai-result-header">
          <div>
            <h3>${stock.name} <span class="sub">${stock.code}</span></h3>
          </div>
          <div class="status loading">⏳ 正在分析...</div>
        </div>
        <div class="ai-result-body ai-muted">正在获取数据并生成分析报告，请稍候...</div>
      </div>`;
    homeAiResult.classList.add('open');
    homeAiBtn.disabled = true;

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: stock.code,
          name: stock.name,
          metrics: [
            { label: 'RoE 股东权益报酬率', value: `${stock.roe || 0}%` },
            { label: '现金与约当现金比率', value: `${stock.cashRatio || 0}%` },
            { label: '营业毛利率', value: `${stock.grossMargin || 0}%` },
            { label: '营业利益率', value: `${stock.opMargin || 0}%` },
            { label: '纯益率/净利率', value: `${stock.netMargin || 0}%` },
            { label: '分红率', value: `${stock.dividendRate || 0}%` },
          ],
        }),
      });

      const statusEl = homeAiResult.querySelector('.status');
      const bodyEl = homeAiResult.querySelector('.ai-result-body');

      if (res.ok) {
        const data = await res.json();
        statusEl.className = 'status done';
        statusEl.textContent = '✅ 分析完成';
        if (bodyEl) {
          bodyEl.innerHTML = formatAiAnalysis(data.analysis || '未能生成分析报告');
        }
      } else {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        statusEl.className = 'status error';
        statusEl.textContent = '❌ 分析失败';
        if (bodyEl) {
          bodyEl.className = 'ai-result-body';
          bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ ${err.error || 'AI 分析暂时不可用'}</span>`;
        }
      }
    } catch (err) {
      const statusEl = homeAiResult.querySelector('.status');
      const bodyEl = homeAiResult.querySelector('.ai-result-body');
      if (statusEl) {
        statusEl.className = 'status error';
        statusEl.textContent = '❌ 网络错误';
      }
      if (bodyEl) {
        bodyEl.className = 'ai-result-body';
        bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ 网络错误：${err.message}</span>`;
      }
    }

    homeAiBtn.disabled = false;
  }

  function formatAiAnalysis(text) {
    if (!text) return '<span class="ai-muted">无分析结果</span>';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  // Events
  homeAiBtn.addEventListener('click', () => {
    const q = homeAiInput.value.trim();
    if (q) runHomeAiAnalysis(q);
  });
  homeAiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = homeAiInput.value.trim();
      if (q) runHomeAiAnalysis(q);
    }
  });

  // Hint tags
  document.querySelectorAll('.ai-hint-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const name = tag.dataset.stock;
      homeAiInput.value = name;
      runHomeAiAnalysis(name);
    });
  });

  // ════════════════════════════════════════════
  // Init
  // ════════════════════════════════════════════

  document.getElementById('sidebar').style.display = 'none';
  renderSidebar(selectedIndustry);

  // Badge tooltip
  document.querySelectorAll('.badge-member').forEach((el) => {
    el.title = '此功能需要登录（会员功能）';
  });

  console.log('🔧 StockMind AI 平台已加载');
  console.log('📊 设计风格: Apple Inspired · 色板: #0071e3');
})();
