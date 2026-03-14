const {
  cancelCalendarEvent,
  getBusyWindows,
  insertCalendarEvent,
  isSlotAvailable,
  parseMonthKey,
} = require('./_google-calendar');
const {
  createScheduledMeeting,
  finalizeMeetingBooking,
} = require('./_sales-crm');
const { buildCancelToken, buildCancelUrl } = require('./_booking-links');

const emailDomainSuggestions = {
  'gmaul.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'hotnail.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'iclould.com': 'icloud.com',
};

function getEmailSuggestion(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');

  if (atIndex === -1) return null;

  const domain = normalized.slice(atIndex + 1);
  const suggestion = emailDomainSuggestions[domain];

  if (!suggestion) return null;

  return `${normalized.slice(0, atIndex + 1)}${suggestion}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Live booking is not configured yet.' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const selectedMonth = payload.selected_slot_start?.slice(0, 7);

    if (!payload.name || !payload.email || !payload.selected_slot_start || !payload.selected_slot_end) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required booking details.' }),
      };
    }

    const emailSuggestion = getEmailSuggestion(payload.email);

    if (emailSuggestion) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `That email looks mistyped. Did you mean ${emailSuggestion}?` }),
      };
    }

    if (!selectedMonth || !parseMonthKey(selectedMonth)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unsupported booking month.' }),
      };
    }

    const busyWindows = await getBusyWindows(selectedMonth);
    const slot = {
      start: payload.selected_slot_start,
      end: payload.selected_slot_end,
    };

    if (!isSlotAvailable(slot, busyWindows)) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'That slot just filled up. Please choose another one.' }),
      };
    }

    const crmContext = await createScheduledMeeting(payload).catch((crmError) => ({
      ok: false,
      skipped: false,
      error: crmError instanceof Error ? crmError.message : 'CRM sync failed.',
    }));

    if (!crmContext?.ok || !crmContext.meetingId) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: crmContext?.error || 'Unable to prepare the CRM meeting record.',
        }),
      };
    }

    const cancelToken = buildCancelToken({ meetingId: crmContext.meetingId });
    const cancelUrl = buildCancelUrl(cancelToken);

    let eventData;

    try {
      eventData = await insertCalendarEvent({
        ...payload,
        cancel_url: cancelUrl,
      });
    } catch (calendarError) {
      await cancelCalendarEvent(null).catch(() => null);
      throw calendarError;
    }

    const crmSync = await finalizeMeetingBooking(crmContext.meetingId, {
      eventId: eventData.id,
      zoomJoinUrl: eventData.location,
      cancelUrl,
    }).catch((crmError) => ({
      ok: false,
      skipped: false,
      error: crmError instanceof Error ? crmError.message : 'CRM sync failed.',
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        eventId: eventData.id,
        htmlLink: eventData.htmlLink,
        location: eventData.location,
        cancelUrl,
        crmSync,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to complete the booking.' }),
    };
  }
};
