const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = 3456;

// ===== AI 服务 =====
require('dotenv').config();
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
    let quote = null;
    try {
      quote = await stockData.fetchEastMoneyQuote(code);
    } catch {
      /* ignore */
    }

    const analysis = await aiService.analyzeStock({ code, name, quote, metrics });
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
