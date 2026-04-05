const crypto = require('node:crypto');
const { createClient } = require('./_supabase');

const REMINDER_TIERS = {
  1: {
    subject: (num) => `Quick reminder: Invoice #${num} from AIdedEQ`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nThis is a friendly reminder that invoice #${num} for $${(amount / 100).toFixed(2)} is outstanding. If you have already sent payment, please disregard this message.\n\nIf you have any questions about the invoice, reply to this email and we will be happy to help.\n\nWith respect,\nAIdedEQ Team`,
  },
  2: {
    subject: (num) => `Follow-up: Outstanding invoice #${num}`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nWe wanted to follow up regarding invoice #${num} for $${(amount / 100).toFixed(2)}, which is now past due. We understand things can get busy and want to make sure this does not slip through the cracks.\n\nPlease let us know if you need to discuss payment arrangements or have any questions.\n\nWith respect,\nAIdedEQ Team`,
  },
  3: {
    subject: (num) => `Action needed: Invoice #${num} past due`,
    body: (name, amount, num) =>
      `Hi ${name},\n\nThis is a final notice regarding invoice #${num} for $${(amount / 100).toFixed(2)}. This invoice is now significantly past due.\n\nWe value our working relationship and would like to resolve this. Please reply to this email or reach out at your earliest convenience.\n\nWith respect,\nAIdedEQ Team`,
  },
};

function verifyStripeSignature(payload, signature, secret) {
  const elements = signature.split(',');
  const timestamp = elements.find((e) => e.startsWith('t='))?.slice(2);
  const v1Sig = elements.find((e) => e.startsWith('v1='))?.slice(3);

  if (!timestamp || !v1Sig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(v1Sig, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed.' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 500, body: 'Webhook not configured.' };
  }

  const signature = event.headers['stripe-signature'];

  if (!signature || !verifyStripeSignature(event.body, signature, webhookSecret)) {
    return { statusCode: 401, body: 'Invalid signature.' };
  }

  try {
    const stripeEvent = JSON.parse(event.body);
    const invoice = stripeEvent.data?.object;

    if (!invoice) {
      return { statusCode: 200, body: 'No invoice data.' };
    }

    const supabase = createClient();

    switch (stripeEvent.type) {
      case 'invoice.payment_failed':
      case 'invoice.overdue': {
        // Check if we already have a pending reminder for this invoice
        const { data: existing } = await supabase
          .from('invoice_reminders')
          .select('id, reminder_tier, status')
          .eq('stripe_invoice_id', invoice.id)
          .eq('status', 'pending_approval')
          .limit(1);

        if (existing && existing.length > 0) {
          // Already have a pending reminder, skip
          return { statusCode: 200, body: 'Reminder already pending.' };
        }

        // Determine tier based on existing sent reminders
        const { data: sentReminders } = await supabase
          .from('invoice_reminders')
          .select('reminder_tier')
          .eq('stripe_invoice_id', invoice.id)
          .eq('status', 'sent')
          .order('reminder_tier', { ascending: false })
          .limit(1);

        const lastTier = sentReminders?.[0]?.reminder_tier || 0;
        const nextTier = Math.min(lastTier + 1, 3);
        const template = REMINDER_TIERS[nextTier];
        const invoiceNumber = invoice.number || invoice.id.slice(-8);
        const customerName = invoice.customer_name || invoice.customer_email?.split('@')[0] || 'there';

        await supabase.from('invoice_reminders').insert({
          stripe_invoice_id: invoice.id,
          stripe_customer_id: invoice.customer || null,
          customer_email: invoice.customer_email,
          customer_name: invoice.customer_name || null,
          amount_due: invoice.amount_due,
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
          reminder_tier: nextTier,
          draft_subject: template.subject(invoiceNumber),
          draft_body: template.body(customerName, invoice.amount_due, invoiceNumber),
          status: 'pending_approval',
        });

        // Notify JoYi (via the weekly check or immediate notification)
        console.log(`Invoice reminder created: ${invoice.id}, tier ${nextTier}`);
        break;
      }

      case 'invoice.paid': {
        // Cancel any pending reminders for this invoice
        const { data: pendingReminders } = await supabase
          .from('invoice_reminders')
          .select('id')
          .eq('stripe_invoice_id', invoice.id)
          .eq('status', 'pending_approval');

        if (pendingReminders && pendingReminders.length > 0) {
          for (const reminder of pendingReminders) {
            await supabase
              .from('invoice_reminders')
              .update({ status: 'cancelled' })
              .eq('id', reminder.id);
          }
        }

        console.log(`Invoice paid, cancelled pending reminders: ${invoice.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return { statusCode: 500, body: 'Webhook processing failed.' };
  }
};
