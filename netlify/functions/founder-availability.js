const {
  buildCandidateGroups,
  filterAvailableGroups,
  getBusyWindows,
  parseMonthKey,
} = require('./_google-calendar');

exports.handler = async (event) => {
  const month = event.queryStringParameters?.month || '2026-04';
  const duration = Number.parseInt(event.queryStringParameters?.duration || '15 minutes', 10) || 15;

  if (!parseMonthKey(month)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unsupported month requested.' }),
    };
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Live Google Calendar availability is not configured yet.' }),
    };
  }

  try {
    const candidateGroups = buildCandidateGroups(month, duration);
    const busyWindows = await getBusyWindows(month);
    const groups = filterAvailableGroups(candidateGroups, busyWindows);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'live', groups }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to load founder availability.' }),
    };
  }
};
