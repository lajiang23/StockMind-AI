/* ═══════════════════════════════════════════
   StockMind AI · Data Layer — Mock Data & Generators
   ═══════════════════════════════════════════ */

const INDUSTRIES = [
  { id: 'bank', name: '银行', count: 42 },
  { id: 'transport', name: '交通运输', count: 123 },
  { id: 'auto', name: '汽车', count: 206 },
  { id: 'realestate', name: '房地产', count: 111 },
  { id: 'env', name: '环保', count: 85 },
  { id: 'steel', name: '钢铁', count: 43 },
  { id: 'utility', name: '公用事业', count: 106 },
  { id: 'petro', name: '石油石化', count: 45 },
  { id: 'finance', name: '非银金融', count: 86 },
  { id: 'machinery', name: '机械设备', count: 317 },
  { id: 'media', name: '传媒', count: 134 },
  { id: 'defense', name: '国防军工', count: 96 },
  { id: 'construction', name: '建筑装饰', count: 129 },
  { id: 'composite', name: '综合', count: 30 },
  { id: 'social', name: '社会服务', count: 63 },
  { id: 'pharma', name: '医药生物', count: 314 },
  { id: 'retail', name: '商贸零售', count: 96 },
  { id: 'food', name: '食品饮料', count: 101 },
  { id: 'appliance', name: '家用电器', count: 70 },
  { id: 'chemical', name: '基础化工', count: 280 },
  { id: 'lightind', name: '轻工制造', count: 126 },
  { id: 'elecequip', name: '电力设备', count: 223 },
  { id: 'agri', name: '农林牧渔', count: 87 },
  { id: 'computer', name: '计算机', count: 240 },
  { id: 'telecom', name: '通信', count: 95 },
  { id: 'textile', name: '纺织服饰', count: 92 },
  { id: 'metal', name: '有色金属', count: 115 },
  { id: 'coal', name: '煤炭', count: 33 },
  { id: 'electron', name: '电子', count: 258 },
  { id: 'building', name: '建筑材料', count: 71 },
  { id: 'beauty', name: '美容护理', count: 18 },
];

const METRICS_CONFIG = [
  {
    key: 'roe',
    name: '股东权益报酬率',
    en: 'RoE',
    unit: '%',
    suffix: '%',
    desc: '衡量公司运用股东资本获利能力的核心指标',
    higherBetter: true,
  },
  {
    key: 'cashRatio',
    name: '现金与约当现金比率',
    en: 'Cash Ratio',
    unit: '%',
    suffix: '%',
    desc: '公司持有的现金及等价物占总资产比例',
    higherBetter: true,
  },
  {
    key: 'grossMargin',
    name: '营业毛利率',
    en: 'Gross Margin',
    unit: '%',
    suffix: '%',
    desc: '反映产品或服务的初始盈利能力',
    higherBetter: true,
  },
  {
    key: 'opMargin',
    name: '营业利益率',
    en: 'Operating Margin',
    unit: '%',
    suffix: '%',
    desc: '扣除营业费用后的盈利水平',
    higherBetter: true,
  },
  {
    key: 'netMargin',
    name: '纯益率 / 净利率',
    en: 'Net Profit Margin',
    unit: '%',
    suffix: '%',
    desc: '最终的净利润水平',
    higherBetter: true,
  },
  {
    key: 'dividendRate',
    name: '分红率',
    en: 'Dividend Payout',
    unit: '%',
    suffix: '%',
    desc: '公司分红占净利润的比例',
    higherBetter: true,
  },
];

