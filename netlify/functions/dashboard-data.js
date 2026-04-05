const { createClient } = require('./_supabase');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/**
 * Dashboard data aggregator.
 * Returns a single JSON blob with all agent + CRM data for the local HQ dashboard.
 * Protected by DASHBOARD_API_KEY query param.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const apiKey = event.queryStringParameters?.key;
  const expectedKey = process.env.DASHBOARD_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized.' }),
    };
  }

  try {
    const supabase = createClient();

    const [
      accountsResult,
      meetingsResult,
      conversationsResult,
      messageCountResult,
      remindersResult,
      stripeData,
    ] = await Promise.all([
      supabase.from('sales_accounts').select('id, organization_name, product_slug, stage, deal_value, notes, created_at'),
      supabase.from('sales_meetings').select('id, organization_id, contact_id, product_slug, meeting_type, scheduled_for, status, notes, created_at').order('scheduled_for', { ascending: false }).limit(20),
      supabase.from('chat_conversations').select('id, channel, visitor_name, visitor_email, visitor_org, status, page_url, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('chat_messages').select('id, conversation_id, role, created_at'),
      supabase.from('invoice_reminders').select('id, stripe_invoice_id, customer_email, customer_name, amount_due, due_date, reminder_tier, status, created_at'),
      fetchStripeBalance(),
    ]);

    const accounts = accountsResult.data || [];
    const meetings = meetingsResult.data || [];
    const conversations = conversationsResult.data || [];
    const allMessages = messageCountResult.data || [];
    const reminders = remindersResult.data || [];

    // Compute aggregates
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const pipeline = {
      total: accounts.length,
      stages: {},
      totalValue: 0,
      wonValue: 0,
    };

    for (const a of accounts) {
      const stage = a.stage || 'unknown';
      pipeline.stages[stage] = (pipeline.stages[stage] || 0) + 1;
      const val = Number(a.deal_value) || 0;
      pipeline.totalValue += val;
      if (stage === 'closed_won') pipeline.wonValue += val;
    }

    const chatStats = {
      totalConversations: conversations.length,
      thisWeek: conversations.filter((c) => new Date(c.created_at) >= weekAgo).length,
      totalMessages: allMessages.length,
      messagesThisWeek: allMessages.filter((m) => new Date(m.created_at) >= weekAgo).length,
      qualified: conversations.filter((c) => c.status === 'booked' || c.visitor_email).length,
    };

    const invoiceStats = {
      pendingApproval: reminders.filter((r) => r.status === 'pending_approval'),
      sent: reminders.filter((r) => r.status === 'sent').length,
      totalOverdue: reminders
        .filter((r) => r.status === 'pending_approval')
        .reduce((sum, r) => sum + (r.amount_due || 0), 0),
    };

    const upcomingMeetings = meetings.filter(
      (m) => m.status === 'scheduled' && new Date(m.scheduled_for) >= now
    );

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generated: now.toISOString(),
        pipeline,
        accounts,
        meetings: upcomingMeetings,
        allMeetings: meetings,
        chat: chatStats,
        recentConversations: conversations.slice(0, 10),
        invoice: invoiceStats,
        stripe: stripeData,
      }),
    };
  } catch (error) {
    console.error('Dashboard data error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to load dashboard data.' }),
    };
  }
};

async function fetchStripeBalance() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return { configured: false };
  }

  try {
    const [balanceRes, invoicesRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${stripeKey}` },
      }),
      fetch('https://api.stripe.com/v1/invoices?status=open&limit=10', {
        headers: { Authorization: `Bearer ${stripeKey}` },
      }),
    ]);

    const balance = balanceRes.ok ? await balanceRes.json() : null;
    const invoices = invoicesRes.ok ? await invoicesRes.json() : null;

    const available = balance?.available?.reduce((sum, b) => sum + b.amount, 0) || 0;
    const pending = balance?.pending?.reduce((sum, b) => sum + b.amount, 0) || 0;

    return {
      configured: true,
      available: available / 100,
      pending: pending / 100,
      openInvoices: invoices?.data?.length || 0,
      openInvoicesTotal: (invoices?.data || []).reduce((sum, inv) => sum + (inv.amount_due || 0), 0) / 100,
    };
  } catch (error) {
    console.error('Stripe fetch error:', error);
    return { configured: true, error: 'Failed to fetch Stripe data.' };
  }
}
