const { createClient } = require('./_supabase');

const REMINDER_TIERS = {
  1: {
    daysAfterDue: 1,
    subject: (num) => `Quick reminder: Invoice #${num} from AIdedEQ`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nThis is a friendly reminder that invoice #${num} for $${(amount / 100).toFixed(2)} is outstanding. If you have already sent payment, please disregard this message.\n\nIf you have any questions about the invoice, reply to this email and we will be happy to help.\n\nWith respect,\nAIdedEQ Team`,
  },
  2: {
    daysAfterDue: 7,
    subject: (num) => `Follow-up: Outstanding invoice #${num}`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nWe wanted to follow up regarding invoice #${num} for $${(amount / 100).toFixed(2)}, which is now past due. We understand things can get busy and want to make sure this does not slip through the cracks.\n\nPlease let us know if you need to discuss payment arrangements or have any questions.\n\nWith respect,\nAIdedEQ Team`,
  },
  3: {
    daysAfterDue: 14,
    subject: (num) => `Action needed: Invoice #${num} past due`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nThis is a final notice regarding invoice #${num} for $${(amount / 100).toFixed(2)}. This invoice is now significantly past due.\n\nWe value our working relationship and would like to resolve this. Please reply to this email or reach out at your earliest convenience.\n\nWith respect,\nAIdedEQ Team`,
  },
};

/**
 * Weekly invoice check — runs every Monday at 9am CT (14:00 UTC)
 * Scans Stripe for overdue invoices and creates reminder drafts.
 * Sends JoYi an approval digest email.
 */
exports.handler = async () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    console.log('STRIPE_SECRET_KEY not configured, skipping invoice check.');
    return { statusCode: 200, body: 'Stripe not configured.' };
  }

  try {
    const supabase = createClient();

    // Fetch open invoices from Stripe
    const response = await fetch('https://api.stripe.com/v1/invoices?status=open&limit=100', {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    const { data: invoices } = await response.json();
    const now = Date.now();
    const newReminders = [];

    for (const invoice of invoices) {
      if (!invoice.due_date) continue;

      const dueMs = invoice.due_date * 1000;
      const daysPastDue = Math.floor((now - dueMs) / (1000 * 60 * 60 * 24));

      if (daysPastDue < 1) continue; // Not yet past due

      // Check existing reminders for this invoice
      const { data: existing } = await supabase
        .from('invoice_reminders')
        .select('reminder_tier, status')
        .eq('stripe_invoice_id', invoice.id)
        .order('reminder_tier', { ascending: false });

      const sentTiers = (existing || [])
        .filter((r) => r.status === 'sent')
        .map((r) => r.reminder_tier);
      const pendingTiers = (existing || [])
        .filter((r) => r.status === 'pending_approval')
        .map((r) => r.reminder_tier);

      const maxSentTier = Math.max(0, ...sentTiers);
      const hasPending = pendingTiers.length > 0;

      if (hasPending) continue; // Already has a pending reminder

      // Determine next tier
      let nextTier = null;

      for (const [tierNum, tierConfig] of Object.entries(REMINDER_TIERS)) {
        const tier = Number(tierNum);
        if (tier <= maxSentTier) continue;
        if (daysPastDue >= tierConfig.daysAfterDue) {
          nextTier = tier;
          break;
        }
      }

      if (!nextTier) continue;

      const template = REMINDER_TIERS[nextTier];
      const invoiceNumber = invoice.number || invoice.id.slice(-8);
      const customerName = invoice.customer_name || invoice.customer_email?.split('@')[0] || 'there';

      const { data: inserted } = await supabase.from('invoice_reminders').insert({
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer || null,
        customer_email: invoice.customer_email,
        customer_name: invoice.customer_name || null,
        amount_due: invoice.amount_due,
        due_date: new Date(invoice.due_date * 1000).toISOString(),
        reminder_tier: nextTier,
        draft_subject: template.subject(invoiceNumber),
        draft_body: template.body(customerName, invoice.amount_due, invoiceNumber),
        status: 'pending_approval',
      });

      newReminders.push({
        invoiceId: invoice.id,
        customerName,
        customerEmail: invoice.customer_email,
        amount: invoice.amount_due,
        tier: nextTier,
      });
    }

    // Send digest email to JoYi if there are new reminders
    if (newReminders.length > 0) {
      await sendDigestEmail(newReminders);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        checked: invoices.length,
        newReminders: newReminders.length,
      }),
    };
  } catch (error) {
    console.error('Invoice check error:', error);
    return { statusCode: 500, body: error.message };
  }
};

async function sendDigestEmail(reminders) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thepracticecenter.org';
  const siteUrl = process.env.URL || 'https://aidedeq.org';

  // Build digest
  let body = 'Weekly Invoice Reminder Digest\n\n';
  body += `${reminders.length} invoice reminder(s) need your approval:\n\n`;

  for (const r of reminders) {
    body += `- ${r.customerName} (${r.customerEmail}): $${(r.amount / 100).toFixed(2)} | Tier ${r.tier}\n`;
    body += `  Approve: ${siteUrl}/.netlify/functions/invoice-approve?invoice=${encodeURIComponent(r.invoiceId)}&action=approve\n`;
    body += `  Skip: ${siteUrl}/.netlify/functions/invoice-approve?invoice=${encodeURIComponent(r.invoiceId)}&action=skip\n\n`;
  }

  body += 'You can also review all pending reminders in the Supabase dashboard.';

  // Use Gmail API if configured, otherwise log
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      const accessToken = await getGoogleAccessToken();
      const raw = createRawEmail(
        adminEmail,
        adminEmail,
        `[AIdedEQ] ${reminders.length} invoice reminder(s) need approval`,
        body
      );

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });

      console.log('Digest email sent to', adminEmail);
    } catch (emailError) {
      console.error('Failed to send digest email:', emailError);
    }
  } else {
    console.log('Gmail not configured. Digest:\n', body);
  }
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