const STOCK_NAMES = {
  bank: [
    '工商银行',
    '建设银行',
    '农业银行',
    '中国银行',
    '招商银行',
    '兴业银行',
    '浦发银行',
    '中信银行',
    '民生银行',
    '平安银行',
    '交通银行',
    '光大银行',
    '华夏银行',
    '北京银行',
    '南京银行',
    '宁波银行',
    '上海银行',
    '杭州银行',
    '成都银行',
    '长沙银行',
    '贵阳银行',
    '郑州银行',
    '青岛银行',
    '西安银行',
    '苏州银行',
    '兰州银行',
    '重庆银行',
    '厦门银行',
    '沪农商行',
    '瑞丰银行',
    '齐鲁银行',
    '紫金银行',
    '无锡银行',
    '常熟银行',
    '苏农银行',
    '江阴银行',
    '张家港行',
    '青农商行',
    '渝农商行',
    '邮储银行',
  ],
  auto: [
    '比亚迪',
    '上汽集团',
    '长安汽车',
    '长城汽车',
    '广汽集团',
    '吉利汽车',
    '蔚来',
    '小鹏汽车',
    '理想汽车',
    '赛力斯',
    '江淮汽车',
    '东风汽车',
    '福田汽车',
    '宇通客车',
    '金龙汽车',
    '中通客车',
    '安凯客车',
    '江铃汽车',
    '中国重汽',
    '一汽解放',
    '华域汽车',
    '福耀玻璃',
    '星宇股份',
    '拓普集团',
    '德赛西威',
    '华阳集团',
    '均胜电子',
    '旭升集团',
    '爱柯迪',
    '文灿股份',
    '伯特利',
    '银轮股份',
    '新泉股份',
    '玲珑轮胎',
    '赛轮轮胎',
    '三角轮胎',
    '双星轮胎',
    '风神股份',
  ],
  electron: [
    '京东方A',
    'TCL科技',
    '海康威视',
    '立讯精密',
    '紫光国微',
    '中芯国际',
    '北方华创',
    '韦尔股份',
    '兆易创新',
    '卓胜微',
    '长电科技',
    '通富微电',
    '华天科技',
    '士兰微',
    '三安光电',
    '闻泰科技',
    '歌尔股份',
    '传音控股',
    '澜起科技',
    '中微公司',
    '华大九天',
    '龙芯中科',
    '海光信息',
    '复旦微电',
    '国芯科技',
    '芯原股份',
    '景嘉微',
    '纳思达',
    '振华科技',
    '宏达电子',
  ],
  pharma: [
    '恒瑞医药',
    '药明康德',
    '迈瑞医疗',
    '片仔癀',
    '复星医药',
    '云南白药',
    '同仁堂',
    '白云山',
    '华东医药',
    '智飞生物',
    '长春高新',
    '沃森生物',
    '凯莱英',
    '康龙化成',
    '泰格医药',
    '华熙生物',
    '爱美客',
    '通策医疗',
    '爱尔眼科',
    '华大基因',
    '以岭药业',
    '科伦药业',
    '信立泰',
    '海思科',
    '贝达药业',
    '康弘药业',
    '百济神州',
    '君实生物',
    '信达生物',
    '荣昌生物',
  ],
  computer: [
    '中科曙光',
    '浪潮信息',
    '紫光股份',
    '中兴通讯',
    '中科软',
    '科大讯飞',
    '用友网络',
    '金山办公',
    '恒生电子',
    '广联达',
    '宝信软件',
    '深信服',
    '奇安信',
    '三六零',
    '中国软件',
    '东软集团',
    '太极股份',
    '四维图新',
    '中科创达',
    '东方财富',
    '同花顺',
    '大智慧',
    '金证股份',
    '神州信息',
    '宇信科技',
    '长亮科技',
    '润和软件',
    '诚迈科技',
    '中孚信息',
  ],
  food: [
    '贵州茅台',
    '五粮液',
    '泸州老窖',
    '洋河股份',
    '山西汾酒',
    '古井贡酒',
    '青岛啤酒',
    '百润股份',
    '伊利股份',
    '蒙牛乳业',
    '海天味业',
    '安井食品',
    '双汇发展',
    '三全食品',
    '桃李面包',
    '安琪酵母',
    '涪陵榨菜',
    '绝味食品',
    '周黑鸭',
    '洽洽食品',
    '养元饮品',
    '东鹏饮料',
    '农夫山泉',
    '康师傅',
    '统一企业',
    '中国旺旺',
    '达利食品',
    '良品铺子',
    '三只松鼠',
    '盐津铺子',
  ],
  finance: [
    '中国平安',
    '中国人寿',
    '中国太保',
    '中国人保',
    '新华保险',
    '中国银河',
    '中信证券',
    '华泰证券',
    '国泰君安',
    '海通证券',
    '广发证券',
    '招商证券',
    '东方证券',
    '兴业证券',
    '中金公司',
    '光大证券',
    '方正证券',
    '东方财富',
    '申万宏源',
    '国信证券',
  ],
  realestate: [
    '万科A',
    '保利发展',
    '招商蛇口',
    '华润置地',
    '龙湖集团',
    '碧桂园',
    '中国恒大',
    '融创中国',
    '绿地控股',
    '中海地产',
    '绿城中国',
    '新城控股',
    '金地集团',
    '旭辉集团',
    '世茂集团',
    '远洋集团',
    '雅居乐',
    '中南建设',
    '阳光城',
    '金科股份',
  ],
  machinery: [
    '三一重工',
    '汇川技术',
    '中联重科',
    '徐工机械',
    '恒立液压',
    '先导智能',
    '晶盛机电',
    '捷佳伟创',
    '迈为股份',
    '帝尔激光',
    '大族激光',
    '华工科技',
    '锐科激光',
    '杰瑞股份',
    '中集集团',
    '杭氧股份',
    '陕鼓动力',
    '豪迈科技',
    '浙江鼎力',
    '艾迪精密',
  ],
  media: [
    '分众传媒',
    '芒果超媒',
    '光线传媒',
    '华谊兄弟',
    '中国电影',
    '万达电影',
    '北京文化',
    '慈文传媒',
    '华策影视',
    '完美世界',
    '三七互娱',
    '世纪华通',
    '昆仑万维',
    '掌趣科技',
    '吉比特',
    '心动公司',
    '哔哩哔哩',
    '快手',
    '阅文集团',
    '猫眼娱乐',
  ],
};

