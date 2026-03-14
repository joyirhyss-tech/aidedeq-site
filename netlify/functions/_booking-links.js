const crypto = require('node:crypto');

function getSigningSecret() {
  return (
    process.env.BOOKING_CANCEL_SECRET ||
    process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    null
  );
}

function base64urlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signPayload(payload) {
  const secret = getSigningSecret();

  if (!secret) {
    throw new Error('Missing cancel-link signing secret.');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildCancelToken({ meetingId }) {
  const payloadEncoded = base64urlEncode(
    JSON.stringify({
      meetingId,
      iat: Date.now(),
    })
  );

  return `${payloadEncoded}.${signPayload(payloadEncoded)}`;
}

function verifyCancelToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Invalid cancellation link.');
  }

  const [payloadEncoded, signature] = token.split('.');
  const expectedSignature = signPayload(payloadEncoded);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid cancellation link.');
  }

  const payload = JSON.parse(base64urlDecode(payloadEncoded));

  if (!payload?.meetingId) {
    throw new Error('Invalid cancellation link.');
  }

  return payload;
}

function getSiteOrigin() {
  return process.env.URL || 'https://aidedeq.org';
}

function buildCancelUrl(token) {
  return `${getSiteOrigin().replace(/\/$/, '')}/cancel/?token=${encodeURIComponent(token)}`;
}

module.exports = {
  buildCancelToken,
  buildCancelUrl,
  verifyCancelToken,
};
