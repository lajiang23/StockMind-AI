/**
 * 东方财富数据服务 — A 股真实数据接口
 *
 * 数据源：东方财富公开 API（免费，无需 Key）
 * 注意：仅供学习研究使用，请勿高频请求
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

// ═══════════════════════════════════════════
// 缓存层（内存 + 文件持久化）
// ═══════════════════════════════════════════

const CACHE_DIR = path.join(__dirname, '..', '.data-cache');
const CACHE_TTL = {
  quote: 30, // 行情：30 秒
  industryList: 300, // 行业列表：5 分钟
  stocksByIndustry: 600, // 行业成分股：10 分钟
  financial: 86400, // 财务数据：24 小时
};

class DataCache {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    this.mem = new Map();
  }

  get(key) {
    const mem = this.mem.get(key);
    if (mem && Date.now() - mem.ts < mem.ttl * 1000) {
      return mem.data;
    }
    // 尝试文件缓存
    const file = path.join(CACHE_DIR, `${key}.json`);
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        const entry = JSON.parse(raw);
        if (Date.now() - entry.ts < entry.ttl * 1000) {
          this.mem.set(key, entry); // 预热内存
          return entry.data;
        }
      }
    } catch {
      /* 忽略 */
    }
    return null;
  }

  set(key, data, ttl) {
    const entry = { data, ts: Date.now(), ttl };
    this.mem.set(key, entry);
    // 异步写文件（不阻塞）
    const file = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFile(file, JSON.stringify(entry), () => {});
  }
}

const cache = new DataCache();

// ═══════════════════════════════════════════
// HTTP 请求封装
// ═══════════════════════════════════════════

const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://quote.eastmoney.com/',
  },
});

// 简易断路器 — API 连续失败 N 次后暂停请求 120 秒
const circuitBreaker = { failures: 0, openUntil: 0 };
function isCircuitOpen() {
  return Date.now() < circuitBreaker.openUntil;
}
function recordFailure() {
  circuitBreaker.failures++;
  if (circuitBreaker.failures >= 3) {
    circuitBreaker.openUntil = Date.now() + 120000;
    circuitBreaker.failures = 0;
  }
}
function recordSuccess() {
  circuitBreaker.failures = 0;
}

/**
 * 带重试的 GET 请求
 */
