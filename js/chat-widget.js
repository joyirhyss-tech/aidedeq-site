/**
 * AIdedEQ Roo Super-Agent Widget
 * --------------------------------
 * Three modes in one panel:
 *   - Ask Roo            → Claude Haiku chat (existing FAQ + booking flow)
 *   - Great Idea for Roo → writes to aeq_feedback via /roo
 *   - Report to Roo      → writes to aeq_feedback via /roo
 *
 * Email-first: required by default. "Need to stay anonymous?" reveals the
 * anonymous path (email dropped, optional note kept).
 */
(function () {
  'use strict';

  const API_BASE = '/.netlify/functions';
  const STORAGE_KEY = 'aeq_chat_conversation_id';
  const ASSETS = '/assets/roo';

  let conversationId = localStorage.getItem(STORAGE_KEY) || null;
  let isOpen = false;
  let isLoading = false;
  let bookingState = null;
  let availableSlots = null;
  let activeTab = 'ask';

  // --- Styles ---
  const styles = document.createElement('style');
  styles.textContent = `
    #aeq-chat-widget {
      --aeq-primary: #1a1a4e;
      --aeq-accent: #c5a880;
      --aeq-bg: #f9f8f5;
      --aeq-fg: #1a1a2e;
      --aeq-muted: #6b6560;
      --aeq-border: #d4cdc3;
      --roo-pink: #E89BC2;
      --roo-pink-deep: #C8608F;
      --roo-pink-bg: #FCE4F0;
      --aeq-font: 'Space Grotesk', system-ui, -apple-system, sans-serif;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      font-family: var(--aeq-font);
    }

    #aeq-chat-toggle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #F7C1DA 0%, var(--roo-pink) 55%, var(--roo-pink-deep) 100%);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 18px rgba(200, 96, 143, 0.35);
      transition: transform 0.2s, box-shadow 0.2s;
      padding: 0;
      overflow: visible;
      position: relative;
      animation: aeq-roo-float 3.2s ease-in-out infinite;
    }

    #aeq-chat-toggle:hover {
      transform: translateY(-3px) scale(1.04);
      box-shadow: 0 10px 24px rgba(200, 96, 143, 0.45);
      animation: aeq-roo-hop 0.6s ease;
    }

    #aeq-chat-toggle img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      pointer-events: none;
    }

    .aeq-roo-speech {
      position: absolute;
      right: 72px;
      top: 50%;
      transform: translateY(-50%) translateX(6px);
      background: #fff;
      border: 1px solid var(--aeq-border);
      border-radius: 14px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--aeq-fg);
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }

    #aeq-chat-toggle:hover .aeq-roo-speech {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }

    @keyframes aeq-roo-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    @keyframes aeq-roo-hop {
      0% { transform: translateY(-3px) scale(1.04); }
      40% { transform: translateY(-10px) scale(1.06); }
      100% { transform: translateY(-3px) scale(1.04); }
    }

    @media (prefers-reduced-motion: reduce) {
      #aeq-chat-toggle { animation: none; }
      #aeq-chat-toggle:hover { animation: none; transform: scale(1.03); }
    }

    #aeq-chat-panel {
      display: none;
      position: fixed;
      bottom: 96px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 560px;
      max-height: calc(100vh - 140px);
      background: var(--aeq-bg);
      border: 1px solid var(--aeq-border);
      border-radius: 14px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.15);
      flex-direction: column;
      overflow: hidden;
    }

    #aeq-chat-panel.open { display: flex; }

    #aeq-chat-header {
      background: linear-gradient(135deg, var(--roo-pink-deep) 0%, var(--roo-pink) 100%);
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .aeq-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .aeq-header-left img {
      width: 34px;
      height: 34px;
      object-fit: contain;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      padding: 2px;
    }

    #aeq-chat-header h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0.2px;
    }

    #aeq-chat-header p {
      font-size: 11.5px;
      opacity: 0.9;
      margin: 2px 0 0;
    }

    #aeq-chat-close {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      padding: 4px;
      opacity: 0.85;
    }
    #aeq-chat-close:hover { opacity: 1; }

    .aeq-tabs {
      display: flex;
      background: #fff;
      border-bottom: 1px solid var(--aeq-border);
      flex-shrink: 0;
    }

    .aeq-tab {
      flex: 1;
      padding: 10px 6px;
      background: none;
      border: none;
      font-family: var(--aeq-font);
      font-size: 11.5px;
      font-weight: 600;
      color: var(--aeq-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.2s, border-color 0.2s, background 0.2s;
      letter-spacing: 0.2px;
    }
    .aeq-tab:hover { color: var(--roo-pink-deep); background: var(--roo-pink-bg); }
    .aeq-tab.active {
      color: var(--roo-pink-deep);
      border-bottom-color: var(--roo-pink-deep);
      background: #fff;
    }

    .aeq-tab-panel {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    .aeq-tab-panel.active { display: flex; }

    #aeq-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .aeq-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .aeq-msg-user {
      align-self: flex-end;
      background: var(--aeq-primary);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .aeq-msg-assistant {
      align-self: flex-start;
      background: #fff;
      color: var(--aeq-fg);
      border: 1px solid var(--aeq-border);
      border-bottom-left-radius: 4px;
    }
    .aeq-msg-typing {
      align-self: flex-start;
      background: #fff;
      border: 1px solid var(--aeq-border);
      padding: 12px 18px;
      border-radius: 12px;
    }
    .aeq-typing-dots { display: flex; gap: 4px; }
    .aeq-typing-dots span {
      width: 6px; height: 6px;
      background: var(--aeq-muted);
      border-radius: 50%;
      animation: aeq-bounce 1.4s infinite ease-in-out;
    }
    .aeq-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .aeq-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes aeq-bounce {
      0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
      40% { transform: scale(1.2); opacity: 1; }
    }

    #aeq-chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--aeq-border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      background: #fff;
    }
    #aeq-chat-input {
      flex: 1;
      border: 1px solid var(--aeq-border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      font-family: var(--aeq-font);
      outline: none;
      resize: none;
      max-height: 80px;
      line-height: 1.4;
    }
    #aeq-chat-input:focus { border-color: var(--roo-pink-deep); }
    #aeq-chat-send {
      background: var(--roo-pink-deep);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s, background 0.2s;
    }
    #aeq-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
    #aeq-chat-send svg {
      width: 18px; height: 18px;
      fill: none; stroke: currentColor;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }

    .aeq-slot-grid { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .aeq-slot-day { font-size: 13px; font-weight: 600; color: var(--aeq-fg); margin-top: 4px; }
    .aeq-slot-btn {
      background: var(--aeq-bg);
      border: 1px solid var(--aeq-accent);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-family: var(--aeq-font);
      color: var(--aeq-primary);
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    .aeq-slot-btn:hover { background: var(--aeq-accent); color: #fff; }

    /* Feedback forms (Idea / Bug) */
    .aeq-form {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--aeq-bg);
    }
    .aeq-form-intro {
      font-size: 13px;
      line-height: 1.5;
      color: var(--aeq-fg);
      margin: 0 0 4px;
    }
    .aeq-form-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--aeq-fg);
      margin-bottom: 2px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .aeq-form-label .aeq-hint {
      font-weight: 400;
      color: var(--aeq-muted);
      font-size: 11px;
    }
    .aeq-form input[type="email"],
    .aeq-form input[type="text"],
    .aeq-form textarea {
      border: 1px solid var(--aeq-border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      font-family: var(--aeq-font);
      background: #fff;
      color: var(--aeq-fg);
      outline: none;
      resize: vertical;
    }
    .aeq-form input:focus, .aeq-form textarea:focus {
      border-color: var(--roo-pink-deep);
      box-shadow: 0 0 0 3px rgba(200,96,143,0.12);
    }
    .aeq-form textarea { min-height: 110px; line-height: 1.45; }
    .aeq-form .aeq-honeypot { position: absolute; left: -9999px; opacity: 0; height: 0; width: 0; }
    .aeq-form-submit {
      background: var(--roo-pink-deep);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px 16px;
      font-family: var(--aeq-font);
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.2s, transform 0.15s;
    }
    .aeq-form-submit:hover { background: #a84973; transform: translateY(-1px); }
    .aeq-form-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .aeq-anon-link {
      background: none;
      border: none;
      color: var(--aeq-muted);
      font-size: 11px;
      font-family: var(--aeq-font);
      padding: 4px 0;
      cursor: pointer;
      text-align: center;
      text-decoration: underline;
      text-underline-offset: 2px;
      margin-top: 4px;
    }
    .aeq-anon-link:hover { color: var(--roo-pink-deep); }

    .aeq-anon-banner {
      display: none;
      background: var(--roo-pink-bg);
      border: 1px solid rgba(200,96,143,0.25);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11.5px;
      color: var(--roo-pink-deep);
      line-height: 1.45;
    }
    .aeq-form.anon .aeq-anon-banner { display: block; }
    .aeq-form.anon .aeq-email-group { display: none; }
    .aeq-form:not(.anon) .aeq-anon-note-group { display: none; }

    .aeq-form-error {
      display: none;
      background: #FFECEC;
      color: #B22E2E;
      border: 1px solid #F3B9B9;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .aeq-form-error.show { display: block; }

    /* Toast */
    #aeq-toast {
      position: fixed;
      bottom: 96px;
      right: 96px;
      background: #2F4F35;
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-family: var(--aeq-font);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s, transform 0.3s;
      pointer-events: none;
      z-index: 100000;
      max-width: 260px;
    }
    #aeq-toast.show { opacity: 1; transform: translateY(0); }

    @media (max-width: 480px) {
      #aeq-chat-panel {
        bottom: 0; right: 0;
        width: 100vw; height: 100vh;
        max-height: 100vh; max-width: 100vw;
        border-radius: 0;
      }
      #aeq-chat-widget #aeq-chat-toggle { bottom: 16px; right: 16px; }
      #aeq-toast { bottom: 90px; right: 16px; left: 16px; max-width: none; }
    }
  `;
  document.head.appendChild(styles);

  // --- Build DOM ---
  const widget = document.createElement('div');
  widget.id = 'aeq-chat-widget';
  widget.innerHTML = `
    <div id="aeq-chat-panel" role="dialog" aria-label="Chat with Roo">
      <div id="aeq-chat-header">
        <div class="aeq-header-left">
          <img src="${ASSETS}/roo-header.png" alt="" aria-hidden="true" />
          <div>
            <h3>Roo at AIdedEQ</h3>
            <p>Ask a question. Share an idea. Report a bug.</p>
          </div>
        </div>
        <button id="aeq-chat-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="aeq-tabs" role="tablist">
        <button class="aeq-tab active" data-tab="ask" role="tab" aria-selected="true">💬 Ask Roo</button>
        <button class="aeq-tab" data-tab="idea" role="tab" aria-selected="false">💡 Great Idea</button>
        <button class="aeq-tab" data-tab="bug" role="tab" aria-selected="false">🐞 Report</button>
      </div>

      <!-- Ask Roo -->
      <div class="aeq-tab-panel active" data-tab-panel="ask">
        <div id="aeq-chat-messages"></div>
        <div id="aeq-chat-input-area">
          <textarea id="aeq-chat-input" rows="1" placeholder="Ask a question..." aria-label="Chat message"></textarea>
          <button id="aeq-chat-send" aria-label="Send message">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>

      <!-- Great Idea for Roo -->
      <div class="aeq-tab-panel" data-tab-panel="idea">
        <form class="aeq-form" id="aeq-idea-form" novalidate>
          <p class="aeq-form-intro">A tool you wish existed, or a suggestion for us. Roo hops it to the team.</p>
          <div class="aeq-form-error" data-error></div>
          <div class="aeq-anon-banner">
            Roo can take this anonymously. She just can't write back.
          </div>
          <div class="aeq-email-group">
            <label class="aeq-form-label" for="aeq-idea-email">Your email <span class="aeq-hint">so Roo can hop back</span></label>
            <input type="email" id="aeq-idea-email" name="email" autocomplete="email" placeholder="you@example.com" />
          </div>
          <label class="aeq-form-label" for="aeq-idea-message">Your idea</label>
          <textarea id="aeq-idea-message" name="message" placeholder="A tool you wish existed, or a way we could serve better..."></textarea>
          <div class="aeq-anon-note-group">
            <label class="aeq-form-label" for="aeq-idea-anon-note">Quick note about why (optional)</label>
            <input type="text" id="aeq-idea-anon-note" name="anonymous_note" placeholder="Only visible to the triage team" />
          </div>
          <input type="text" class="aeq-honeypot" name="website" tabindex="-1" autocomplete="off" />
          <button type="submit" class="aeq-form-submit">Send to Roo</button>
          <button type="button" class="aeq-anon-link" data-anon-toggle>Need to stay anonymous? Tap here.</button>
        </form>
      </div>

      <!-- Report to Roo -->
      <div class="aeq-tab-panel" data-tab-panel="bug">
        <form class="aeq-form" id="aeq-bug-form" novalidate>
          <p class="aeq-form-intro">Something broken or confusing? Tell Roo what happened and she'll hop it to the team.</p>
          <div class="aeq-form-error" data-error></div>
          <div class="aeq-anon-banner">
            Roo can take this anonymously. She just can't write back.
          </div>
          <div class="aeq-email-group">
            <label class="aeq-form-label" for="aeq-bug-email">Your email <span class="aeq-hint">so Roo can hop back</span></label>
            <input type="email" id="aeq-bug-email" name="email" autocomplete="email" placeholder="you@example.com" />
          </div>
          <label class="aeq-form-label" for="aeq-bug-message">What happened?</label>
          <textarea id="aeq-bug-message" name="message" placeholder="What broke? What did you expect? A link, a page, a form..."></textarea>
          <div class="aeq-anon-note-group">
            <label class="aeq-form-label" for="aeq-bug-anon-note">Quick note about why (optional)</label>
            <input type="text" id="aeq-bug-anon-note" name="anonymous_note" placeholder="Only visible to the triage team" />
          </div>
          <input type="text" class="aeq-honeypot" name="website" tabindex="-1" autocomplete="off" />
          <button type="submit" class="aeq-form-submit">Send to Roo</button>
          <button type="button" class="aeq-anon-link" data-anon-toggle>Need to stay anonymous? Tap here.</button>
        </form>
      </div>
    </div>

    <button id="aeq-chat-toggle" aria-label="Open Roo">
      <img src="${ASSETS}/roo-btn.png" alt="Roo the kangaroo" />
      <span class="aeq-roo-speech">Ask Roo. Report to Roo.</span>
    </button>

    <div id="aeq-toast" role="status" aria-live="polite"></div>
  `;
  document.body.appendChild(widget);

  // --- Elements ---
  const toggle = document.getElementById('aeq-chat-toggle');
  const panel = document.getElementById('aeq-chat-panel');
  const closeBtn = document.getElementById('aeq-chat-close');
  const messages = document.getElementById('aeq-chat-messages');
  const input = document.getElementById('aeq-chat-input');
  const sendBtn = document.getElementById('aeq-chat-send');
  const toast = document.getElementById('aeq-toast');
  const tabs = widget.querySelectorAll('.aeq-tab');
  const tabPanels = widget.querySelectorAll('.aeq-tab-panel');

  // --- Toast ---
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
  }

  // --- Tabs ---
  function switchTab(name) {
    activeTab = name;
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === name));
    if (name === 'ask') setTimeout(() => input.focus(), 50);
  }
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // --- Panel open/close ---
  function openChat() {
    isOpen = true;
    panel.classList.add('open');
    toggle.style.display = 'none';
    if (activeTab === 'ask') input.focus();

    if (messages.children.length === 0) {
      addMessage('assistant', 'Hey there. I am Roo. I can answer questions about our tools and services, help you set up a call, or take an idea you want us to build. What brings you here?');
    }
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove('open');
    toggle.style.display = 'flex';
  }

  toggle.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);

  // --- Chat messaging ---
  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `aeq-msg aeq-msg-${role}`;
    div.textContent = content;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addSlotPicker(groups) {
    const container = document.createElement('div');
    container.className = 'aeq-msg aeq-msg-assistant';
    let html = '<div>Here are the available times:</div><div class="aeq-slot-grid">';
    const maxDays = 5;
    let dayCount = 0;
    for (const group of groups) {
      if (dayCount >= maxDays) break;
      html += `<div class="aeq-slot-day">${group.label}</div>`;
      for (const slot of group.times) {
        html += `<button class="aeq-slot-btn" data-start="${slot.start}" data-end="${slot.end}" data-label="${group.label} at ${slot.label} CT">${slot.label} CT</button>`;
      }
      dayCount++;
    }
    if (groups.length > maxDays) {
      html += `<div style="font-size:12px;color:var(--aeq-muted);margin-top:4px;">More times available -- ask me to show the next week.</div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    messages.appendChild(container);
    messages.scrollTop = messages.scrollHeight;
    container.querySelectorAll('.aeq-slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleSlotSelect(btn));
    });
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'aeq-msg-typing';
    div.id = 'aeq-typing';
    div.innerHTML = '<div class="aeq-typing-dots"><span></span><span></span><span></span></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }
  function hideTyping() {
    const el = document.getElementById('aeq-typing');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isLoading) return;
    isLoading = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    addMessage('user', text);
    showTyping();

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          page_url: window.location.pathname,
        }),
      });
      hideTyping();
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      if (data.conversation_id && data.conversation_id !== conversationId) {
        conversationId = data.conversation_id;
        localStorage.setItem(STORAGE_KEY, conversationId);
      }
      if (data.error) {
        addMessage('assistant', data.error);
      } else {
        addMessage('assistant', data.reply);
        const replyLower = (data.reply || '').toLowerCase();
        if (replyLower.includes('here are some times') || replyLower.includes('checking the calendar') || replyLower.includes('let me pull up times')) {
          await showAvailability();
        }
      }
    } catch (error) {
      hideTyping();
      addMessage('assistant', 'I am having trouble connecting right now. Please try again or email info@aidedeq.org.');
    }
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }

  async function showAvailability() {
    try {
      const response = await fetch(`${API_BASE}/chat-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-availability' }),
      });
      const data = await response.json();
      if (data.mode === 'fallback') {
        addMessage('assistant', data.message);
        return;
      }
      if (data.groups && data.groups.length > 0) {
        availableSlots = data.groups;
        bookingState = 'showing-slots';
        addSlotPicker(data.groups);
      } else {
        addMessage('assistant', 'It looks like there are no open slots this month. Please email info@aidedeq.org and we will find a time that works.');
      }
    } catch (error) {
      addMessage('assistant', 'I could not check the calendar right now. You can browse times at aidedeq.org/book/ instead.');
    }
  }

  function handleSlotSelect(btn) {
    const start = btn.dataset.start;
    const end = btn.dataset.end;
    const label = btn.dataset.label;
    addMessage('user', `I would like to book: ${label}`);
    bookingState = 'collecting-info';
    addMessage('assistant', 'Great choice. To complete the booking, I need a few details. Please type your name, email, and organization (if applicable) in this format:\n\nName: [your name]\nEmail: [your email]\nOrg: [organization name]');
    widget.dataset.slotStart = start;
    widget.dataset.slotEnd = end;
    widget.dataset.slotLabel = label;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (bookingState === 'collecting-info') handleBookingInfo();
      else sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => {
    if (bookingState === 'collecting-info') handleBookingInfo();
    else sendMessage();
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  });

  async function handleBookingInfo() {
    const text = input.value.trim();
    if (!text || isLoading) return;
    isLoading = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    addMessage('user', text);

    const lines = text.split('\n').map((l) => l.trim());
    let name = '', email = '', org = '';
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('name:')) name = line.slice(5).trim();
      else if (lower.startsWith('email:')) email = line.slice(6).trim();
      else if (lower.startsWith('org:') || lower.startsWith('organization:')) org = line.slice(line.indexOf(':') + 1).trim();
    }
    if (!email) {
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) email = emailMatch[0];
    }
    if (!name) {
      for (const line of lines) {
        if (line && !line.includes('@') && !line.toLowerCase().startsWith('org')) {
          name = line.replace(/^name\s*:?\s*/i, '');
          break;
        }
      }
    }
    if (!name || !email) {
      addMessage('assistant', 'I need at least your name and email to complete the booking. Please try again:\n\nName: [your name]\nEmail: [your email]');
      isLoading = false;
      sendBtn.disabled = false;
      return;
    }
    showTyping();
    try {
      const response = await fetch(`${API_BASE}/chat-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'book',
          name, email, organization: org,
          selected_slot_start: widget.dataset.slotStart,
          selected_slot_end: widget.dataset.slotEnd,
          conversation_id: conversationId,
          tool_topic: 'AIdedEQ general inquiry',
          selected_reason: 'Specific questions after seeing the tool',
        }),
      });
      hideTyping();
      const data = await response.json();
      if (data.ok) {
        bookingState = null;
        addMessage('assistant', data.message + '\n\nNeed to reschedule? Use the link in your calendar invite, or email info@aidedeq.org.');
      } else {
        addMessage('assistant', data.error || 'Something went wrong with the booking. Please try again or visit aidedeq.org/book/.');
      }
    } catch (error) {
      hideTyping();
      addMessage('assistant', 'I could not complete the booking right now. Please visit aidedeq.org/book/ to book directly.');
    }
    bookingState = null;
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // --- Feedback forms (Idea / Bug) ---
  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function wireForm(formId, feedbackType) {
    const form = document.getElementById(formId);
    if (!form) return;
    const errorEl = form.querySelector('[data-error]');
    const anonToggle = form.querySelector('[data-anon-toggle]');
    const emailEl = form.querySelector('input[type="email"]');
    const messageEl = form.querySelector('textarea[name="message"]');
    const anonNoteEl = form.querySelector('input[name="anonymous_note"]');
    const honeypotEl = form.querySelector('input[name="website"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    anonToggle.addEventListener('click', () => {
      const goingAnon = !form.classList.contains('anon');
      form.classList.toggle('anon', goingAnon);
      anonToggle.textContent = goingAnon
        ? 'Actually, I\'ll leave my email. Tap here.'
        : 'Need to stay anonymous? Tap here.';
      if (goingAnon) {
        emailEl.value = '';
      }
      errorEl.classList.remove('show');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.remove('show');
      const anonymous = form.classList.contains('anon');
      const email = emailEl.value.trim();
      const message = messageEl.value.trim();
      const anonymous_note = (anonNoteEl && anonNoteEl.value.trim()) || '';

      if (!message || message.length < 4) {
        errorEl.textContent = 'Tell Roo a little more about it.';
        errorEl.classList.add('show');
        messageEl.focus();
        return;
      }
      if (!anonymous) {
        if (!validateEmail(email)) {
          errorEl.textContent = 'Roo needs a working email to hop back. Double check, or tap "Need to stay anonymous".';
          errorEl.classList.add('show');
          emailEl.focus();
          return;
        }
      }

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Hopping...';

      try {
        const resp = await fetch(`${API_BASE}/roo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback_type: feedbackType,
            message,
            email: anonymous ? null : email,
            anonymous,
            anonymous_note,
            page_url: window.location.pathname,
            page_context: document.title || '',
            website: honeypotEl ? honeypotEl.value : '',
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          errorEl.textContent = data.error || 'Roo got stuck. Try again or email info@aidedeq.org.';
          errorEl.classList.add('show');
          return;
        }
        // Reset form + success feedback
        messageEl.value = '';
        emailEl.value = '';
        if (anonNoteEl) anonNoteEl.value = '';
        form.classList.remove('anon');
        anonToggle.textContent = 'Need to stay anonymous? Tap here.';
        showToast(data.message || 'Roo got it. Hopping it to the team lead.');
        // Drop user back on Ask tab so the conversation can continue.
        switchTab('ask');
      } catch (err) {
        errorEl.textContent = 'Roo got stuck connecting. Please try again.';
        errorEl.classList.add('show');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  wireForm('aeq-idea-form', 'idea');
  wireForm('aeq-bug-form', 'bug');
})();
