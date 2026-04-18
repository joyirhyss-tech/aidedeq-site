/**
 * Roo Tool Monitor
 * ----------------
 * Runs daily at 07:00 UTC (02:00 Central). Pings every external tool
 * URL from _tool-registry.json. For each failure:
 *   - files (or upserts) a row in aeq_feedback with
 *     app_name='aidedeq-tools', feedback_type='bug', severity='high',
 *     assigned_to='gabby'
 *   - the existing fingerprint/dedupe trigger bumps occurrence_count
 *     for repeat failures
 * For each success, if there is an OPEN matching row from a prior
 * failure, marks it status='fixed' with a resolution note — so Roo
 * auto-closes tickets when you put the tool back online.
 *
 * Also supports manual invocation (POST) for testing.
 */

const { createClient } = require('./_supabase');
const registry = require('./_tool-registry.json');

const TIMEOUT_DEFAULT = 10000;
const APP_NAME = 'aidedeq-tools';

async function pingOne(tool) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.timeout_ms || TIMEOUT_DEFAULT);
  const started = Date.now();
  try {
    const res = await fetch(tool.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Roo-Monitor/1.0 (+https://aidedeq.org)' },
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    const expect = tool.expect_status || 200;
    const ok = res.status === expect || (expect === 200 && res.status >= 200 && res.status < 300);
    return { tool, ok, status: res.status, ms, error: null };
  } catch (err) {
    const ms = Date.now() - started;
    const msg = err.name === 'AbortError' ? `timeout after ${ms}ms` : err.message;
    return { tool, ok: false, status: 0, ms, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function openFailureRow(supabase, tool) {
  // Find an existing unresolved failure for this slug.
  const { data } = await supabase
    .from('aeq_feedback')
    .select('id, status, occurrence_count')
    .eq('app_name', APP_NAME)
    .eq('page_context', tool.slug)
    .order('id', { ascending: false })
    .limit(1);

  const row = Array.isArray(data) ? data[0] : null;
  if (row && !['fixed', 'wont_fix', 'duplicate'].includes(row.status)) return row;
  return null;
}

async function recordFailure(supabase, result) {
  const { tool, status, ms, error } = result;
  const message = `Tool monitor: ${tool.name} (${tool.url}) failed — ${
    error ? error : `HTTP ${status}`
  } in ${ms}ms.`;

  // The aeq_feedback dedupe trigger fingerprints on
  // app_name|feedback_type|message(first 200)|page_context — so by
  // using slug as page_context and a stable message prefix, repeat
  // failures bump occurrence_count on the same row.
  const { error: insertErr } = await supabase.from('aeq_feedback').insert({
    app_name: APP_NAME,
    user_email: 'monitor@aidedeq.org',
    feedback_type: 'bug',
    message,
    page_context: tool.slug,
    page_url: tool.url,
    user_agent: 'Roo-Monitor/1.0',
    severity: 'high',
    assigned_to: 'gabby',
  });
  if (insertErr) console.error(`[roo-monitor] insert failed for ${tool.slug}:`, insertErr);
}

async function closeRecovery(supabase, tool, row) {
  const note = `Roo-Monitor: ${tool.name} is responding 2xx again. Auto-closed.`;
  const { error } = await supabase
    .from('aeq_feedback')
    .update({ status: 'fixed', resolution: note })
    .eq('id', row.id);
  if (error) console.error(`[roo-monitor] auto-close failed for ${tool.slug}:`, error);
  else console.log(`[roo-monitor] auto-closed #${row.id} (${tool.slug}) — back online`);
}

async function runMonitor() {
  const supabase = createClient();
  const tools = registry.tools || [];
  console.log(`[roo-monitor] checking ${tools.length} tools...`);
  const results = await Promise.all(tools.map(pingOne));

  const failures = [];
  const recoveries = [];

  for (const result of results) {
    const openRow = await openFailureRow(supabase, result.tool);
    if (!result.ok) {
      await recordFailure(supabase, result);
      failures.push({ slug: result.tool.slug, url: result.tool.url, status: result.status, error: result.error });
    } else if (openRow) {
      await closeRecovery(supabase, result.tool, openRow);
      recoveries.push({ slug: result.tool.slug, url: result.tool.url, closed_id: openRow.id });
    }
  }

  const summary = {
    checked: tools.length,
    healthy: tools.length - failures.length,
    failures,
    recoveries,
  };
  console.log('[roo-monitor] summary:', JSON.stringify(summary));
  return summary;
}

// Scheduled daily at 07:00 UTC (02:00 CT)
exports.handler = async (event) => {
  try {
    // Allow manual POST invocation for testing (not exposed publicly — requires key)
    if (event?.httpMethod === 'POST') {
      const auth = event.headers?.authorization || '';
      const expected = `Bearer ${process.env.DASHBOARD_API_KEY || ''}`;
      if (!expected || auth !== expected) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const summary = await runMonitor();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary) };
    }

    const summary = await runMonitor();
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) };
  } catch (err) {
    console.error('[roo-monitor] fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// Schedule is configured in netlify.toml under [functions."roo-monitor"]
// to keep the cron pattern visible alongside the invoice-check schedule.