async function fetchWithRetry(url, retries = 2) {
  if (isCircuitOpen()) {
    throw new Error('断路器已打开：API 暂时不可用');
  }
  for (let i = 0; i <= retries; i++) {
    try {
      const { data } = await http.get(url);
      recordSuccess();
      return data;
    } catch (err) {
      recordFailure();
      if (i === retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ═══════════════════════════════════════════
// 行业列表 & 分类
// ═══════════════════════════════════════════

// 东方财富行业分类映射
const EASTMONEY_INDUSTRIES = {
  bank: { name: '银行', t: '2', m: '90' },
  transport: { name: '交通运输', t: '3', m: '90' },
  auto: { name: '汽车', t: '4', m: '90' },
  realestate: { name: '房地产', t: '5', m: '90' },
  env: { name: '环保', t: '6', m: '90' },
  steel: { name: '钢铁', t: '7', m: '90' },
  utility: { name: '公用事业', t: '8', m: '90' },
  petro: { name: '石油石化', t: '9', m: '90' },
  finance: { name: '非银金融', t: '10', m: '90' },
  machinery: { name: '机械设备', t: '11', m: '90' },
  media: { name: '传媒', t: '12', m: '90' },
  defense: { name: '国防军工', t: '13', m: '90' },
  construction: { name: '建筑装饰', t: '14', m: '90' },
  composite: { name: '综合', t: '15', m: '90' },
  social: { name: '社会服务', t: '16', m: '90' },
  pharma: { name: '医药生物', t: '17', m: '90' },
  retail: { name: '商贸零售', t: '18', m: '90' },
  food: { name: '食品饮料', t: '19', m: '90' },
  appliance: { name: '家用电器', t: '20', m: '90' },
  chemical: { name: '基础化工', t: '21', m: '90' },
  lightind: { name: '轻工制造', t: '22', m: '90' },
  elecequip: { name: '电力设备', t: '23', m: '90' },
  agri: { name: '农林牧渔', t: '24', m: '90' },
  computer: { name: '计算机', t: '25', m: '90' },
  telecom: { name: '通信', t: '26', m: '90' },
  textile: { name: '纺织服饰', t: '27', m: '90' },
  metal: { name: '有色金属', t: '28', m: '90' },
  coal: { name: '煤炭', t: '29', m: '90' },
  electron: { name: '电子', t: '30', m: '90' },
  building: { name: '建筑材料', t: '31', m: '90' },
  beauty: { name: '美容护理', t: '32', m: '90' },
};

// ═══════════════════════════════════════════
// 东方财富 API 字段说明
// ═══════════════════════════════════════════
// 字段参考 EM API:
// f2 = 最新价, f3 = 涨跌幅(%), f4 = 涨跌额
// f12 = 代码, f14 = 名称
// f15 = 最高, f16 = 最低, f17 = 今开, f18 = 昨收
// f20 = 总市值, f21 = 流通市值
// f23 = 市净率 PB, f25 = 市盈率 PE(动态)
// f37 = 加权市盈率, f38 = 市盈率 TTM
// f45 = 涨停, f46 = 跌停
// f62 = 主力净流入, f184 = 主力净占比
// f100 = 换手率, f115 = 市盈率(静态)
// f152 = 5日涨跌幅, f153 = 10日涨跌幅
// f168 = 52周最高, f169 = 52周最低
// f170 = 涨跌幅(持仓), f171 = 振幅

/**
 * 获取东方财富全市场股票列表（含实时行情）
 * @param {string} industryId 行业 ID
 * @param {number} pageSize 每页数量
 */
async function fetchStocksByIndustry(industryId, pageSize = 300) {
  const ind = EASTMONEY_INDUSTRIES[industryId];
  if (!ind) {
    throw new Error(`未知行业: ${industryId}`);
  }

  const cacheKey = `stocks:${industryId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fields =
    'f12,f14,f2,f3,f4,f15,f16,f17,f18,f20,f21,f23,f25,f37,f38,f45,f46,f62,f100,f115,f152,f153,f168,f169,f170,f171,f184';

  try {
    const url =
      `https://push2.eastmoney.com/api/qt/clist/get` +
      `?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
      `&fs=m:${ind.m}+t:${ind.t}&fields=${fields}&fid=f3`;

    const res = await fetchWithRetry(url);
    const items = res?.data?.diff || [];
    const total = res?.data?.total || items.length;

    const stocks = items.map((item) => ({
      code: String(item.f12 || ''),
      name: item.f14 || '',
      price: item.f2,
      changePercent: item.f3,
      change: item.f4,
      high: item.f15,
      low: item.f16,
      open: item.f17,
      prevClose: item.f18,
      marketCap: item.f20,
      floatMarketCap: item.f21,
      pb: item.f23,
      pe: item.f25,
      peTTM: item.f38,
      turnoverRate: item.f100,
      amplitude: item.f171,
      high52w: item.f168,
      low52w: item.f169,
      mainForceNetInflow: item.f62,
      mainForceRatio: item.f184,
    }));

    // 过滤非个股条目（排除 BK/9 开头的指数代码）
    const validStocks = stocks.filter((s) => /^\d{6}$/.test(s.code) && !s.code.startsWith('9'));

    const result = {
      industry: industryId,
      industryName: ind.name,
      count: validStocks.length,
      total,
      stocks: validStocks,
    };
    if (validStocks.length === 0) {
      // 没有有效个股 → 记录失败，触发后续降级
      recordFailure();
    }
    cache.set(cacheKey, result, CACHE_TTL.stocksByIndustry);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 获取 ${industryId} 行业股票失败:`, err.message);
    // 尝试 JSONP 接口
    return fetchStocksByIndustryFallback(industryId, pageSize);
  }
}

/**
 * 备选：通过东方财富行情中心 JSONP 获取
 */
async function fetchStocksByIndustryFallback(industryId, pageSize) {
  const ind = EASTMONEY_INDUSTRIES[industryId];
  const cacheKey = `stocks_fb:${industryId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const fields = 'f12,f14,f2,f3,f20,f23,f25,f62,f100,f115,f152,f153,f170,f184';
    const url =
      `https://push2.eastmoney.com/api/qt/clist/get` +
      `?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
      `&fs=m:${ind.m}+t:${ind.t}&fields=${fields}&fid=f3`;

    const res = await fetchWithRetry(url);
    const items = res?.data?.diff || [];

    const stocks = items.map((item) => ({
      code: String(item.f12 || ''),
      name: item.f14 || '',
      price: item.f2,
      changePercent: item.f3,
      marketCap: item.f20,
      pb: item.f23,
      pe: item.f25,
      turnoverRate: item.f100,
      mainForceNetInflow: item.f62,
      mainForceRatio: item.f184,
    }));

    const validStocks = stocks.filter((s) => /^\d{6}$/.test(s.code) && !s.code.startsWith('9'));
    const result = {
      industry: industryId,
      industryName: ind.name,
      count: validStocks.length,
      stocks: validStocks,
    };
    cache.set(cacheKey, result, CACHE_TTL.stocksByIndustry);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 备选接口也失败:`, err.message);
    return null;
  }
}