const FALLBACK_NAMES = [
  '华泰股份',
  '中科信息',
  '东方创业',
  '南方精工',
  '北方稀土',
  '西部矿业',
  '东部电力',
  '创新科技',
  '智造未来',
  '绿色能源',
  '健康中国',
  '数字华夏',
  '互联科技',
  '智慧城市',
];

const PYRAMID_NAMES = [
  '贵州茅台',
  '比亚迪',
  '宁德时代',
  '恒瑞医药',
  '迈瑞医疗',
  '海康威视',
  '紫金矿业',
  '招商银行',
  '中国平安',
  '美的集团',
  '海尔智家',
  '万华化学',
  '中芯国际',
  '药明康德',
  '隆基绿能',
  '汇川技术',
  '长江电力',
  '中国中免',
  '福耀玻璃',
  '立讯精密',
  '中信证券',
  '东方财富',
  '格力电器',
  '五粮液',
  '泸州老窖',
  '片仔癀',
  '伊利股份',
  '三一重工',
  '海天味业',
  '科大讯飞',
];

/* ─── Real Data API Functions ─── */

/**
 * 真实数据版行业筛选指标配置（东方财富列表 API 可用字段）
 * 替换原来的 6 个财务指标（roe/cashRatio/grossMargin/opMargin/netMargin/dividendRate）
 */
