const CRM_PRODUCT_MAP = {
  'AIdedEQ general inquiry': 'aided_eq_services',
  'ROP Practice': 'aided_eq_services',
  'Mission2Practice Engine': 'mission2practice',
  'MF Pocket Facilitator': 'aided_eq_services',
  'The Good Skill': 'aided_eq_services',
  'The Law Is On Our Side': 'aided_eq_services',
  Snapshots: 'aided_eq_services',
  'Festival Lore': 'aided_eq_services',
  "Founder's service package": 'aided_eq_services',
  'Training or cohort partnership': 'aided_eq_services',
};

const CRM_MEETING_TYPE_MAP = {
  'Specific questions after seeing the tool': 'discovery',
  'Service fit and implementation': 'pilot_planning',
  'Ready to buy or pilot': 'proposal_review',
  'Partnership or sponsored cohort': 'pilot_planning',
};

function getEnvConfig() {
  const url = process.env.CRM_SUPABASE_URL;
  const serviceRoleKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

function buildHeaders(serviceRoleKey, extraHeaders = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
}

async function supabaseRequest(path, { method = 'GET', body, prefer } = {}) {
  const config = getEnvConfig();

  if (!config) {
    throw new Error('CRM sync is not configured.');
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: buildHeaders(
      config.serviceRoleKey,
      prefer ? { Prefer: prefer } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Supabase CRM request failed: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function mapProductSlug(toolTopic) {
  return CRM_PRODUCT_MAP[toolTopic] || 'aided_eq_services';
}

function mapMeetingType(reason) {
  return CRM_MEETING_TYPE_MAP[reason] || 'discovery';
}

function buildMeetingNotes(payload) {
  return [
    'Public booking source: aidedeq.org/book',
    `Exact tool/topic: ${payload.tool_topic || 'AIdedEQ general inquiry'}`,
    `Conversation type: ${payload.selected_reason || 'Specific questions after seeing the tool'}`,
    `Requested duration: ${payload.selected_duration || '15 minutes'}`,
    payload.subject_line ? `Subject line: ${payload.subject_line}` : null,
    payload.message ? `Notes from booker: ${payload.message}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function appendNote(existingNotes, nextLine) {
  return [existingNotes || '', nextLine].filter(Boolean).join('\n');
}

async function findOrCreateAccount(payload, productSlug) {
  const organizationName = String(payload.organization || '').trim() || payload.name;
  const encodedOrgName = encodeURIComponent(organizationName);
  const encodedProductSlug = encodeURIComponent(productSlug);
  const existing = await supabaseRequest(
    `sales_accounts?select=id,stage,organization_name&organization_name=eq.${encodedOrgName}&product_slug=eq.${encodedProductSlug}&limit=1`
  );

  if (Array.isArray(existing) && existing[0]) {
    const account = existing[0];

    if (account.stage !== 'meeting_scheduled') {
      await supabaseRequest(`sales_accounts?id=eq.${encodeURIComponent(account.id)}`, {
        method: 'PATCH',
        body: {
          stage: 'meeting_scheduled',
        },
        prefer: 'return=minimal',
      });
    }

    return account.id;
  }

  const created = await supabaseRequest('sales_accounts', {
    method: 'POST',
    body: {
      organization_name: organizationName,
      product_slug: productSlug,
      org_type: 'website inquiry',
      stage: 'meeting_scheduled',
      notes: `Created automatically from aidedeq.org/book on ${new Date().toISOString()}.`,
      crm_tags: ['public-booking', 'aidedeq-booking'],
    },
    prefer: 'return=representation',
  });

  return created?.[0]?.id || null;
}

async function findOrCreateContact(accountId, payload) {
  const encodedAccountId = encodeURIComponent(accountId);
  const encodedEmail = encodeURIComponent(payload.email);
  const existing = await supabaseRequest(
    `sales_contacts?select=id,full_name,email&organization_id=eq.${encodedAccountId}&email=eq.${encodedEmail}&limit=1`
  );

  if (Array.isArray(existing) && existing[0]) {
    const contact = existing[0];

    await supabaseRequest(`sales_contacts?id=eq.${encodeURIComponent(contact.id)}`, {
      method: 'PATCH',
      body: {
        full_name: payload.name,
        role_title: payload.role || null,
        phone: payload.phone || null,
        status: 'active',
        notes: payload.organization ? `Latest booking org label: ${payload.organization}` : null,
      },
      prefer: 'return=minimal',
    });

    return contact.id;
  }

  const created = await supabaseRequest('sales_contacts', {
    method: 'POST',
    body: {
      organization_id: accountId,
      full_name: payload.name,
      role_title: payload.role || null,
      email: payload.email,
      phone: payload.phone || null,
      is_primary_buyer: true,
      status: 'active',
      notes: 'Created automatically from aidedeq.org/book.',
    },
    prefer: 'return=representation',
  });

  return created?.[0]?.id || null;
}

async function createMeeting({ accountId, contactId, payload, eventData }) {
  const created = await supabaseRequest('sales_meetings', {
    method: 'POST',
    body: {
      organization_id: accountId,
      contact_id: contactId,
      product_slug: payload.product_slug || mapProductSlug(payload.tool_topic),
      meeting_type: payload.meeting_type || mapMeetingType(payload.selected_reason),
      scheduled_for: payload.selected_slot_start,
      timezone: 'America/Chicago',
      duration_minutes: Number.parseInt(payload.selected_duration, 10) || 15,
      google_calendar_event_id: eventData?.id || null,
      zoom_join_url: eventData?.location || process.env.ZOOM_MEETING_URL || null,
      status: payload.meeting_status || 'scheduled',
      notes: buildMeetingNotes(payload),
    },
    prefer: 'return=representation',
  });

  return created?.[0] || null;
}

async function ensureBookingContext(payload) {
  if (!getEnvConfig()) {
    return {
      ok: false,
      skipped: true,
      reason: 'CRM sync is not configured.',
    };
  }

  const productSlug = mapProductSlug(payload.tool_topic);
  const accountId = await findOrCreateAccount(payload, productSlug);

  if (!accountId) {
    throw new Error('Unable to create CRM account for this booking.');
  }

  const contactId = await findOrCreateContact(accountId, payload);

  return {
    ok: true,
    accountId,
    contactId,
    productSlug,
    meetingType: mapMeetingType(payload.selected_reason),
  };
}

async function createScheduledMeeting(payload) {
  const context = await ensureBookingContext(payload);

  if (!context.ok) {
    return context;
  }

  const meeting = await createMeeting({
    accountId: context.accountId,
    contactId: context.contactId,
    payload: {
      ...payload,
      product_slug: context.productSlug,
      meeting_type: context.meetingType,
    },
    eventData: null,
  });

  return {
    ...context,
    meetingId: meeting?.id || null,
  };
}

async function getMeetingById(meetingId) {
  const result = await supabaseRequest(
    `sales_meetings?select=id,organization_id,contact_id,product_slug,meeting_type,scheduled_for,google_calendar_event_id,zoom_join_url,status,notes&id=eq.${encodeURIComponent(meetingId)}&limit=1`
  );

  return Array.isArray(result) ? result[0] || null : null;
}

async function finalizeMeetingBooking(meetingId, { eventId, zoomJoinUrl, cancelUrl }) {
  const existing = await getMeetingById(meetingId);

  if (!existing) {
    throw new Error('CRM meeting not found.');
  }

  await supabaseRequest(`sales_meetings?id=eq.${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    body: {
      google_calendar_event_id: eventId,
      zoom_join_url: zoomJoinUrl || process.env.ZOOM_MEETING_URL || null,
      status: 'scheduled',
      notes: appendNote(existing.notes, cancelUrl ? `Cancel link: ${cancelUrl}` : null),
    },
    prefer: 'return=minimal',
  });

  return {
    ok: true,
    meetingId,
    accountId: existing.organization_id,
    contactId: existing.contact_id,
    productSlug: existing.product_slug,
  };
}

async function cancelMeetingById(meetingId) {
  const existing = await getMeetingById(meetingId);

  if (!existing) {
    throw new Error('CRM meeting not found.');
  }

  if (existing.status === 'canceled') {
    return existing;
  }

  await supabaseRequest(`sales_meetings?id=eq.${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    body: {
      status: 'canceled',
      notes: appendNote(existing.notes, `Canceled via public link on ${new Date().toISOString()}.`),
    },
    prefer: 'return=minimal',
  });

  return {
    ...existing,
    status: 'canceled',
  };
}

module.exports = {
  cancelMeetingById,
  createScheduledMeeting,
  ensureBookingContext,
  finalizeMeetingBooking,
  getEnvConfig,
  getMeetingById,
  mapMeetingType,
  mapProductSlug,
};
