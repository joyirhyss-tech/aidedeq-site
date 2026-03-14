#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const redirectUri = 'https://developers.google.com/oauthplayground';
const scope = 'https://www.googleapis.com/auth/calendar';

function promptLine(message, fallback = '') {
  return `${message}${fallback ? ` [${fallback}]` : ''}: `;
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    const clientId = (await rl.question(promptLine('Google OAuth client ID'))).trim();
    const clientSecret = (await rl.question(promptLine('Google OAuth client secret'))).trim();

    if (!clientId || !clientSecret) {
      throw new Error('Both client ID and client secret are required.');
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    console.log('\n1. In Google Cloud, make sure your OAuth client allows this redirect URI:');
    console.log(`   ${redirectUri}`);
    console.log('\n2. Sign in as admin@thepracticecenter.org and open this URL in a browser:');
    console.log(authUrl.toString());

    const code = (await rl.question('\n3. Paste the returned authorization code here: ')).trim();

    if (!code) {
      throw new Error('Authorization code is required.');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.refresh_token) {
      throw new Error('No refresh token was returned. Re-run the flow and approve with prompt=consent.');
    }

    console.log('\nRefresh token created successfully.\n');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokenData.refresh_token}`);
    console.log('GOOGLE_CALENDAR_ID=primary');
    console.log('ZOOM_MEETING_URL=<your zoom room link>');
    console.log('\nNext step: set these in Netlify for the tpc-aidedeq site.');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
