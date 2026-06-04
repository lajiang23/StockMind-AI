/**
 * 东方财富数据服务 — A 股真实数据接口
 *
 * 数据源：东方财富公开 API（免费，无需 Key）
 * 注意：仅供学习研究使用，请勿高频请求
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const STOCK_UNIVERSE = require('./stock-universe');

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
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://quote.eastmoney.com/',
  },
});

/**
 * 带重试的 GET 请求（不含断路器，可用于可靠的数据中心 API）
 */
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const { data } = await http.get(url);
      return data;
    } catch (err) {
      if (i === retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ═══════════════════════════════════════════
// 腾讯行情 API（替代 push2.eastmoney.com）
// ═══════════════════════════════════════════

const TENCENT_URL = 'http://qt.gtimg.cn/q=';

/** Stock code → Tencent prefix */
function txPrefix(code) {
  if (code.startsWith('6')) {
    return 'sh' + code;
  }
  return 'sz' + code;
}

/**
 * 批量获取腾讯行情
 * @param {string[]} codes 股票代码数组
 * @returns {Promise<Object>} code → quote data map
 */
async function fetchTencentBatch(codes) {
  if (!codes.length) {
    return {};
  }
  const chunks = [];
  for (let i = 0; i < codes.length; i += 100) {
    chunks.push(codes.slice(i, i + 100));
  }
  const result = {};
  for (const chunk of chunks) {
    try {
      const url = TENCENT_URL + chunk.map(txPrefix).join(',');
      const resp = await axios.get(url, { timeout: 8000, responseType: 'arraybuffer' });
      const data = iconv.decode(Buffer.from(resp.data), 'GBK');
      // Parse each var line: v_CODE="f1~f2~...";
      const matches = data.match(/v_(\w+)="([^"]+)"/g) || [];
      for (const m of matches) {
        const exec = m.match(/v_\w+="([^"]+)"/);
        if (!exec) {
          continue;
        }
        const fields = exec[1].split('~');
        const code = fields[2] || '';
        if (!code) {
          continue;
        }
        result[code] = parseTencentRow(fields);
      }
    } catch (err) {
      console.error(`[tencent] 批量获取失败 (${chunk.length}支): ${err.message}`);
    }
  }
  return result;
}

/**
 * 解析腾讯行情行
 * 字段格式 (0-based):
 *   0=市场, 1=名称, 2=代码, 3=现价, 4=昨收, 5=今开,
 *   6=成交量(手), 7=外盘, 8=内盘,
 *   9-18=买5价量, 19-28=卖5价量,
 *   30=日期, 31=时间,
 *   32=涨跌额, 33=涨跌幅, 34=最高, 35=最低,
 *   36=量价字符串, 37=成交量(手), 38=成交额(万),
 *   39=换手率, 40=PE(动态), 41=??,
 *   42=涨停, 43=跌停,
 *   44=总市值(亿), 45=流通市值(亿), 46=PB
 */
