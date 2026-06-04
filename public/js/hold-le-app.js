/* ═══════════════════════════════════════════
   StockMind AI · App Entry — State, Navigation, Events
   ═══════════════════════════════════════════ */
/* globals INDUSTRIES, generateStockDB, generatePyramid,
   renderSidebar, renderMetrics, renderPyramid, showSearchResults */

(function () {
  'use strict';

  // ════════════════════════════════════════════
  // State
  // ════════════════════════════════════════════

  const stockDB = generateStockDB();
  // Expose for UI layer's findStock()
  window.__stockDB = stockDB;
  const allStocks = Object.values(stockDB).flat();

  let currentView = 'home';
  let selectedIndustry = null;
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

    if (view === 'pyramid') fetchAndRenderPyramid();
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

  // Chapter item clicks → course detail
  document.querySelectorAll('.chapter-item').forEach((item) => {
    item.addEventListener('click', () => {
      const chapterId = item.dataset.chapter;
      if (chapterId) {
        renderCourseDetail(chapterId);
        switchView('course-detail');
      }
    });
  });
  // Back button
  document
    .getElementById('courseDetailBack')
    .addEventListener('click', () => switchView('courses'));

  // Listing year filter
  document.getElementById('listingFilterA').addEventListener('change', () => {
    if (currentView === 'a-share' && selectedIndustry) {
      window.app.selectIndustry(selectedIndustry);
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

  let lastAiQuery = ''; // 用于重新请求

  // 全局重新请求（被 onclick 调用）
  window.retryAiAnalysis = function (q) {
    lastAiQuery = q;
    runHomeAiAnalysis(q);
  };

  function findStockByQuery(query) {
    const q = query.trim().toLowerCase();
    return allStocks.find((s) => s.code.includes(q) || s.name.toLowerCase().includes(q)) || null;
  }

  // 构建指标列表（仅含可用字段）
  function buildMetricsSimple(data) {
    const m = [];
    if (data.roe != null) m.push({ label: 'RoE 股东权益报酬率', value: `${data.roe}%` });
    if (data.eps != null) m.push({ label: 'EPS 每股收益', value: `${data.eps}` });
    if (data.grossMargin != null) m.push({ label: '营业毛利率', value: `${data.grossMargin}%` });
    if (data.opMargin != null) m.push({ label: '营业利益率', value: `${data.opMargin}%` });
    if (data.netMargin != null) m.push({ label: '纯益率/净利率', value: `${data.netMargin}%` });
    if (data.dividendRate != null) m.push({ label: '分红率', value: `${data.dividendRate}%` });
    if (data.pe != null) m.push({ label: '市盈率 PE', value: `${data.pe}` });
    if (data.pb != null) m.push({ label: '市净率 PB', value: `${data.pb}` });
    return m.length ? m : [{ label: '暂无可用财务数据', value: '' }];
  }

  async function runHomeAiAnalysis(query) {
    lastAiQuery = query;
    const stock = findStockByQuery(query);
    if (!stock) {
      // 尝试从 API 搜索
      const apiResults = await fetchSearchResults(query);
      if (apiResults && apiResults.length) {
        const s = apiResults[0];
        // 用 API 搜索到的代码继续分析
        const detail = await fetchRealStockDetail(s.code);
        const metrics = detail ? buildMetricsSimple(detail) : [];

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
            const errData = await res.json().catch(() => ({ error: '请求失败' }));
            statusEl.className = 'status error';
            statusEl.textContent = '❌ 分析失败';
            if (bodyEl) {
              bodyEl.className = 'ai-result-body';
              bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ ${errData.error || 'AI 分析暂时不可用'}</span>
                <button class="btn btn-primary" style="margin-top:12px;font-size:13px" onclick="retryAiAnalysis('${query.replace(/'/g, "\\'")}')">🔄 重新请求</button>`;
            }
          }
        } catch (err) {
          const statusEl = homeAiResult.querySelector('.status');
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = '❌ 网络错误';
          }
          const bodyEl = homeAiResult.querySelector('.ai-result-body');
          if (bodyEl) {
            bodyEl.innerHTML += `<br><button class="btn btn-primary" style="margin-top:12px;font-size:13px" onclick="retryAiAnalysis('${query.replace(/'/g, "\\'")}')">🔄 重新请求</button>`;
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
          metrics: buildMetricsSimple(stock),
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
          bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ ${err.error || 'AI 分析暂时不可用'}</span>
            <button class="btn btn-primary" style="margin-top:12px;font-size:13px" onclick="retryAiAnalysis('${lastAiQuery.replace(/'/g, "\\'")}')">🔄 重新请求</button>`;
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
        bodyEl.innerHTML = `<span style="color:var(--red-text)">⚠️ 网络错误：${err.message}</span>
          <button class="btn btn-primary" style="margin-top:12px;font-size:13px" onclick="retryAiAnalysis('${lastAiQuery.replace(/'/g, "\\'")}')">🔄 重新请求</button>`;
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
