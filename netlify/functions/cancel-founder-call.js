const { cancelCalendarEvent } = require('./_google-calendar');
const { cancelMeetingById, getMeetingById } = require('./_sales-crm');
const { verifyCancelToken } = require('./_booking-links');

const PRODUCT_LABELS = {
  aided_eq_services: 'AIdedEQ general inquiry',
  mission2practice: 'Mission2Practice Engine',
  girls_who_vibe: 'Girls Who Vibe',
  moxie_creator_circles: 'Moxie Creator Circles',
  moxie_studio: 'Moxie Studio',
};

function toToolLabel(productSlug) {
  return PRODUCT_LABELS[productSlug] || 'AIdedEQ general inquiry';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const verified = verifyCancelToken(payload.token);
    const meeting = await getMeetingById(verified.meetingId);

    if (!meeting) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'That booking could not be found.' }),
      };
    }

    if (meeting.status === 'canceled') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          alreadyCanceled: true,
          toolTopic: toToolLabel(meeting.product_slug),
        }),
      };
    }

    await cancelCalendarEvent(meeting.google_calendar_event_id);
    const canceledMeeting = await cancelMeetingById(meeting.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        toolTopic: toToolLabel(canceledMeeting.product_slug),
      }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unable to cancel that meeting.',
      }),
    };
  }
};
