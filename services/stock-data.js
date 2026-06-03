/**
 * 股票数据服务 — 从公开数据源获取 A 股财务数据
 */

const axios = require('axios');
const cheerio = require('cheerio');

// 简易内存缓存（避免重复请求）
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

/**
 * 按股票代码从东方财富 API 获取实时行情数据
 * code 格式：'600519' 或 '600519.SH'
 */
async function fetchEastMoneyQuote(code) {
  const cached = getCached(`quote:${code}`);
  if (cached) {
    return cached;
  }

  const secCode = code.length <= 6 ? (code.startsWith('6') ? `${code}.SH` : `${code}.SZ`) : code;

  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secCode}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f168,f170,f171`;
    const { data } = await axios.get(url, { timeout: 5000 });

    if (data?.data) {
      const d = data.data;
      const result = {
        code: secCode,
        name: d.f58,
        price: d.f43,
        high: d.f44,
        low: d.f45,
        open: d.f46,
        volume: d.f47,
        changePercent: d.f170,
        turnover: d.f48,
        amplitude: d.f171,
        marketCap: d.f50,
      };
      setCache(`quote:${code}`, result);
      return result;
    }
  } catch (err) {
    console.error(`[stock-data] 获取行情失败 ${code}: ${err.message}`);
  }
  return null;
}

/**
 * 从东方财富获取财务指标摘要（RoE、毛利率等）
 * 返回模拟数据结构，实际用爬虫获取
 */
async function fetchFinancialData(code) {
  const cached = getCached(`finance:${code}`);
  if (cached) {
    return cached;
  }

  // 东方财富财报页面
  try {
    const url = `https://emweb.securities.eastmoney.com/PC_HSF10/FinanceSummary/Index?type=web&code=${code}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(data);

    // 尝试解析页面中的财务数据
    // 注意：东方财富页面是动态渲染的，实际可能需要调用其 API
    // 这里作为兜底返回 null，前端会用 Mock 数据+AI 分析
    return null;
  } catch (err) {
    console.error(`[stock-data] 获取财务数据失败 ${code}: ${err.message}`);
    return null;
  }
}

/**
 * 搜索股票（代码或名称模糊匹配）
 * 使用东方财富搜索 API
 */
async function searchStock(keyword) {
  try {
    const url = `https://searchadapter.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&count=8&type=14`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data?.QuotationCodeTable?.Data) {
      return data.QuotationCodeTable.Data.map((item) => ({
        code: item.Code,
        name: item.Name,
        market: item.Market,
      }));
    }
  } catch (err) {
    console.error(`[stock-data] 搜索失败 ${keyword}: ${err.message}`);
  }
  return [];
}

/**
 * 获取近期市场新闻（标题列表）
 */
async function fetchMarketNews(count = 10) {
  const cached = getCached('market_news');
  if (cached) {
    return cached;
  }

  try {
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f62,f184,f66&secids=1.000001,0.399001,0.399006,1.000688`;
    const { data } = await axios.get(url, { timeout: 5000 });

    // 获取主要指数行情作为市场概览
    const indices = [];
    if (data?.data?.diff) {
      data.data.diff.forEach((item) => {
        indices.push({
          name: item.f14,
          code: item.f12,
          price: item.f2,
          changePercent: item.f3,
        });
      });
    }

    setCache('market_news', indices);
    return indices;
  } catch (err) {
    console.error(`[stock-data] 获取市场概况失败: ${err.message}`);
    return [];
  }
}

module.exports = {
  fetchEastMoneyQuote,
  fetchFinancialData,
  searchStock,
  fetchMarketNews,
};