/**
 * 获取单只股票实时行情
 */
async function fetchQuote(code) {
  const cacheKey = `quote:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 转东方财富 secid 格式
  const secCode = code.startsWith('6')
    ? `1.${code}` // 上海
    : `0.${code}`; // 深圳

  const fields =
    'f43,f44,f45,f46,f47,f48,f50,f57,f58,f168,f169,f170,f171,f23,f25,f100,f62,f115,f152,f153,f184';

  try {
    const url =
      `https://push2.eastmoney.com/api/qt/stock/get` +
      `?secid=${secCode}&fields=${fields}&fltt=2&invt=2`;

    const res = await fetchWithRetry(url);
    const d = res?.data;
    if (!d) {
      return null;
    }

    const result = {
      code: String(d.f57 || code),
      name: d.f58 || '',
      price: d.f43,
      high: d.f44,
      low: d.f45,
      open: d.f46,
      volume: d.f47,
      turnover: d.f48,
      marketCap: d.f50,
      changePercent: d.f170,
      amplitude: d.f171,
      pb: d.f23,
      pe: d.f25,
      turnoverRate: d.f100,
      mainForceNetInflow: d.f62,
      high52w: d.f168,
      low52w: d.f169,
      change5d: d.f152,
      change10d: d.f153,
      mainForceRatio: d.f184,
    };
    cache.set(cacheKey, result, CACHE_TTL.quote);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 获取报价 ${code} 失败:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// 财务数据（东方财富数据中心 API）
// ═══════════════════════════════════════════

// 东方财富数据中心的公用 token
const DC_TOKEN = 'eastmoney';

/**
 * 获取个股主要财务指标
 * 返回：RoE、毛利率、净利率、营业收入、净利润等
 */
async function fetchFinancialData(code) {
  const cacheKey = `fin:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 东方财富财务摘要 API
    const url =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get` +
      `?reportName=RPT_F10_FINANCE_MAINFINADATA` +
      `&columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,BASIC_EPS,WEIGHTAVG_ROE,GROSS_PROFIT_RATIO,NETPROFIT_MARGIN,OPERATE_PROFIT,DEDUCTEDPARENT_NETPROFIT,OPERATE_PROFIT_TO_GROSSPROFIT` +
      `&filter=(SECURITY_CODE="${code}")` +
      `&pageNumber=1&pageSize=4&sortTypes=-1&sortColumns=REPORT_DATE` +
      `&source=${DC_TOKEN}&client=WEB`;

    const res = await fetchWithRetry(url);
    const items = res?.result?.data || [];

    if (!items.length) {
      return null;
    }

    // 最新一期财务数据
    const latest = items[0];

    const result = {
      code: latest.SECURITY_CODE,
      name: latest.SECURITY_NAME_ABBR,
      reportDate: latest.REPORT_DATE,
      eps: latest.BASIC_EPS, // 基本每股收益
      roe: latest.WEIGHTAVG_ROE, // 加权 RoE(%)
      grossMargin: latest.GROSS_PROFIT_RATIO, // 毛利率(%)
      netMargin: latest.NETPROFIT_MARGIN, // 净利率(%)
      opProfit: latest.OPERATE_PROFIT, // 营业利润
      opMargin: latest.OPERATE_PROFIT_TO_GROSSPROFIT, // 营业利润率(%)
      deductedProfit: latest.DEDUCTEDPARENT_NETPROFIT, // 扣非净利润
      // 历史数据用于趋势对比
      history: items.map((item) => ({
        date: item.REPORT_DATE,
        roe: item.WEIGHTAVG_ROE,
        grossMargin: item.GROSS_PROFIT_RATIO,
        netMargin: item.NETPROFIT_MARGIN,
        eps: item.BASIC_EPS,
      })),
    };

    cache.set(cacheKey, result, CACHE_TTL.financial);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 获取财务数据 ${code} 失败:`, err.message);
    return null;
  }
}

/**
 * 获取分红数据
 */
async function fetchDividendData(code) {
  const cacheKey = `div:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get` +
      `?reportName=RPT_F10_DIVIDEND_BONUS` +
      `&columns=SECURITY_CODE,REPORT_DATE,DIVIDEND_MONEY,DIVIDEND_RATIO,DIVIDEND_YIELD,CASH_STOCK,STOCK_MARKET` +
      `&filter=(SECURITY_CODE="${code}")` +
      `&pageNumber=1&pageSize=5&sortTypes=-1&sortColumns=REPORT_DATE` +
      `&source=${DC_TOKEN}&client=WEB`;

    const res = await fetchWithRetry(url);
    const items = res?.result?.data || [];

    if (!items.length) {
      return null;
    }

    const result = items.map((item) => ({
      date: item.REPORT_DATE,
      dividendPerShare: item.DIVIDEND_MONEY,
      dividendRatio: item.DIVIDEND_RATIO,
      dividendYield: item.DIVIDEND_YIELD,
      cashStock: item.CASH_STOCK,
      stockMarket: item.STOCK_MARKET,
    }));

    cache.set(cacheKey, result, CACHE_TTL.financial);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 获取分红 ${code} 失败:`, err.message);
    return null;
  }
}

