/* ═══════════════════════════════════════════
   StockMind AI · AI 问答助手（浮动窗口）
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  let chatOpen = false;
  let messageCount = 0;

  // 检查 AI 配置状态，区分国内外
  let aiConfigured = false;
  let aiStatusMessage = '';
  fetch('/api/ai/status')
    .then((r) => r.json())
    .then((data) => {
      aiConfigured = data.configured;
      aiStatusMessage = data.message;
    })
    .catch(() => {});

  const CHAT_HTML = `
  <div class="ai-chat-fab" id="aiChatFab" title="AI 问答助手">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  </div>

  <div class="ai-chat-window" id="aiChatWindow">
    <div class="ai-chat__header">
      <span>💬 StockMind AI 小助手</span>
      <button class="ai-chat__close" id="aiChatClose">—</button>
    </div>
    <div class="ai-chat__messages" id="aiChatMessages">
      <div class="ai-chat__msg ai-chat__msg--bot">
        <div class="msg-content">你好！我是 StockMind AI 投资学习小助手，有什么关于股票、交易、投资的问题吗？</div>
      </div>
    </div>
    <div class="ai-chat__input-area">
      <input type="text" class="ai-chat__input" id="aiChatInput" placeholder="输入你的问题..." autocomplete="off">
      <button class="ai-chat__send" id="aiChatSend">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>`;

  const CHAT_CSS = `
  .ai-chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #0071e3;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,113,227,0.3);
    z-index: 3000;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
  }
  .ai-chat-fab:hover { transform: scale(1.05); box-shadow: 0 6px 24px rgba(0,113,227,0.4); }
  .ai-chat-fab.open { transform: scale(0.9); opacity: 0.7; }

  .ai-chat-window {
    position: fixed;
    bottom: 88px;
    right: 24px;
    width: 360px;
    max-height: 520px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    z-index: 3001;
    display: none;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #e8e8ed;
    animation: slideUp 0.25s ease;
  }
  .ai-chat-window.open { display: flex; }

  .ai-chat__header {
    padding: 14px 18px;
    background: #0071e3;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  .ai-chat__close {
    background: rgba(255,255,255,0.15);
    border: none;
    color: #fff;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .ai-chat__close:hover { background: rgba(255,255,255,0.25); }

  .ai-chat__messages {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 200px;
    max-height: 360px;
  }
  .ai-chat__messages::-webkit-scrollbar { width: 3px; }
  .ai-chat__messages::-webkit-scrollbar-thumb { background: #d2d2d7; border-radius: 2px; }

  .ai-chat__msg {
    max-width: 85%;
    animation: fadeIn 0.2s ease;
  }
  .ai-chat__msg--user { align-self: flex-end; }
  .ai-chat__msg--bot { align-self: flex-start; }

  .ai-chat__msg .msg-content {
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 13.5px;
    line-height: 1.6;
    word-break: break-word;
  }
  .ai-chat__msg--user .msg-content {
    background: #0071e3;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .ai-chat__msg--bot .msg-content {
    background: #f5f5f7;
    color: #1d1d1f;
    border-bottom-left-radius: 4px;
  }
  .ai-chat__msg--typing .msg-content {
    background: #f5f5f7;
    color: #aeaeb2;
  }

  .ai-chat__input-area {
    display: flex;
    padding: 10px 12px;
    border-top: 1px solid #e8e8ed;
    gap: 8px;
    flex-shrink: 0;
  }
  .ai-chat__input {
    flex: 1;
    border: none;
    background: #f5f5f7;
    border-radius: 20px;
    padding: 9px 14px;
    font-size: 13px;
    outline: none;
    font-family: inherit;
  }
  .ai-chat__input:focus { background: #e8e8ed; }
  .ai-chat__send {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #0071e3;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .ai-chat__send:hover { background: #0077ed; }
  .ai-chat__send:disabled { background: #d2d2d7; cursor: not-allowed; }

  @media (max-width: 480px) {
    .ai-chat-window {
      left: 12px;
      right: 12px;
      bottom: 84px;
      width: auto;
      max-height: 60vh;
    }
  }`;

  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = CHAT_CSS;
  document.head.appendChild(styleEl);

  // Inject HTML
  const container = document.createElement('div');
  container.innerHTML = CHAT_HTML;
  document.body.appendChild(container);

  // DOM refs
  const fab = document.getElementById('aiChatFab');
  const window_ = document.getElementById('aiChatWindow');
  const messages = document.getElementById('aiChatMessages');
  const input = document.getElementById('aiChatInput');
  const sendBtn = document.getElementById('aiChatSend');
  const closeBtn = document.getElementById('aiChatClose');

  // Events
  fab.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  function toggle() {
    chatOpen = !chatOpen;
    window_.classList.toggle('open', chatOpen);
    fab.classList.toggle('open', chatOpen);
    if (chatOpen) input.focus();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage(text, 'user');
    sendBtn.disabled = true;

    // 检查 AI 配置 — 未配置时也尝试请求（后端有本地 FAQ 兜底）
    if (!aiConfigured) {
      addMessage('⏳ AI 服务未配置，将使用本地知识库回答...', 'bot');
    }

    // 显示 typing indicator
    const typingId = addMessage('⏳ 正在思考...', 'typing');

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });

      // 移除 typing
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (res.ok) {
        const data = await res.json();
        addMessage(data.answer || '抱歉，我没有理解这个问题。', 'bot');
      } else {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        addMessage(`⚠️ ${err.error || 'AI 暂时不可用'}`, 'bot');
      }
    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      addMessage(`⚠️ 网络错误：${err.message}`, 'bot');
    }

    sendBtn.disabled = false;
  }

  function addMessage(text, type) {
    const id = `chat-msg-${++messageCount}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `ai-chat__msg ai-chat__msg--${type === 'typing' ? 'bot' : type}`;
    if (type === 'typing') div.classList.add('ai-chat__msg--typing');
    div.innerHTML = `<div class="msg-content">${text}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return id;
  }
})();
