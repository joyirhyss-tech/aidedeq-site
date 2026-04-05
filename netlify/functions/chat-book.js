const {
  buildCandidateGroups,
  filterAvailableGroups,
  getBusyWindows,
  insertCalendarEvent,
  parseMonthKey,
} = require('./_google-calendar');
const {
  createScheduledMeeting,
  finalizeMeetingBooking,
} = require('./_sales-crm');
const { buildCancelToken, buildCancelUrl } = require('./_booking-links');
const { createClient } = require('./_supabase');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Chat booking endpoint — two actions:
 *
 * 1. action: "check-availability"
 *    Returns available slots for the given month.
 *
 * 2. action: "book"
 *    Books a slot using the same flow as book-founder-call.js
 *    but triggered from the chat widget.
 */
exports.handler = async (event) => {
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
    const payload = JSON.parse(event.body || '{}');
    const { action } = payload;

    if (action === 'check-availability') {
      return await handleCheckAvailability(payload);
    }

    if (action === 'book') {
      return await handleBook(payload);
    }

    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid action. Use "check-availability" or "book".' }),
    };
  } catch (error) {
    console.error('Chat-book error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unable to process booking request.',
      }),
    };
  }
};

async function handleCheckAvailability(payload) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextMonth = `${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}-${String(((now.getMonth() + 1) % 12) + 1).padStart(2, '0')}`;

  const month = payload.month || currentMonth;
  const duration = Number.parseInt(payload.duration || '15', 10) || 15;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fallback',
        message: 'Live calendar is not available right now. Please visit aidedeq.org/book/ to see available times.',
      }),
    };
  }

  if (!parseMonthKey(month)) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid month format.' }),
    };
  }

  const candidateGroups = buildCandidateGroups(month, duration);
  const busyWindows = await getBusyWindows(month);
  const groups = filterAvailableGroups(candidateGroups, busyWindows);

  // Filter out past slots
  const nowMs = now.getTime();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      times: group.times.filter((slot) => new Date(slot.start).getTime() > nowMs),
    }))
    .filter((group) => group.times.length > 0);

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'live',
      month,
      next_month: nextMonth,
      groups: filteredGroups,
    }),
  };
}

async function handleBook(payload) {
  const { name, email, selected_slot_start, selected_slot_end, organization, conversation_id, tool_topic, selected_reason } = payload;

  if (!name || !email || !selected_slot_start || !selected_slot_end) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Name, email, and a time slot are required to book.' }),
    };
  }

  // Create CRM record
  const bookingPayload = {
    name,
    email,
    organization: organization || '',
    tool_topic: tool_topic || 'AIdedEQ general inquiry',
    selected_reason: selected_reason || 'Specific questions after seeing the tool',
    selected_duration: '15 minutes',
    selected_slot_start,
    selected_slot_end,
  };

  const crmContext = await createScheduledMeeting(bookingPayload);

  if (!crmContext?.ok || !crmContext.meetingId) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unable to prepare the booking. Please try again.' }),
    };
  }

  // Create cancel link
  const cancelToken = buildCancelToken({ meetingId: crmContext.meetingId });
  const cancelUrl = buildCancelUrl(cancelToken);

  // Insert Google Calendar event
  const eventData = await insertCalendarEvent({
    ...bookingPayload,
    cancel_url: cancelUrl,
    subject_line: `Chat booking: ${name} | ${tool_topic || 'General inquiry'}`,
  });

  // Finalize CRM with calendar event ID
  await finalizeMeetingBooking(crmContext.meetingId, {
    eventId: eventData.id,
    zoomJoinUrl: eventData.location,
    cancelUrl,
  });

  // Update chat conversation status to 'booked' if we have a conversation_id
  if (conversation_id) {
    try {
      const supabase = createClient();
      await supabase
        .from('chat_conversations')
        .update({
          status: 'booked',
          visitor_name: name,
          visitor_email: email,
          visitor_org: organization || null,
          sales_account_id: crmContext.accountId || null,
        })
        .eq('id', conversation_id);
    } catch (updateError) {
      console.error('Failed to update conversation status:', updateError);
    }
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      message: `You are booked. A calendar invite has been sent to ${email}. Looking forward to the conversation.`,
      cancelUrl,
      eventId: eventData.id,
    }),
  };
}