/**
 * 获取综合财务指标（含推测值）
 * 返回值与前端期望的 metrics 格式一致
 */
async function fetchStockMetrics(code) {
  const [fin, div, quote] = await Promise.all([
    fetchFinancialData(code),
    fetchDividendData(code),
    fetchQuote(code),
  ]);

  const result = {
    roe: fin?.roe ?? null,
    grossMargin: fin?.grossMargin ?? null,
    netMargin: fin?.netMargin ?? null,
    opMargin: fin?.opMargin ?? null,
    cashRatio: null, // 东方财富无直接现金比率指标，需从资产负债表算
    dividendRate: div?.[0]?.dividendRatio ?? null,
    eps: fin?.eps ?? null,
    pe: quote?.pe ?? null,
    pb: quote?.pb ?? null,
    price: quote?.price ?? null,
    changePercent: quote?.changePercent ?? null,
    marketCap: quote?.marketCap ?? null,
    turnoverRate: quote?.turnoverRate ?? null,
    name: fin?.name || quote?.name || '',
    code,
  };

  return result;
}

/**
 * 文本搜索股票
 */
async function searchStock(keyword) {
  if (!keyword || keyword.length < 1) {
    return [];
  }

  try {
    const url =
      `https://searchadapter.eastmoney.com/api/suggest/get` +
      `?input=${encodeURIComponent(keyword)}&count=8&type=14`;

    const res = await fetchWithRetry(url);
    const items = res?.QuotationCodeTable?.Data || [];

    return items.map((item) => ({
      code: String(item.Code || ''),
      name: item.Name || '',
      market: item.Market || '',
    }));
  } catch (err) {
    console.error(`[eastmoney] 搜索 ${keyword} 失败:`, err.message);
    return [];
  }
}

/**
 * 获取市场指数概览
 */
async function fetchMarketOverview() {
  const cacheKey = 'market_overview';
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 上证、深证、创业板、科创50
  const indices = [
    { code: '1.000001', name: '上证指数' },
    { code: '0.399001', name: '深证成指' },
    { code: '0.399006', name: '创业板指' },
    { code: '1.000688', name: '科创50' },
  ];

  try {
    const results = [];
    for (const idx of indices) {
      const url =
        `https://push2.eastmoney.com/api/qt/stock/get` +
        `?secid=${idx.code}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f170,f171,f169`;
      const res = await fetchWithRetry(url);
      const d = res?.data;
      if (d) {
        results.push({
          name: d.f58 || idx.name,
          code: String(d.f57 || idx.code),
          price: d.f43,
          changePercent: d.f170,
          high: d.f44,
          low: d.f45,
          amplitude: d.f171,
          volume: d.f47,
        });
      }
    }

    cache.set(cacheKey, results, CACHE_TTL.quote);
    return results;
  } catch (err) {
    console.error('[eastmoney] 获取市场概况失败:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════

module.exports = {
  fetchStocksByIndustry,
  fetchQuote,
  fetchFinancialData,
  fetchDividendData,
  fetchStockMetrics,
  searchStock,
  fetchMarketOverview,
  INDUSTRY_MAP: EASTMONEY_INDUSTRIES,
};