function parseTencentRow(f) {
  const parseNum = (v) => {
    if (v === undefined || v === null || v === '' || v === '-') {
      return null;
    }
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  const price = parseNum(f[3]);
  const preClose = parseNum(f[4]);
  const change = parseNum(f[31]);
  const changePct = parseNum(f[32]);

  return {
    code: f[2] || '',
    name: f[1] || '',
    price,
    prevClose: preClose,
    open: parseNum(f[5]),
    high: parseNum(f[33]),
    low: parseNum(f[34]),
    change,
    changePercent: changePct,
    amplitude: parseNum(f[43]), // 振幅(%)
    volume: parseNum(f[36]), // 手
    turnover: parseNum(f[37]), // 万元
    turnoverRate: parseNum(f[38]), // 换手率(%)
    pe: parseNum(f[39]), // 动态PE
    pb: parseNum(f[46]), // PB
    marketCap: parseNum(f[44]), // 总市值(亿)
    floatMarketCap: parseNum(f[45]), // 流通市值(亿)
    highLimit: parseNum(f[47]),
    lowLimit: parseNum(f[48]),
  };
}

// ═══════════════════════════════════════════
// 行业列表 & 分类
// ═══════════════════════════════════════════

// 申万一级行业分类（ 31 个）
// 每个行业保留 legacy m:90+t:N 格式作为兜底，
// discoverIndustries() 启动时会尝试获取东方财富 BK 板块代码，
// 获取成功后切换为 b:BKXXXX 格式（沪深全市场）。
const EASTMONEY_INDUSTRIES = {
  bank: { name: '银行', t: '2', m: '90', bk: null },
  transport: { name: '交通运输', t: '3', m: '90', bk: null },
  auto: { name: '汽车', t: '4', m: '90', bk: null },
  realestate: { name: '房地产', t: '5', m: '90', bk: null },
  env: { name: '环保', t: '6', m: '90', bk: null },
  steel: { name: '钢铁', t: '7', m: '90', bk: null },
  utility: { name: '公用事业', t: '8', m: '90', bk: null },
  petro: { name: '石油石化', t: '9', m: '90', bk: null },
  finance: { name: '非银金融', t: '10', m: '90', bk: null },
  machinery: { name: '机械设备', t: '11', m: '90', bk: null },
  media: { name: '传媒', t: '12', m: '90', bk: null },
  defense: { name: '国防军工', t: '13', m: '90', bk: null },
  construction: { name: '建筑装饰', t: '14', m: '90', bk: null },
  composite: { name: '综合', t: '15', m: '90', bk: null },
  social: { name: '社会服务', t: '16', m: '90', bk: null },
  pharma: { name: '医药生物', t: '17', m: '90', bk: null },
  retail: { name: '商贸零售', t: '18', m: '90', bk: null },
  food: { name: '食品饮料', t: '19', m: '90', bk: null },
  appliance: { name: '家用电器', t: '20', m: '90', bk: null },
  chemical: { name: '基础化工', t: '21', m: '90', bk: null },
  lightind: { name: '轻工制造', t: '22', m: '90', bk: null },
  elecequip: { name: '电力设备', t: '23', m: '90', bk: null },
  agri: { name: '农林牧渔', t: '24', m: '90', bk: null },
  computer: { name: '计算机', t: '25', m: '90', bk: null },
  telecom: { name: '通信', t: '26', m: '90', bk: null },
  textile: { name: '纺织服饰', t: '27', m: '90', bk: null },
  metal: { name: '有色金属', t: '28', m: '90', bk: null },
  coal: { name: '煤炭', t: '29', m: '90', bk: null },
  electron: { name: '电子', t: '30', m: '90', bk: null },
  building: { name: '建筑材料', t: '31', m: '90', bk: null },
  beauty: { name: '美容护理', t: '32', m: '90', bk: null },
};

/**
 * 通过 searchadapter 获取行业板块的 BK 代码
 * （push2 不可达时的替代方案）
 */
async function discoverIndustries() {
  let matched = 0;
  for (const [key, ind] of Object.entries(EASTMONEY_INDUSTRIES)) {
    try {
      const url =
        `https://searchadapter.eastmoney.com/api/suggest/get` +
        `?input=${encodeURIComponent(ind.name)}&count=3&type=14`;
      const { data } = await axios.get(url, { timeout: 5000 });
      const items = data?.QuotationCodeTable?.Data || [];
      for (const item of items) {
        // BK 板块条目：SecurityType === '9' 或 Code 以 BK 开头
        if (item.Code && item.Code.startsWith('BK')) {
          ind.bk = item.Code;
          matched++;
          break;
        }
      }
    } catch {
      // 单个行业搜索失败不影响其他
    }
  }
  console.log(
    `[eastmoney] 行业板块发现完成：匹配 ${matched}/${Object.keys(EASTMONEY_INDUSTRIES).length} 个行业`
  );
  return matched > 0;
}

// 模块加载时自动尝试发现
discoverIndustries();

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

  // 先用股票宇宙 + 腾讯行情获取实时数据
  const universeCodes = STOCK_UNIVERSE[industryId];
  if (universeCodes && universeCodes.length > 0) {
    try {
      const quotes = await fetchTencentBatch(universeCodes);
      const stocks = universeCodes.map((code) => quotes[code]).filter(Boolean);

      const result = {
        industry: industryId,
        industryName: ind.name,
        count: stocks.length,
        total: stocks.length,
        stocks,
      };
      cache.set(cacheKey, result, CACHE_TTL.stocksByIndustry);
      return result;
    } catch (err) {
      console.error(`[tencent] 获取 ${industryId} 行业行情失败:`, err.message);
    }
  }

  return null;
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

  try {
    const quotes = await fetchTencentBatch([code]);
    const result = quotes[code] || null;
    if (result) {
      cache.set(cacheKey, result, CACHE_TTL.quote);
    }
    return result;
  } catch (err) {
    console.error(`[tencent] 获取报价 ${code} 失败:`, err.message);
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
    // 东方财富财务摘要 API — 使用中文缩写字段名
    const url =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get` +
      `?reportName=RPT_F10_FINANCE_MAINFINADATA` +
      `&columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,EPSJB,ROEJQ,XSMLL,XSJLL,PARENTNETPROFIT,KCFJCXSYJLR` +
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
      eps: latest.EPSJB, // 基本每股收益
      roe: latest.ROEJQ, // 加权 RoE(%)
      grossMargin: latest.XSMLL, // 销售毛利率(%)
      netMargin: latest.XSJLL, // 销售净利率(%)
      opProfit: latest.PARENTNETPROFIT, // 归母净利润
      opMargin: null, // 营业利润率不可直接获取
      deductedProfit: latest.KCFJCXSYJLR, // 扣非净利润
      // 历史数据用于趋势对比
      history: items.map((item) => ({
        date: item.REPORT_DATE,
        roe: item.ROEJQ,
        grossMargin: item.XSMLL,
        netMargin: item.XSJLL,
        eps: item.EPSJB,
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
 * 获取公司简介（主营业务）
 */
async function fetchCompanyProfile(code) {
  const cacheKey = `profile:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get` +
      `?reportName=RPT_F10_ORG_PROFILE` +
      `&columns=SECURITY_CODE,SECURITY_NAME_ABBR,MAIN_BUSINESS,ORG_PROFILE` +
      `&filter=(SECURITY_CODE="${code}")` +
      `&pageNumber=1&pageSize=1` +
      `&source=${DC_TOKEN}&client=WEB`;

    const res = await fetchWithRetry(url);
    const item = res?.result?.data?.[0];
    if (!item) {
      return null;
    }

    const result = {
      code: item.SECURITY_CODE,
      name: item.SECURITY_NAME_ABBR,
      mainBusiness: item.MAIN_BUSINESS || '',
      profile: item.ORG_PROFILE || '',
    };

    cache.set(cacheKey, result, CACHE_TTL.financial);
    return result;
  } catch (err) {
    console.error(`[eastmoney] 获取公司简介 ${code} 失败:`, err.message);
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

  // 上证、深证、创业板、科创50 — Tencent 代码前缀
  const indices = [
    { code: 'sh000001', name: '上证指数' },
    { code: 'sz399001', name: '深证成指' },
    { code: 'sz399006', name: '创业板指' },
    { code: 'sh000688', name: '科创50' },
  ];

  try {
    const url = TENCENT_URL + indices.map((i) => i.code).join(',');
    const resp = await axios.get(url, { timeout: 8000, responseType: 'arraybuffer' });
    const data = iconv.decode(Buffer.from(resp.data), 'GBK');
    const results = [];
    const matches = data.match(/v_\w+="([^"]+)"/g) || [];
    for (const m of matches) {
      const exec = m.match(/v_\w+="([^"]+)"/);
      if (!exec) {
        continue;
      }
      const f = exec[1].split('~');
      results.push({
        name: f[1] || '',
        code: f[2] || '',
        price: parseFloat(f[3]) || 0,
        changePercent: parseFloat(f[32]) || 0,
        high: parseFloat(f[33]) || 0,
        low: parseFloat(f[34]) || 0,
        volume: parseFloat(f[36]) || 0,
      });
    }
    cache.set(cacheKey, results, CACHE_TTL.quote);
    return results;
  } catch (err) {
    console.error('[tencent] 获取市场概况失败:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════

module.exports = {
  discoverIndustries,
  fetchStocksByIndustry,
  fetchQuote,
  fetchFinancialData,
  fetchDividendData,
  fetchStockMetrics,
  fetchCompanyProfile,
  searchStock,
  fetchMarketOverview,
  INDUSTRY_MAP: EASTMONEY_INDUSTRIES,
};
