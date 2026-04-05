/**
 * AIdedEQ Chat Widget
 * Lightweight, self-contained chat widget for aidedeq.org
 * Connects to Netlify Functions for AI chat + in-chat booking
 */
(function () {
  'use strict';

  const API_BASE = '/.netlify/functions';
  const STORAGE_KEY = 'aeq_chat_conversation_id';

  let conversationId = localStorage.getItem(STORAGE_KEY) || null;
  let isOpen = false;
  let isLoading = false;
  let bookingState = null; // null | 'collecting-info' | 'showing-slots' | 'confirming'
  let availableSlots = null;

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
      --aeq-font: 'Space Grotesk', system-ui, -apple-system, sans-serif;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      font-family: var(--aeq-font);
    }

    #aeq-chat-toggle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--aeq-primary);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    #aeq-chat-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }

    #aeq-chat-toggle svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    #aeq-chat-panel {
      display: none;
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: var(--aeq-bg);
      border: 1px solid var(--aeq-border);
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      flex-direction: column;
      overflow: hidden;
    }

    #aeq-chat-panel.open {
      display: flex;
    }

    #aeq-chat-header {
      background: var(--aeq-primary);
      color: #fff;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    #aeq-chat-header h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
    }

    #aeq-chat-header p {
      font-size: 12px;
      opacity: 0.8;
      margin: 2px 0 0;
    }

    #aeq-chat-close {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
    }

    #aeq-chat-close:hover { opacity: 1; }

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

    .aeq-typing-dots {
      display: flex;
      gap: 4px;
    }

    .aeq-typing-dots span {
      width: 6px;
      height: 6px;
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

    #aeq-chat-input:focus {
      border-color: var(--aeq-accent);
    }

    #aeq-chat-send {
      background: var(--aeq-primary);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }

    #aeq-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #aeq-chat-send svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .aeq-slot-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }

    .aeq-slot-day {
      font-size: 13px;
      font-weight: 600;
      color: var(--aeq-fg);
      margin-top: 4px;
    }

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

    .aeq-slot-btn:hover {
      background: var(--aeq-accent);
      color: #fff;
    }

    @media (max-width: 480px) {
      #aeq-chat-panel {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        max-width: 100vw;
        border-radius: 0;
      }
      #aeq-chat-widget #aeq-chat-toggle {
        bottom: 16px;
        right: 16px;
      }
    }
  `;
  document.head.appendChild(styles);

  // --- Build DOM ---
  const widget = document.createElement('div');
  widget.id = 'aeq-chat-widget';
  widget.innerHTML = `
    <div id="aeq-chat-panel">
      <div id="aeq-chat-header">
        <div>
          <h3>AIdedEQ</h3>
          <p>Ask about our services and tools</p>
        </div>
        <button id="aeq-chat-close" aria-label="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="aeq-chat-messages"></div>
      <div id="aeq-chat-input-area">
        <textarea id="aeq-chat-input" rows="1" placeholder="Ask a question..." aria-label="Chat message"></textarea>
        <button id="aeq-chat-send" aria-label="Send message">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
    <button id="aeq-chat-toggle" aria-label="Open chat">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  `;
  document.body.appendChild(widget);

  // --- Elements ---
  const toggle = document.getElementById('aeq-chat-toggle');
  const panel = document.getElementById('aeq-chat-panel');
  const closeBtn = document.getElementById('aeq-chat-close');
  const messages = document.getElementById('aeq-chat-messages');
  const input = document.getElementById('aeq-chat-input');
  const sendBtn = document.getElementById('aeq-chat-send');

  // --- Toggle ---
  function openChat() {
    isOpen = true;
    panel.classList.add('open');
    toggle.style.display = 'none';
    input.focus();

    if (messages.children.length === 0) {
      addMessage('assistant', 'Hey there. I can answer questions about our tools and services, or help you set up a call with the team. What brings you here?');
    }
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove('open');
    toggle.style.display = 'flex';
  }

  toggle.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);

  // --- Messages ---
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

    // Slot click handlers
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

  // --- Send message ---
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

      if (!response.ok) {
        throw new Error('Network error');
      }

      const data = await response.json();

      if (data.conversation_id && data.conversation_id !== conversationId) {
        conversationId = data.conversation_id;
        localStorage.setItem(STORAGE_KEY, conversationId);
      }

      if (data.error) {
        addMessage('assistant', data.error);
      } else {
        addMessage('assistant', data.reply);

        // Only show calendar when the agent explicitly instructs it (after preference is collected)
        // Trigger phrases: "here are some times", "let me pull up", "checking the calendar now"
        // Do NOT trigger on "find a time" or "check our calendar" — those are offers, not confirmations
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

  // --- Availability ---
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

  // --- Slot selection ---
  function handleSlotSelect(btn) {
    const start = btn.dataset.start;
    const end = btn.dataset.end;
    const label = btn.dataset.label;

    addMessage('user', `I would like to book: ${label}`);
    bookingState = 'collecting-info';

    addMessage('assistant', 'Great choice. To complete the booking, I need a few details. Please type your name, email, and organization (if applicable) in this format:\n\nName: [your name]\nEmail: [your email]\nOrg: [organization name]');

    // Store selected slot for booking
    widget.dataset.slotStart = start;
    widget.dataset.slotEnd = end;
    widget.dataset.slotLabel = label;
  }

  // --- Input handling ---
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      // Check if we're in booking collection mode
      if (bookingState === 'collecting-info') {
        handleBookingInfo();
      } else {
        sendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (bookingState === 'collecting-info') {
      handleBookingInfo();
    } else {
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  });

  // --- Parse booking info and complete booking ---
  async function handleBookingInfo() {
    const text = input.value.trim();
    if (!text || isLoading) return;

    isLoading = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    addMessage('user', text);

    // Parse name/email/org from freeform text
    const lines = text.split('\n').map((l) => l.trim());
    let name = '';
    let email = '';
    let org = '';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('name:')) name = line.slice(5).trim();
      else if (lower.startsWith('email:')) email = line.slice(6).trim();
      else if (lower.startsWith('org:') || lower.startsWith('organization:')) org = line.slice(line.indexOf(':') + 1).trim();
    }

    // Fallback: if structured parsing fails, try to extract email
    if (!email) {
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) email = emailMatch[0];
    }
    if (!name) {
      // Use first line that isn't the email as the name
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
          name,
          email,
          organization: org,
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
})();
