const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';

const weekdaySlots = {
  1: ['13:00', '14:30', '16:00'],
  2: ['13:00', '14:30', '16:00'],
  3: ['13:00', '14:30', '16:00'],
  4: ['13:00', '14:30', '16:00'],
  5: ['13:00', '14:30'],
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const chicagoTimezone = 'America/Chicago';
const chicagoOffset = '-05:00';

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) return null;

  return { year, month };
}

function formatTimeLabel(time24) {
  const [hourString, minuteString] = time24.split(':');
  const hour = Number(hourString);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteString} ${period}`;
}

function addMinutes(time24, minutesToAdd) {
  const [hourString, minuteString] = time24.split(':');
  const totalMinutes = Number(hourString) * 60 + Number(minuteString) + minutesToAdd;
  const nextHour = Math.floor(totalMinutes / 60);
  const nextMinute = totalMinutes % 60;
  return `${pad(nextHour)}:${pad(nextMinute)}`;
}

function getMonthBounds(monthKey) {
  const config = parseMonthKey(monthKey);
  if (!config) {
    throw new Error('Unsupported month requested.');
  }
  const daysInMonth = new Date(config.year, config.month, 0).getDate();

  return {
    timeMin: `${config.year}-${pad(config.month)}-01T00:00:00${chicagoOffset}`,
    timeMax: `${config.year}-${pad(config.month)}-${pad(daysInMonth)}T23:59:59${chicagoOffset}`,
  };
}

function buildCandidateGroups(monthKey, durationMinutes) {
  const config = parseMonthKey(monthKey);
  if (!config) {
    throw new Error('Unsupported month requested.');
  }
  const daysInMonth = new Date(config.year, config.month, 0).getDate();
  const groups = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(config.year, config.month - 1, day);
    const weekday = date.getDay();
    const times = weekdaySlots[weekday];

    if (!times) continue;

      groups.push({
        dateKey: `${config.year}-${pad(config.month)}-${pad(day)}`,
        label: `${dayNames[weekday]}, ${monthNames[config.month - 1]} ${day}`,
        times: times.map((time24) => ({
          label: formatTimeLabel(time24),
          display: `${dayNames[weekday]}, ${monthNames[config.month - 1]} ${day}, ${monthNames[config.month - 1]} ${config.year} at ${formatTimeLabel(time24)} CT`,
          start: `${config.year}-${pad(config.month)}-${pad(day)}T${time24}:00${chicagoOffset}`,
          end: `${config.year}-${pad(config.month)}-${pad(day)}T${addMinutes(time24, durationMinutes)}:00${chicagoOffset}`,
        })),
    });
  }

  return groups;
}

async function getGoogleAccessToken() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Google OAuth environment variables');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to refresh Google access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getBusyWindows(monthKey) {
  const accessToken = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const { timeMin, timeMax } = getMonthBounds(monthKey);

  const response = await fetch(GOOGLE_FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: chicagoTimezone,
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to query Google Calendar free/busy: ${errorText}`);
  }

  const data = await response.json();
  return data.calendars?.[calendarId]?.busy || [];
}

function isSlotAvailable(slot, busyWindows) {
  const slotStart = new Date(slot.start).getTime();
  const slotEnd = new Date(slot.end).getTime();

  return busyWindows.every((busy) => {
    const busyStart = new Date(busy.start).getTime();
    const busyEnd = new Date(busy.end).getTime();
    return slotEnd <= busyStart || slotStart >= busyEnd;
  });
}

function filterAvailableGroups(groups, busyWindows) {
  return groups
    .map((group) => ({
      ...group,
      times: group.times.filter((slot) => isSlotAvailable(slot, busyWindows)),
    }))
    .filter((group) => group.times.length > 0);
}

async function insertCalendarEvent(payload) {
  const accessToken = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const zoomUrl = process.env.ZOOM_MEETING_URL || 'Zoom link will be shared in the confirmation email.';
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: payload.subject_line || `${payload.tool_topic} | ${payload.selected_reason}`,
      description: [
        'Looking forward to our meeting.',
        'JoYi',
        '',
        payload.cancel_url ? `Need to cancel? ${payload.cancel_url}` : 'Need to cancel? Email admin@thepracticecenter.org.',
        '',
        'Conversation details',
        `Tool or service: ${payload.tool_topic || 'AIdedEQ general inquiry'}`,
        `Conversation type: ${payload.selected_reason || 'Specific questions after seeing the tool'}`,
        `Requested duration: ${payload.selected_duration || '15 minutes'}`,
        `Name: ${payload.name || ''}`,
        `Email: ${payload.email || ''}`,
        `Organization: ${payload.organization || ''}`,
        `Role: ${payload.role || ''}`,
        payload.message || '',
      ].join('\n'),
      location: zoomUrl,
      start: {
        dateTime: payload.selected_slot_start,
        timeZone: chicagoTimezone,
      },
      end: {
        dateTime: payload.selected_slot_end,
        timeZone: chicagoTimezone,
      },
      attendees: payload.email ? [{ email: payload.email }] : [],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to create Google Calendar event: ${errorText}`);
  }

  return response.json();
}

async function cancelCalendarEvent(eventId) {
  if (!eventId) {
    return;
  }

  const accessToken = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errorText = await response.text();
    throw new Error(`Unable to cancel Google Calendar event: ${errorText}`);
  }
}

module.exports = {
  cancelCalendarEvent,
  chicagoTimezone,
  buildCandidateGroups,
  filterAvailableGroups,
  getBusyWindows,
  insertCalendarEvent,
  isSlotAvailable,
  parseMonthKey,
};
