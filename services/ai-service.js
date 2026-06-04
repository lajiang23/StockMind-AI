/**
 * AI 分析服务 — 调用 LLM API 进行股票分析和智能问答
 * 支持国内国外多家 AI 提供商（OpenAI 兼容格式）
 */

require('dotenv').config();

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';

/**
 * 调用 LLM API（统一入口）
 */
async function callLLM(systemPrompt, userMessage, options = {}) {
  const { maxTokens = 1024, temperature = 0.3 } = options;

  // Anthropic 优先
  if (process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(systemPrompt, userMessage, { maxTokens, temperature });
  }

  // OpenAI 兼容接口（DeepSeek / 硅基流动 / 通义千问等）
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL) {
    return callOpenAICompatible(systemPrompt, userMessage, { maxTokens, temperature });
  }

  // 有 OpenAI Key 但没有 BaseURL（用默认 OpenAI）
  if (process.env.OPENAI_API_KEY) {
    return callOpenAICompatible(systemPrompt, userMessage, { maxTokens, temperature });
  }

  return null; // 未配置任何 API
}

async function callAnthropic(systemPrompt, userMessage, { maxTokens, temperature }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }

  const { Anthropic } = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: AI_MODEL === 'deepseek-chat' ? 'claude-sonnet-4-20250514' : AI_MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return msg.content[0].text;
  } catch (err) {
    console.error('[ai-service] Anthropic API 错误:', err.message);
    return `⚠️ AI 分析暂时不可用（${err.message}）`;
  }
}

/**
 * 调用 OpenAI 兼容接口（国内厂商如 DeepSeek、硅基流动、通义千问等均支持）
 */
