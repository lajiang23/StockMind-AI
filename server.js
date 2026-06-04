const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const app = express();
const PORT = 3456;

// ===== AI 服务 =====
require('dotenv').config();
const jwt = require('jsonwebtoken');
const aiService = require('./services/ai-service');
const stockData = require('./services/stock-data');
const eastmoney = require('./services/eastmoney');

const CC_ROOT = 'E:\\CC';
const PROJECTS_FILE = path.join(CC_ROOT, 'projects', 'projects.json');

// Directories to always skip during scans
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'venv',
  '.claude',
  '__pycache__',
  '.gitkeep',
  'trash',
  'workstation', // 本项目自身代码，不作为知识
  'tarot-heart', // 独立项目代码，部署指南已移入 05-项目文档
  'screenshots',
  'sketches',
  'tools',
]);

// File extensions considered as "knowledge documents"
const KNOWLEDGE_EXTS = new Set(['.html', '.md', '.htm']);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS for file:// access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ===== HELPERS =====

function ensureProjectsFile() {
  const dir = path.dirname(PROJECTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(PROJECTS_FILE, '[]', 'utf-8');
  }
}

function loadProjects() {
  ensureProjectsFile();
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch (err) {
    console.error(`[ERR] 无法加载 projects.json: ${err.message}`);
    // 尝试加载备份
    const bak = PROJECTS_FILE + '.bak';
    if (fs.existsSync(bak)) {
      try {
        const data = JSON.parse(fs.readFileSync(bak, 'utf-8'));
        console.log('[OK] 已从备份恢复');
        return data;
      } catch (e2) {
        console.error(`[ERR] 备份文件也损坏: ${e2.message}`);
      }
    }
    return [];
  }
}

function saveProjects(projects) {
  ensureProjectsFile();
  // 先写备份，再写主文件 —— 防止中途崩溃导致文件损坏
  const raw = JSON.stringify(projects, null, 2);
  fs.writeFileSync(PROJECTS_FILE + '.bak', raw, 'utf-8');
  fs.writeFileSync(PROJECTS_FILE, raw, 'utf-8');
}

// ===== PROJECTS API =====