const REAL_METRICS_CONFIG = [
  {
    key: 'pe',
    name: '市盈率 (PE)',
    en: 'PE Ratio',
    unit: '',
    suffix: '',
    desc: '股价与每股收益的比率，反映市场估值水平',
    higherBetter: false,
  },
  {
    key: 'pb',
    name: '市净率 (PB)',
    en: 'PB Ratio',
    unit: '',
    suffix: '',
    desc: '股价与每股净资产的比率，衡量资产估值',
    higherBetter: false,
  },
  {
    key: 'marketCap',
    name: '总市值',
    en: 'Market Cap',
    unit: '亿',
    suffix: '亿',
    desc: '公司总市值，反映市场对公司的整体定价',
    higherBetter: true,
  },
  {
    key: 'turnoverRate',
    name: '换手率',
    en: 'Turnover Rate',
    unit: '%',
    suffix: '%',
    desc: '一定时间内股票转手买卖的频率',
    higherBetter: false,
  },
  {
    key: 'changePercent',
    name: '涨跌幅',
    en: 'Change %',
    unit: '%',
    suffix: '%',
    desc: '当日股价涨跌百分比',
    higherBetter: true,
  },
  {
    key: 'mainForceRatio',
    name: '主力净占比',
    en: 'Main Force Ratio',
    unit: '%',
    suffix: '%',
    desc: '主力资金净流入占成交额比例',
    higherBetter: true,
  },
];

/**
 * 从 API 获取指定行业的股票数据（含实时行情）
 * 失败时返回 null，由调用方决定是否使用 Mock 数据
 */
async function fetchRealIndustryStocks(industryId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`/api/stocks/industry/${industryId}?pageSize=200`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.stocks || !data.stocks.length) return null;
    return data;
  } catch (err) {
    console.warn(`[data] 获取 ${industryId} 真实数据失败:`, err.message);
    return null;
  }
}

/**
 * 从 API 获取个股综合财务指标（含 ROE、毛利率等）
 */
async function fetchRealStockDetail(code) {
  try {
    const res = await fetch(`/api/stocks/metrics/${code}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[data] 获取 ${code} 详情失败:`, err.message);
    return null;
  }
}

/**
 * 从 API 搜索股票
 */
async function fetchSearchResults(query) {
  try {
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.warn(`[data] 搜索 ${query} 失败:`, err.message);
    return [];
  }
}

/**
 * 获取市场指数实时概览
 */
async function fetchMarketOverview() {
  try {
    const res = await fetch('/api/market/overview');
    if (!res.ok) return [];
    const data = await res.json();
    return data.indices || [];
  } catch (err) {
    console.warn('[data] 获取市场概览失败:', err.message);
    return [];
  }
}

/* ─── Mock Data Generators (fallback) ─── */

function generateStocks(industryId, count, prefix) {
  const stocks = [];
  const pool = STOCK_NAMES[industryId] || FALLBACK_NAMES;
  const limit = Math.min(count, pool.length);
  for (let i = 0; i < limit; i++) {
    stocks.push({
      code: `${prefix}${String(600000 + i).slice(0, 6)}`,
      name: pool[i % pool.length],
      industry: industryId,
      roe: +(Math.random() * 25 + 1).toFixed(2),
      cashRatio: +(Math.random() * 50 + 5).toFixed(2),
      grossMargin: +(Math.random() * 40 + 10).toFixed(2),
      opMargin: +(Math.random() * 25 + 2).toFixed(2),
      netMargin: +(Math.random() * 20 + 1).toFixed(2),
      dividendRate: +(Math.random() * 8 + 0.5).toFixed(2),
    });
  }
  return stocks;
}

function generateStockDB() {
  const db = {};
  INDUSTRIES.forEach((ind) => {
    db[ind.id] = generateStocks(ind.id, ind.count, '6');
  });
  return db;
}

function generatePyramid() {
  const sectors = ['消费', '科技', '金融', '医药', '制造', '能源', '材料'];
  return PYRAMID_NAMES.map((name, i) => ({
    rank: i + 1,
    name,
    code: `${600000 + i}`,
    sector: sectors[Math.floor(Math.random() * sectors.length)],
    score: +(95 - i * 2.8 + Math.random() * 2).toFixed(1),
  }));
}
