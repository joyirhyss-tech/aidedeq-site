const { createClient } = require('./_supabase');

/**
 * Invoice reminder approval endpoint.
 * JoYi clicks approve/skip links from the digest email.
 *
 * GET ?invoice=inv_xxx&action=approve  → sends reminder to client
 * GET ?invoice=inv_xxx&action=skip     → marks as skipped
 */
exports.handler = async (event) => {
  const { invoice, action } = event.queryStringParameters || {};

  if (!invoice || !action || !['approve', 'skip'].includes(action)) {
    return htmlResponse(400, 'Invalid request. Expected ?invoice=...&action=approve or action=skip');
  }

  try {
    const supabase = createClient();

    // Find the pending reminder for this invoice
    const { data: reminders } = await supabase
      .from('invoice_reminders')
      .select('id, stripe_invoice_id, customer_email, customer_name, amount_due, reminder_tier, draft_subject, draft_body, status')
      .eq('stripe_invoice_id', invoice)
      .eq('status', 'pending_approval')
      .limit(1);

    const reminder = reminders?.[0];

    if (!reminder) {
      return htmlResponse(404, 'No pending reminder found for this invoice. It may have already been processed.');
    }

    if (action === 'skip') {
      await supabase
        .from('invoice_reminders')
        .update({ status: 'skipped' })
        .eq('id', reminder.id);

      return htmlResponse(200, `Skipped. The tier ${reminder.reminder_tier} reminder for ${reminder.customer_name || reminder.customer_email} ($${(reminder.amount_due / 100).toFixed(2)}) has been skipped. No email was sent.`);
    }

    // action === 'approve' — send the reminder email
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
      return htmlResponse(503, 'Gmail is not configured. Cannot send the reminder email. Please send it manually.');
    }

    const accessToken = await getGoogleAccessToken();
    const fromEmail = process.env.ADMIN_EMAIL || 'admin@thepracticecenter.org';

    const raw = createRawEmail(
      fromEmail,
      reminder.customer_email,
      reminder.draft_subject,
      reminder.draft_body
    );

    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Gmail send failed:', errorText);
      return htmlResponse(500, `Failed to send email: ${errorText}`);
    }

    // Update reminder status
    await supabase
      .from('invoice_reminders')
      .update({
        status: 'sent',
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    return htmlResponse(200, `Sent. The tier ${reminder.reminder_tier} reminder has been emailed to ${reminder.customer_email} for $${(reminder.amount_due / 100).toFixed(2)}.`);
  } catch (error) {
    console.error('Invoice approve error:', error);
    return htmlResponse(500, `Error: ${error.message}`);
  }
};

function htmlResponse(statusCode, message) {
  const isSuccess = statusCode === 200;
  const color = isSuccess ? '#2d6a4f' : '#c1121f';
  const icon = isSuccess ? '&#10003;' : '&#10007;';

  return {
    statusCode,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice Reminder</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9f8f5;">
<div style="text-align:center;padding:40px;max-width:500px;">
<div style="font-size:48px;color:${color};margin-bottom:16px;">${icon}</div>
<p style="font-size:18px;color:#1a1a2e;line-height:1.6;">${message}</p>
<p style="margin-top:24px;font-size:14px;color:#6b6560;">You can close this tab.</p>
</div>
</body>
</html>`,
  };
}

async function getGoogleAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  return data.access_token;
}

function createRawEmail(from, to, subject, body) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