// GET /api/projects — load all projects
app.get('/api/projects', (req, res) => {
  try {
    res.json(loadProjects());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects — save all projects (full replace)
app.post('/api/projects', (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an array' });
    }
    saveProjects(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/scan — scan E:\CC for directories that look like projects
app.get('/api/projects/scan', (req, res) => {
  try {
    const projects = loadProjects();
    const dirs = fs
      .readdirSync(CC_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name) && !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: path.join(CC_ROOT, d.name) }));
    res.json({ directories: dirs, projectCount: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== KNOWLEDGE BASE (existing) =====

// Track deleted items
const DELETED_FILE = path.join(__dirname, 'deleted.json');
let deletedSet = new Set();

function loadDeleted() {
  try {
    const raw = fs.readFileSync(DELETED_FILE, 'utf-8');
    deletedSet = new Set(JSON.parse(raw));
  } catch {
    deletedSet = new Set();
  }
}
function saveDeleted() {
  fs.writeFileSync(DELETED_FILE, JSON.stringify([...deletedSet]), 'utf-8');
}
loadDeleted();

function shouldSkipDir(dirname) {
  return SKIP_DIRS.has(dirname.toLowerCase()) || SKIP_DIRS.has(dirname);
}

function scanKnowledge() {
  const result = {};

  function walk(dir, relativeRoot) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(CC_ROOT, fullPath);

      if (entry.isDirectory()) {
        if (shouldSkipEntry(entry.name, fullPath)) {
          continue;
        }
        walk(fullPath, relativeRoot || entry.name);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!KNOWLEDGE_EXTS.has(ext)) {
          continue;
        }
        if (deletedSet.has(relPath)) {
          continue;
        }

        const category = relativeRoot || '未分类';
        if (!result[category]) {
          result[category] = [];
        }

        const stats = fs.statSync(fullPath);
        result[category].push({
          name: path.basename(entry.name, ext),
          ext,
          path: fullPath,
          relPath,
          size: stats.size,
          modified: stats.mtime,
        });
      }
    }
  }

  function shouldSkipEntry(name, fullPath) {
    if (shouldSkipDir(name)) {
      return true;
    }
    const parts = fullPath.split(path.sep);
    for (const p of parts) {
      if (p.toLowerCase() === 'node_modules' || p.toLowerCase() === 'venv') {
        return true;
      }
    }
    return false;
  }

  walk(CC_ROOT, null);

  for (const cat of Object.keys(result)) {
    result[cat].sort((a, b) => new Date(b.modified) - new Date(a.modified));
  }

  return result;
}

app.get('/api/knowledge', (req, res) => {
  try {
    const data = scanKnowledge();
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ categories: data, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scan', (req, res) => {
  try {
    const data = scanKnowledge();
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ categories: data, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/knowledge/delete', (req, res) => {
  const { relPath } = req.body;
  if (!relPath) {
    return res.status(400).json({ error: 'Missing relPath' });
  }
  try {
    deletedSet.add(relPath);
    saveDeleted();
    const fullPath = path.join(CC_ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      const trashDir = path.join(CC_ROOT, 'trash', 'knowledge');
      fs.mkdirSync(trashDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const trashPath = path.join(trashDir, `${timestamp}_${path.basename(fullPath)}`);
      fs.renameSync(fullPath, trashPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/knowledge/deleted', (req, res) => {
  res.json({ deleted: [...deletedSet] });
});

// ===== FILE VIEWER =====

app.get('/view/*', (req, res) => {
  const relPath = req.params[0];
  const fullPath = path.join(CC_ROOT, relPath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(CC_ROOT))) {
    return res.status(403).send('Forbidden');
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(resolved);
});

// ===== StockMind AI 股票平台 =====
app.get('/hold-le', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hold-le.html'));
});

// ===== AI 分析 API =====

// 频率限制：AI 接口按 IP 限频
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' },
});

/**
 * POST /api/ai/analyze
 * 个股 AI 分析简报（同步返回）
 * Body: { code, name, metrics }
 */
app.post('/api/ai/analyze', aiLimiter, async (req, res) => {
  const { code, name, metrics } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: '缺少股票代码或名称' });
  }

  try {
    const [quote, profile] = await Promise.all([
      eastmoney.fetchQuote(code).catch(() => null),
      eastmoney.fetchCompanyProfile(code).catch(() => null),
    ]);

    const analysis = await aiService.analyzeStock({ code, name, quote, profile, metrics });
    res.json({ code, name, analysis });
  } catch (err) {
    console.error('[AI] 分析失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/analyze/stream
 * 个股 AI 分析 — 流式返回（按行写入）
 * Body: { code, name, metrics }
 */
app.post('/api/ai/analyze/stream', aiLimiter, async (req, res) => {
  const { code, name, metrics } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: '缺少股票代码或名称' });
  }

  try {
    let quote = null;
    try {
      quote = await stockData.fetchEastMoneyQuote(code);
    } catch {
      /* ignore */
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write(`🔍 正在分析 ${name}（${code}）...\n\n`);

    const analysis = await aiService.analyzeStock({ code, name, quote, metrics });
    res.write(analysis);
    res.end();
  } catch (err) {
    console.error('[AI] 分析失败:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/ai/ask
 * AI 问答助手
 * Body: { question, stockName?, userLevel? }
 */
app.post('/api/ai/ask', aiLimiter, async (req, res) => {
  const { question, stockName, userLevel } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: '请输入问题' });
  }

  try {
    const answer = await aiService.askQuestion(question, { stockName, userLevel });
    if (req.user && !req.user.isMember) {
      recordAIUsage(req.user.id);
    }
    res.json({ answer });
  } catch (err) {
    console.error('[AI] 问答失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ai/status
 * 检查 AI 服务配置状态
 */
app.get('/api/ai/status', (req, res) => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasBaseURL = !!process.env.OPENAI_BASE_URL;

  const providerInfo = hasAnthropic
    ? 'Anthropic Claude'
    : hasBaseURL && process.env.OPENAI_BASE_URL.includes('deepseek')
      ? 'DeepSeek'
      : hasBaseURL && process.env.OPENAI_BASE_URL.includes('siliconflow')
        ? '硅基流动'
        : hasBaseURL && process.env.OPENAI_BASE_URL.includes('dashscope')
          ? '通义千问'
          : hasOpenAI
            ? 'OpenAI 兼容接口'
            : '未配置';

  const configured = hasAnthropic || hasOpenAI;

  res.json({
    configured,
    provider: providerInfo,
    model: process.env.AI_MODEL || 'deepseek-chat',
    baseURL: process.env.OPENAI_BASE_URL || '—',
    message: configured
      ? `✅ AI 已就绪（${providerInfo}）`
      : '⚠️ 未配置 API Key。国内推荐 DeepSeek（新用户免费 500 万 tokens），注册后设置 .env 中的 OPENAI_API_KEY + OPENAI_BASE_URL',
  });
});

// ===== 东方财富 A 股数据 API =====

const industryRateLimit = rateLimit({ windowMs: 1000, max: 5, message: { error: '请求过快' } });

// 行业列表缓存（减少东方财富 API 请求次数）
let industriesCache = null;
let industriesCacheTime = 0;
const INDUSTRIES_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * GET /api/stocks/industries
 * 获取所有行业列表（含实时股票数量）
 */
app.get('/api/stocks/industries', async (req, res) => {
  try {
    if (industriesCache && Date.now() - industriesCacheTime < INDUSTRIES_CACHE_TTL) {
      return res.json({ industries: industriesCache });
    }

    const entries = Object.entries(eastmoney.INDUSTRY_MAP);
    const list = [];

    // 分批请求，每批之间加延迟避免被限
    for (let i = 0; i < entries.length; i++) {
      const [id, ind] = entries[i];
      try {
        const data = await eastmoney.fetchStocksByIndustry(id, 1);
        list.push({ id, name: ind.name, count: data?.total || data?.count || 0 });
      } catch {
        list.push({ id, name: ind.name, count: 0 });
      }
      // 每 5 个请求延迟 1 秒避免触发限流
      if (i > 0 && i % 5 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    list.sort((a, b) => b.count - a.count);
    industriesCache = list;
    industriesCacheTime = Date.now();
    res.json({ industries: list });
  } catch (err) {
    console.error('[eastmoney] 获取行业列表失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stocks/industry/:id?pageSize=100
 * 获取指定行业成分股及实时行情
 */
app.get('/api/stocks/industry/:id', industryRateLimit, async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize) || 100, 500);
    const data = await eastmoney.fetchStocksByIndustry(req.params.id, pageSize);
    if (!data) {
      return res.status(404).json({ error: '行业数据获取失败' });
    }
    res.json(data);
  } catch (err) {
    console.error(`[eastmoney] 获取 ${req.params.id} 行业失败:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stocks/pyramid?count=50
 * 金字塔评分排行榜 — 多维度评分 + 真实数据排名
 */
app.get('/api/stocks/pyramid', async (req, res) => {
  const targetCount = Math.min(parseInt(req.query.count) || 80, 200);

  try {
    const industries = Object.entries(eastmoney.INDUSTRY_MAP).slice(0, 50);
    const allStocks = [];

    // 分批拉取（每批 3 个行业，避免限流）
    for (let i = 0; i < industries.length; i += 3) {
      const batch = industries.slice(i, i + 3);
      const results = await Promise.allSettled(
        batch.map(([id]) => eastmoney.fetchStocksByIndustry(id, 20))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.stocks) {
          allStocks.push(...r.value.stocks.map((s) => ({ ...s, industry: r.value.industryName })));
        }
      }
      if (i + 3 < industries.length) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (allStocks.length === 0) {
      // 真实数据不可用 → 返回模拟数据兜底
      const mockIndustries = [
        '消费',
        '科技',
        '金融',
        '医药',
        '制造',
        '能源',
        '材料',
        '地产',
        '传媒',
        '化工',
      ];
      const stocks = [
        { name: '贵州茅台', code: '600519', industry: '消费' },
        { name: '宁德时代', code: '300750', industry: '制造' },
        { name: '招商银行', code: '600036', industry: '金融' },
        { name: '美的集团', code: '000333', industry: '消费' },
        { name: '迈瑞医疗', code: '300760', industry: '医药' },
        { name: '五粮液', code: '000858', industry: '消费' },
        { name: '恒瑞医药', code: '600276', industry: '医药' },
        { name: '比亚迪', code: '002594', industry: '制造' },
        { name: '伊利股份', code: '600887', industry: '消费' },
        { name: '海康威视', code: '002415', industry: '科技' },
        { name: '药明康德', code: '603259', industry: '医药' },
        { name: '万华化学', code: '600309', industry: '化工' },
        { name: '中芯国际', code: '688981', industry: '科技' },
        { name: '兴业银行', code: '601166', industry: '金融' },
        { name: '隆基绿能', code: '601012', industry: '能源' },
        { name: '中国平安', code: '601318', industry: '金融' },
        { name: '长江电力', code: '600900', industry: '能源' },
        { name: '格力电器', code: '000651', industry: '消费' },
        { name: '中兴通讯', code: '000063', industry: '科技' },
        { name: '紫金矿业', code: '601899', industry: '材料' },
        { name: '三一重工', code: '600031', industry: '制造' },
        { name: '中国中免', code: '601888', industry: '消费' },
        { name: '海尔智家', code: '600690', industry: '消费' },
        { name: '万科A', code: '000002', industry: '地产' },
        { name: '中航光电', code: '002179', industry: '制造' },
        { name: '科大讯飞', code: '002230', industry: '科技' },
        { name: '洋河股份', code: '002304', industry: '消费' },
        { name: '东方财富', code: '300059', industry: '金融' },
        { name: '昆仑万维', code: '300418', industry: '传媒' },
        { name: '华大基因', code: '300676', industry: '医药' },
        { name: '天合光能', code: '688599', industry: '能源' },
        { name: '金山办公', code: '688111', industry: '科技' },
      ];
      const mock = stocks.map((s, i) => {
        const a = 0.7 + Math.random() * 0.3;
        const b = 0.6 + Math.random() * 0.4;
        const c = 0.5 + Math.random() * 0.5;
        const d = 0.3 + Math.random() * 0.7;
        const e = 0.4 + Math.random() * 0.6;
        const score = Math.round((a * 0.3 + b * 0.2 + c * 0.25 + d * 0.1 + e * 0.15) * 100);
        return {
          rank: i + 1,
          code: s.code,
          name: s.name,
          industry: s.industry,
          price: +(Math.random() * 100 + 10).toFixed(2),
          changePercent: +((Math.random() - 0.5) * 8).toFixed(2),
          marketCap: Math.round(Math.random() * 5000 + 200),
          pe: +(Math.random() * 30 + 5).toFixed(1),
          pb: +(Math.random() * 8 + 0.5).toFixed(1),
          turnoverRate: +(Math.random() * 5 + 0.5).toFixed(2),
          mainForceRatio: +(Math.random() * 10 - 5).toFixed(2),
          roe: +(Math.random() * 25 + 3).toFixed(1),
          grossMargin: +(Math.random() * 30 + 20).toFixed(1),
          netMargin: +(Math.random() * 15 + 3).toFixed(1),
          eps: +(Math.random() * 5 + 0.5).toFixed(2),
          score,
          dimensions: {
            valuation: Math.round(a * 100),
            scale: Math.round(b * 100),
            momentum: Math.round(c * 100),
            turnover: Math.round(d * 100),
            stability: Math.round(e * 100),
          },
          _mock: true,
        };
      });
      mock.sort((a, b) => b.score - a.score);
      const topMock = mock.slice(0, targetCount);
      topMock.forEach((s, i) => {
        s.rank = i + 1;
      });
      return res.json({ stocks: topMock, total: topMock.length, mock: true });
    }

    // 提取各指标分布，用于百分位打分
    const vals = {
      pe: allStocks.map((s) => s.pe).filter((v) => v > 0 && v < 200),
      pb: allStocks.map((s) => s.pb).filter((v) => v > 0 && v < 50),
      marketCap: allStocks.map((s) => s.marketCap).filter((v) => v > 0),
      turnoverRate: allStocks.map((s) => s.turnoverRate).filter((v) => v > 0),
      mainForceRatio: allStocks.map((s) => s.mainForceRatio).filter((v) => v !== null),
      amplitude: allStocks.map((s) => s.amplitude).filter((v) => v > 0),
    };

    function percentile(arr, value, higherIsBetter = true) {
      if (arr.length < 5 || value === null || value === undefined) {
        return 50;
      }
      const count = arr.filter((v) => (higherIsBetter ? v <= value : v >= value)).length;
      const pct = (count / arr.length) * 100;
      return Math.min(100, Math.max(0, pct));
    }

    // 评分计算
    const scored = allStocks.map((s) => {
      const scorePE = percentile(vals.pe, s.pe, false); // PE 越低越好
      const scorePB = percentile(vals.pb, s.pb, false); // PB 越低越好
      const scoreCap = percentile(vals.marketCap, s.marketCap, true); // 市值越大越好
      const scoreTurnover =
        100 - Math.abs(50 - percentile(vals.turnoverRate, s.turnoverRate, true)); // 换手适中最好
      const scoreForce = percentile(vals.mainForceRatio, s.mainForceRatio, true); // 主力净流入越好
      const scoreStability = 100 - percentile(vals.amplitude, s.amplitude, true); // 振幅小更稳定

      // 五维评分（归一化到 0-100）
      const dimensions = {
        valuation: Math.round(scorePE * 0.5 + scorePB * 0.5), // 估值安全
        scale: Math.round(scoreCap), // 市值规模
        momentum: Math.round(scoreForce * 0.6 + scoreStability * 0.4), // 市场信号
        turnover: Math.round(scoreTurnover), // 流动性
        stability: Math.round(scoreStability), // 稳定性
      };

      // 总分（加权）
      const total = Math.round(
        dimensions.valuation * 0.3 +
          dimensions.scale * 0.2 +
          dimensions.momentum * 0.25 +
          dimensions.turnover * 0.1 +
          dimensions.stability * 0.15
      );

      return {
        code: s.code,
        name: s.name,
        price: s.price,
        changePercent: s.changePercent,
        marketCap: s.marketCap,
        pe: s.pe,
        pb: s.pb,
        turnoverRate: s.turnoverRate,
        mainForceRatio: s.mainForceRatio,
        industry: s.industry,
        score: total,
        dimensions,
      };
    });

    // 按总分排序取 TopN
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, targetCount).map((s, i) => ({ ...s, rank: i + 1 }));

    // 异步获取 top20 的详细财务指标
    try {
      const top20 = top.slice(0, 20);
      const metricsResults = await Promise.allSettled(
        top20.map((s) => eastmoney.fetchStockMetrics(s.code))
      );
      metricsResults.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          top20[i].roe = r.value.roe;
          top20[i].grossMargin = r.value.grossMargin;
          top20[i].netMargin = r.value.netMargin;
          top20[i].eps = r.value.eps;
        }
      });
    } catch {
      /* 财务指标为增量信息，失败不影响榜单 */
    }

    res.json({ stocks: top, total: top.length });
  } catch (err) {
    console.error('[Pyramid] 评分失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stocks/quote/:code
 * 获取单只股票实时行情
 */
app.get('/api/stocks/quote/:code', async (req, res) => {
  try {
    const data = await eastmoney.fetchQuote(req.params.code);
    if (!data) {
      return res.status(404).json({ error: '查询无结果' });
    }
    res.json(data);
  } catch (err) {
    console.error(`[eastmoney] 获取 ${req.params.code} 行情失败:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stocks/metrics/:code
 * 获取个股综合财务指标（财务+行情+分红）
 */
app.get('/api/stocks/metrics/:code', async (req, res) => {
  try {
    const data = await eastmoney.fetchStockMetrics(req.params.code);
    if (!data) {
      return res.status(404).json({ error: '指标获取失败' });
    }
    res.json(data);
  } catch (err) {
    console.error(`[eastmoney] 获取 ${req.params.code} 指标失败:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stocks/search?q=keyword
 * 搜索股票
 */
app.get('/api/stocks/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 1) {
      return res.json({ results: [] });
    }
    const results = await eastmoney.searchStock(q);
    res.json({ results });
  } catch (err) {
    console.error(`[eastmoney] 搜索 ${req.query.q} 失败:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/market/overview
 * 市场指数概览（上证、深证、创业板、科创50）
 */
app.get('/api/market/overview', async (req, res) => {
  try {
    const data = await eastmoney.fetchMarketOverview();
    res.json({ indices: data });
  } catch (err) {
    console.error('[eastmoney] 获取市场概况失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== CURRENCY EXCHANGE TOOL =====
app.get('/currency', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'currency.html'));
});

// ===== AUTH — 用户登录 =====
const JWT_SECRET = process.env.JWT_SECRET || 'stockmind-dev-secret-' + Date.now();
const USERS_FILE = path.join(CC_ROOT, 'projects', 'users.json');
const USAGE_FILE = path.join(CC_ROOT, 'projects', 'usage.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_AI_LIMIT = 3; // 免费用户每日 AI 分析次数

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      provider: user.provider,
      isMember: !!user.isMember,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 使用情况追踪（每日 AI 调用次数）
function loadUsage() {
  try {
    if (!fs.existsSync(USAGE_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}
function saveUsage(usage) {
  const dir = path.dirname(USAGE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
}

// Middleware: 必须登录
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// Middleware: 必须为会员
function memberRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录', code: 'LOGIN_REQUIRED' });
  }
  if (!req.user.isMember) {
    return res.status(403).json({ error: '此功能仅限会员使用', code: 'MEMBER_REQUIRED' });
  }
  next();
}

// Middleware: AI 调用次数限制（免费用户每天 N 次）
function checkAIAccess(req, res, next) {
  // 未登录用户，允许使用但要提示
  if (!req.user) {
    req.aiQuota = { used: 0, limit: 0, remaining: 0, needLogin: true };
    return next();
  }
  const today = new Date().toISOString().slice(0, 10);
  const usage = loadUsage();
  const key = `${req.user.id}_${today}`;
  const used = usage[key] || 0;

  if (req.user.isMember) {
    req.aiQuota = { used, limit: -1, remaining: Infinity, isMember: true };
    return next();
  }

  if (used >= FREE_AI_LIMIT) {
    return res.status(429).json({
      error: `今日免费 AI 分析次数已用完（${FREE_AI_LIMIT} 次），升级会员可解锁无限使用`,
      code: 'QUOTA_EXCEEDED',
      quota: { used, limit: FREE_AI_LIMIT, remaining: 0 },
    });
  }

  req.aiQuota = { used, limit: FREE_AI_LIMIT, remaining: FREE_AI_LIMIT - used, isMember: false };
  next();
}

// 记录一次 AI 调用
function recordAIUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const usage = loadUsage();
  const key = `${userId}_${today}`;
  usage[key] = (usage[key] || 0) + 1;
  saveUsage(usage);
}

// GitHub OAuth 配置
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// GitHub 登录 — 跳转到 GitHub 授权页
app.get('/api/auth/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=请先配置 GITHUB_CLIENT_ID`);
  }
  const redirectUri = `${BASE_URL}/api/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
  res.redirect(url);
});

// GitHub 回调 — 换取 token → 获取用户信息 → 写入本地 → JWT → 跳回前端
app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=缺少授权码`);
  }

  try {
    // 用 code 换取 access_token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=授权失败`);
    }

    // 获取用户信息
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { id, login, avatar_url, name } = userRes.data;

    // 获取邮箱
    let email = '';
    try {
      const emailRes = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const primary = emailRes.data.find((e) => e.primary);
      if (primary) {
        email = primary.email;
      }
    } catch {
      /* ignore */
    }

    // 保存/更新用户
    const users = loadUsers();
    const userId = `github-${id}`;
    const existing = users[userId] || {};
    const userData = {
      id: userId,
      name: name || login,
      avatar: avatar_url,
      email,
      provider: 'github',
      isMember: existing.isMember || false,
      loginAt: new Date().toISOString(),
    };
    users[userId] = { ...existing, ...userData, loginAt: new Date().toISOString() };
    saveUsers(users);

    // 生成 JWT
    const token = createToken(users[userId]);
    res.redirect(`${BASE_URL}/hold-le?auth=token&token=${token}`);
  } catch (err) {
    console.error('[Auth] GitHub 登录失败:', err.message);
    res.redirect(`${BASE_URL}/hold-le?auth=err&msg=登录失败`);
  }
});

// WeChat OAuth 配置
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';

// 微信登录 — 跳转到微信扫码页
app.get('/api/auth/wechat', (req, res) => {
  if (!WECHAT_APP_ID) {
    return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=请先配置 WECHAT_APP_ID`);
  }
  const redirectUri = `${BASE_URL}/api/auth/wechat/callback`;
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=stockmind`;
  res.redirect(url);
});

// 微信回调
app.get('/api/auth/wechat/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=缺少授权码`);
  }

  try {
    // 用 code 换取 access_token
    const tokenRes = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: WECHAT_APP_ID,
        secret: WECHAT_APP_SECRET,
        code,
        grant_type: 'authorization_code',
      },
    });

    const { access_token, openid, unionid } = tokenRes.data;
    if (!access_token) {
      return res.redirect(`${BASE_URL}/hold-le?auth=err&msg=授权失败`);
    }

    // 获取用户信息
    const userRes = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
      params: { access_token, openid },
    });
    const { nickname, headimgurl } = userRes.data;

    // 保存/更新用户
    const users = loadUsers();
    const userId = `wechat-${unionid || openid}`;
    const existing = users[userId] || {};
    const userData = {
      id: userId,
      name: nickname || '微信用户',
      avatar: headimgurl || '',
      provider: 'wechat',
      isMember: existing.isMember || false,
      loginAt: new Date().toISOString(),
    };
    users[userId] = { ...existing, ...userData, loginAt: new Date().toISOString() };
    saveUsers(users);

    const token = createToken(users[userId]);
    res.redirect(`${BASE_URL}/hold-le?auth=token&token=${token}`);
  } catch (err) {
    console.error('[Auth] 微信登录失败:', err.message);
    res.redirect(`${BASE_URL}/hold-le?auth=err&msg=登录失败`);
  }
});

// 获取当前用户信息
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 获取登录状态（无需认证，用于前端检测）
app.get('/api/auth/status', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.json({ loggedIn: false });
  }
  try {
    const user = jwt.verify(header.slice(7), JWT_SECRET);
    res.json({ loggedIn: true, user });
  } catch {
    res.json({ loggedIn: false });
  }
});

// 获取会员状态 + AI 用量
app.get('/api/auth/membership', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const usage = loadUsage();
  const key = `${req.user.id}_${today}`;
  const aiUsed = usage[key] || 0;

  res.json({
    isMember: !!req.user.isMember,
    aiUsage: {
      used: aiUsed,
      limit: req.user.isMember ? -1 : FREE_AI_LIMIT,
      remaining: req.user.isMember ? Infinity : Math.max(0, FREE_AI_LIMIT - aiUsed),
    },
  });
});

// 手动升级为会员（管理员用，后续替换为支付回调）
app.post('/api/auth/upgrade', authMiddleware, (req, res) => {
  const users = loadUsers();
  const user = users[req.user.id];
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  user.isMember = true;
  user.memberSince = user.memberSince || new Date().toISOString();
  saveUsers(users);

  const token = createToken(user);
  res.json({ success: true, token, user: { id: user.id, name: user.name, isMember: true } });
});

// ===== FALLBACK: SPA =====
// Any non-API, non-file route → serve index.html
app.get('*', (req, res) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/view/') ||
    req.path.startsWith('/currency')
  ) {
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`工作站已启动 → http://localhost:${PORT}`);
  console.log(`数据文件: ${PROJECTS_FILE}`);
});