async function callOpenAICompatible(systemPrompt, userMessage, { maxTokens, temperature }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = AI_MODEL;

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '无详情');
      throw new Error(`API 返回 ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '⚠️ AI 未返回有效内容';
  } catch (err) {
    console.error('[ai-service] OpenAI 兼容 API 错误:', err.message);
    return `⚠️ AI 分析暂时不可用（${err.message}）`;
  }
}

/**
 * 个股 AI 分析简报
 */
async function analyzeStock({ code, name, quote, profile, metrics }) {
  // 未配置 API → 返回本地模板分析
  const templateResult = generateTemplateAnalysis({ code, name, quote, metrics });

  const systemPrompt = `你是一个专业的价值投资分析师，擅长用通俗易懂的中文分析 A 股上市公司。
请根据提供的财务数据和行情信息，输出结构化的分析报告，包括：

1. **公司概览** — 一句话总结这家公司
2. **财务健康** — RoE、毛利率、净利率等关键指标解读
3. **估值判断** — 当前价格是否合理
4. **优势与风险** — 各列出 2-3 点
5. **综合建议** — 一句话操作建议

注意：分析基于有限数据，仅供学习参考，不构成投资建议。保持客观，不吹不黑。`;

  // 完整行情数据
  const quoteText = quote
    ? [
        `当前股价: ${quote.price ?? '—'} 元`,
        `涨跌幅: ${quote.changePercent ?? '—'}%`,
        `涨跌额: ${quote.change ?? '—'} 元`,
        `昨收: ${quote.prevClose ?? '—'} 元`,
        `开盘: ${quote.open ?? '—'} 元`,
        `最高: ${quote.high ?? '—'} 元`,
        `最低: ${quote.low ?? '—'} 元`,
        `振幅: ${quote.amplitude ?? '—'}%`,
        `成交量: ${quote.volume ?? '—'} 手`,
        `成交额: ${quote.turnover ?? '—'} 万元`,
        `换手率: ${quote.turnoverRate ?? '—'}%`,
        `市盈率 PE: ${quote.pe ?? '—'}`,
        `市净率 PB: ${quote.pb ?? '—'}`,
        `总市值: ${quote.marketCap ?? '—'} 亿`,
      ].join(' | ')
    : '暂无实时行情数据';

  // 公司简介
  const profileText = profile ? `主营业务：${profile.mainBusiness || '—'}` : '暂无公司简介';

  const metricsText =
    metrics && metrics.length
      ? metrics.map((m) => `${m.label}: ${m.value}`).join('\n')
      : '暂无详细财务指标';

  const userMessage = `请分析 ${name}（${code}）：

【公司简介】
${profileText}

【行情数据】
${quoteText}

【财务指标】
${metricsText}

请给出专业、简洁的分析报告。`;

  const aiResult = await callLLM(systemPrompt, userMessage, { maxTokens: 1500, temperature: 0.3 });
  return aiResult || templateResult;
}

/**
 * 无 AI 时的本地模板分析
 */
function generateTemplateAnalysis({ code, name, quote, metrics }) {
  const roe = metrics?.find((m) => m.label?.includes('RoE'))?.value || '—';
  const grossMargin = metrics?.find((m) => m.label?.includes('毛利率'))?.value || '—';
  const netMargin = metrics?.find((m) => m.label?.includes('净利率'))?.value || '—';
  const cashRatio = metrics?.find((m) => m.label?.includes('现金'))?.value || '—';
  const dividendRate = metrics?.find((m) => m.label?.includes('分红'))?.value || '—';

  return `📊 ${name}（${code}）分析报告

━━━━━━━━━━━━━━━━━━
一、公司概览
${name} 是 A 股市场的一只标的。该数据基于 Mock 财务指标生成，
建议配置 AI API Key 获取更专业的分析。

━━━━━━━━━━━━━━━━━━
二、财务健康
• RoE（股东权益报酬率）：${roe}
• 毛利率：${grossMargin}
• 净利率：${netMargin}
• 现金比率：${cashRatio}
• 分红率：${dividendRate}

━━━━━━━━━━━━━━━━━━
三、操作建议
• 使用筛选器对比同行业其他公司的指标
• 结合金字塔排行榜查看综合评分
• 学习"交易课"中的分析方法
• 配置 AI API Key 后可获取深度分析

💡 提示：在 .env 文件中配置 OPENAI_API_KEY + OPENAI_BASE_URL
即可使用国内 AI 服务（如 DeepSeek、硅基流动、通义千问）`;
}

/**
 * AI 智能问答 — 投资交易相关
 */
async function askQuestion(question, context = {}) {
  const { stockName, userLevel } = context;

  // 未配置 API → 返回本地 FAQ 模板
  const templateAnswer = generateTemplateAnswer(question);
  if (templateAnswer) {
    return templateAnswer;
  }

  const systemPrompt = `你是一个价值投资交易教练 "StockMind AI 小助手"，基于以下理念回答用户问题：

- 投资理念：价值投资 + 概率思维，长期持有优质企业
- 分析方法：以财务数据（RoE、毛利率、净利率等）为核心筛选标的
- 交易策略：低风险、高胜率，耐心等待机会
- 课程体系：从零到稳定盈利，分为 5 个章节

回答规则：
1. 用中文回答，语气亲切专业
2. 保持简洁（200 字以内），避免空洞的套话
3. 结合具体财务指标或交易方法来说明
4. 对于不确定的内容，明确说"这个我不确定"
5. 不推荐具体股票代码，只教分析方法

${userLevel ? `用户水平：${userLevel}` : ''}
${stockName ? `用户正在查看：${stockName}` : ''}`;

  const result = await callLLM(systemPrompt, question, { maxTokens: 1024, temperature: 0.5 });
  return result || getDefaultFallbackAnswer();
}

/**
 * 无 AI 时的本地 FAQ 匹配
 */
function generateTemplateAnswer(question) {
  const q = question.toLowerCase();
  const faq = {
    roe: 'RoE（股东权益报酬率）是衡量公司运用股东资本获利能力的核心指标。一般来说，RoE 长期维持在 15% 以上的公司具备较好的盈利能力。可以在 A 股筛选器的指标排名中查看各公司的 RoE 排名。',
    毛利率:
      '毛利率 = (营业收入 - 营业成本) / 营业收入，反映产品本身的盈利能力。高毛利率通常意味着公司有较强的定价权或品牌溢价，比如贵州茅台的毛利率长期在 90% 以上。',
    净利率:
      '净利率 = 净利润 / 营业收入，是扣除所有费用后最终的盈利水平。净利率高说明公司控费能力强。一般净利率 > 10% 算不错，> 20% 算优秀。',
    出场: '判断出场点有几个原则：① 买入逻辑变了（如基本面恶化）；② 达到了预设的止损/止盈位；③ 发现了性价比更高的标的。不要因为"感觉要跌"就卖出，要用规则来约束。',
    止损: '止损是交易纪律的核心。建议：① 每笔交易前设定止损位（如 -8%~-15%）；② 用技术面关键支撑位作为止损参考；③ 止损后不要立即追回，先冷静分析原因。',
    仓位: '仓位管理建议：① 单只股票不超过总资金的 20%；② 分批建仓，第一次只买计划的 1/3~1/2；③ 留足现金应对极端行情。',
    分红: '分红率 = 每股分红 / 每股净利润。分红率高的公司通常现金流稳定，但不代表公司更好。成长型公司往往少分红甚至不分红（把利润拿去再投资）。银行、公用事业通常分红较高。',
    市盈率:
      '市盈率（PE）= 股价 / 每股收益。PE 低不一定便宜，PE 高不一定贵——关键是和公司自己的历史 PE 范围比，同行业比。建议关注 PE 百分位。',
    价值投资:
      '价值投资的核心理念：① 买股票就是买公司；② 市场短期是投票器，长期是称重机；③ 安全边际——以低于内在价值的价格买入；④ 能力圈——只投你懂的公司。',
  };

  for (const [key, answer] of Object.entries(faq)) {
    if (q.includes(key)) {
      return answer;
    }
  }
  return null;
}

function getDefaultFallbackAnswer() {
  return `抱歉，AI 服务尚未配置，我暂时只能回答常见的基础问题。

你可以尝试问：
• RoE 是什么意思？
• 毛利率怎么看？
• 如何设置止损？
• 什么是价值投资？

💡 如需智能问答，请在 .env 中配置 API Key：
• DeepSeek（国内首选）：OPENAI_API_KEY + OPENAI_BASE_URL=https://api.deepseek.com
• 硅基流动：OPENAI_API_KEY + OPENAI_BASE_URL=https://api.siliconflow.cn/v1
• 通义千问：OPENAI_API_KEY + OPENAI_BASE_URL=https://dashscope.aliyun.com/compatible-mode/v1`;
}

module.exports = { analyzeStock, askQuestion };
