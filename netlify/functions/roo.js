/**
 * Roo Feedback Endpoint
 * ---------------------
 * Accepts idea/bug reports from the aidedeq.org Roo widget, writes them to
 * the shared aeq_feedback Supabase table (auto-dedupes via fingerprint
 * trigger), runs a Claude Haiku classifier for severity/routing, and sends
 * an auto-acknowledgment email when a sending key is available.
 *
 * POST /.netlify/functions/roo
 * Body: { feedback_type, message, email, anonymous, anonymous_note, page_url, page_context }
 */

const { createClient } = require('./_supabase');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

const APP_NAME = 'aidedeq';
const VALID_TYPES = new Set(['idea', 'bug', 'content']);

// Simple in-memory rate limit per warm container (best-effort).
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count <= RATE_MAX;
}

function sanitize(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function classify(message, feedbackType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { severity: 'low', assigned_to: null };

  const systemPrompt = `You classify user feedback for a nonprofit AI tools company. Return ONLY compact JSON with two fields and nothing else:
{"severity": "low"|"med"|"high"|"critical", "assigned_to": "joyi"|"gabby"|"content"|null}

Severity guidance:
- critical: site is broken, payments fail, data loss, security risk, safety issue
- high: major feature broken, many users affected, revenue-blocking
- med: confusing UX, wrong copy, minor feature broken
- low: polish, ideas, nice-to-haves, content typos

Routing guidance:
- joyi: workshops, booking, donations, programs, community, content
- gabby: technical tools, AI, integrations, dashboards, custom builds, bugs
- content: copy fixes, typos, missing info on pages
- null: uncertain

For ideas, severity is usually "low" unless the idea is urgent.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Type: ${feedbackType}\nMessage: ${message}` }],
      }),
    });
    if (!response.ok) return { severity: 'low', assigned_to: null };
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { severity: 'low', assigned_to: null };
    const parsed = JSON.parse(match[0]);
    const severity = ['low', 'med', 'high', 'critical'].includes(parsed.severity) ? parsed.severity : 'low';
    const assigned_to = ['joyi', 'gabby', 'content'].includes(parsed.assigned_to) ? parsed.assigned_to : null;
    return { severity, assigned_to };
  } catch (err) {
    console.error('Classifier error:', err);
    return { severity: 'low', assigned_to: null };
  }
}

async function sendAcknowledgment({ email, feedbackType, message }) {
  // Resend first, SendGrid second. If neither key is set, log and skip.
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  const typeLabel = feedbackType === 'idea' ? 'idea' : feedbackType === 'bug' ? 'bug report' : 'note';
  const subject = `Roo got your ${typeLabel} — hopping it to the team`;
  const textBody = `Hi,

Roo here. I received your ${typeLabel} and I am hopping it to the team lead right now.

What you sent:
"${message}"

JoYi or Gabby will follow up within two business days. If it is urgent, reply to this email or reach us at info@aidedeq.org.

Thanks for helping make AIdedEQ better.

— Roo (and the humans behind her)
https://aidedeq.org`;

  const htmlBody = textBody.replace(/\n/g, '<br>');

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Roo at AIdedEQ <onboarding@resend.dev>',
          to: [email],
          reply_to: 'info@aidedeq.org',
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (!resp.ok) console.error('Resend error:', resp.status, await resp.text());
      return;
    } catch (err) {
      console.error('Resend failure:', err);
    }
  }

  if (sendgridKey) {
    try {
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: 'info@aidedeq.org', name: 'Roo at AIdedEQ' },
          reply_to: { email: 'info@aidedeq.org' },
          subject,
          content: [
            { type: 'text/plain', value: textBody },
            { type: 'text/html', value: htmlBody },
          ],
        }),
      });
      if (!resp.ok) console.error('SendGrid error:', resp.status, await resp.text());
      return;
    } catch (err) {
      console.error('SendGrid failure:', err);
    }
  }

  console.log(`[Roo] No email sender configured; would have acknowledged ${email}`);
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
    return { statusCode: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  const clientIp = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || event.headers['client-ip'] || 'unknown';
  if (!checkRate(clientIp)) {
    return { statusCode: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many reports. Give Roo a minute to catch up.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const feedback_type = sanitize(body.feedback_type, 20);
    const message = sanitize(body.message, 2000);
    const email = validEmail(body.email) ? body.email.trim().toLowerCase() : null;
    const anonymous = body.anonymous === true;
    const anonymous_note = sanitize(body.anonymous_note, 500);
    const page_url = sanitize(body.page_url, 500);
    const page_context = sanitize(body.page_context, 200);
    const user_agent = sanitize(event.headers['user-agent'] || '', 500);
    // Honeypot — client-side JS never fills this; bots usually will.
    const honeypot = sanitize(body.website, 200);

    if (honeypot) {
      // Silent success to avoid tipping off scrapers.
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    if (!VALID_TYPES.has(feedback_type)) {
      return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unknown report type.' }) };
    }

    if (!message || message.length < 4) {
      return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Tell Roo a little more about it.' }) };
    }

    if (!anonymous && !email) {
      return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Email looks off. Double check it, or tap "Need to stay anonymous".' }) };
    }

    // Classify in parallel-ish; if it fails we still write.
    const classification = await classify(message, feedback_type);

    // Compose the message we store. For anonymous submissions with a note,
    // append the note so the triager has context.
    const storedMessage = anonymous && anonymous_note
      ? `${message}\n\n[Anonymous note: ${anonymous_note}]`
      : message;

    const supabase = createClient();
    const { data, error } = await supabase.from('aeq_feedback').insert({
      app_name: APP_NAME,
      user_email: anonymous ? null : email,
      feedback_type,
      message: storedMessage,
      page_context: page_context || null,
      page_url: page_url || null,
      user_agent,
      severity: classification.severity,
      assigned_to: classification.assigned_to,
    });

    if (error) {
      console.error('[Roo] Supabase insert error:', error);
      return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Roo got stuck. Try again or email info@aidedeq.org.' }) };
    }

    // Fire-and-forget the email acknowledgment (best effort; do not block response).
    if (!anonymous && email) {
      sendAcknowledgment({ email, feedbackType: feedback_type, message }).catch((err) => {
        console.error('[Roo] ack email failed:', err);
      });
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: anonymous
          ? "Roo got it. She can't hop back without an email, but she's got the report."
          : 'Roo got it. Hopping it to the team lead.',
      }),
    };
  } catch (err) {
    console.error('[Roo] handler error:', err);
    return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Roo got stuck. Please try again.' }) };
  }
};
