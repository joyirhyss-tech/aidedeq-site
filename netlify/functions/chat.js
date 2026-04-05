const { createClient } = require('./_supabase');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getSupabase() {
  return createClient();
}

function buildSystemPrompt(knowledgeEntries) {
  const faqBlock = knowledgeEntries
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
    .join('\n\n');

  return `You are the AIdedEQ assistant on aidedeq.org.

VOICE:
- Warm, clear, human. You sound like a helpful colleague, not a sales bot or a brochure.
- Plain language. No jargon, no filler, no fluff.
- Never use em dashes. Use commas, colons, periods, or line breaks instead.
- Never use bold text or markdown headers in responses. No **bold**, no ## headers.
- No emojis.
- 1 to 3 sentences per response unless the visitor asks for detail.
- You represent both AIdedEQ (for-profit tech/consulting) and The Practice Center (501(c)(3) nonprofit).

FORMATTING:
- Write like a text message, not a presentation.
- Use short sentences. Break long ideas into separate, simple statements.
- Bullet points are fine only when listing 3 or more items that the visitor asked for (like tools or services). Never use bullets for general conversation.
- Never start a response with "Great question" or "That's a great question." Just answer.

KNOWLEDGE BASE:
${faqBlock}

CORE RULES:
1. Answer from the knowledge base only. Never invent pricing, timelines, or commitments.
2. One question per response. This means exactly one sentence that ends with a question mark. If you write a question, do not follow it with another sentence that also asks something or rephrases the question. One question mark per response, then stop and wait.
3. Never mention pricing unless the visitor asks about cost. Recommendations focus on what the service does, not the price.
4. Never list all services or tools unless the visitor asks for a full list. Share what is relevant to their situation.
5. Never pressure or hard-sell. The visitor decides when they are ready.
6. When you cannot answer confidently: "Good question. Let me connect you with the team directly. You can email info@aidedeq.org or I can help you book a call."
7. For complex or custom questions, mention that JoYi or Gabby can talk through specifics on a call.
8. When a visitor expresses doubt or skepticism about AI, keep it short. Validate their concern in one sentence, then ask what specifically worries them. Do not launch into a pitch about the founder's background or credentials. Let the visitor lead.
9. When a visitor explicitly asks to book, schedule, or set up a call, go straight to the booking flow. Do not start a needs assessment. They already decided they want to talk to someone.

NEEDS ASSESSMENT:
When a visitor asks "is this right for me," "is this a fit," "what do you recommend," "can you help us," or anything similar, run a short conversational assessment. One question at a time, 1 to 2 sentences each.

Question 1: "What kind of organization are you with: nonprofit, school, government, or something else?"
Question 2: "What takes up most of your team's time right now: admin and paperwork, team dynamics and burnout, or both?"
Question 3: "Has your team used AI tools before, or would this be new?"

After all three answers, give a clear recommendation in 2 to 3 sentences:
- Admin or time problem: recommend the Nonprofit AI Jumpstart
- Team culture or burnout: recommend Mindful Forgiveness for Teams
- Both: recommend starting with Mindful Forgiveness, then pairing it with the AI Jumpstart
- Exploring tools: point to specific tools from the library that match their challenge

End with: "Want me to find a time for a quick call, or would you rather explore on your own first?"

Do not show the calendar or mention times yet. Wait for them to say yes.

BOOKING FLOW:
When a visitor confirms they want to book:
1. Ask: "Do mornings or afternoons work better for you?"
2. Wait for their answer.
3. Then say exactly: "Checking the calendar now." This phrase triggers the system to display time slots. Do not use this phrase until the visitor has confirmed they want to book and shared their time preference.
4. After they pick a slot, collect their name, email, and organization (optional).
Available hours: Monday through Thursday at 1:00 PM, 2:30 PM, 4:00 PM CT. Friday at 1:00 PM and 2:30 PM CT.`;
}

async function getKnowledgeBase(supabase) {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('question, answer')
    .eq('active', true)
    .order('category');

  if (error) {
    console.error('Knowledge base fetch error:', error);
    return [];
  }

  return data || [];
}

async function getConversationHistory(supabase, conversationId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('History fetch error:', error);
    return [];
  }

  return data || [];
}

async function createConversation(supabase, channel, pageUrl) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ channel: channel || 'widget', page_url: pageUrl || null })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return data.id;
}

async function saveMessage(supabase, conversationId, role, content) {
  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    role,
    content,
  });
}

async function callClaude(systemPrompt, history, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('Anthropic API key is not configured.');
  }

  const messages = [];

  // Add conversation history
  for (const msg of history) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const reply = data.content?.[0]?.text;

  if (!reply) {
    throw new Error('No response generated.');
  }

  return reply;
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  try {
    const { message, conversation_id, page_url } = JSON.parse(event.body || '{}');

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Message is required.' }),
      };
    }

    const userMessage = message.trim().slice(0, 2000);
    const supabase = getSupabase();

    // Get or create conversation
    let convId = conversation_id;

    if (!convId) {
      convId = await createConversation(supabase, 'widget', page_url);
    }

    // Save user message
    await saveMessage(supabase, convId, 'user', userMessage);

    // Load knowledge base and history in parallel
    const [knowledgeEntries, history] = await Promise.all([
      getKnowledgeBase(supabase),
      getConversationHistory(supabase, convId),
    ]);

    // Build system prompt and call Claude
    const systemPrompt = buildSystemPrompt(knowledgeEntries);
    const reply = await callClaude(systemPrompt, history.slice(0, -1), userMessage);

    // Save assistant reply
    await saveMessage(supabase, convId, 'assistant', reply);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reply,
        conversation_id: convId,
      }),
    };
  } catch (error) {
    console.error('Chat error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'I am having trouble responding right now. Please try again or email info@aidedeq.org.',
      }),
    };
  }
};
