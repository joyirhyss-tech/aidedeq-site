#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function promptLine(message, fallback = '') {
  return `${message}${fallback ? ` [${fallback}]` : ''}: `;
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    const clientId = (await rl.question(promptLine('GOOGLE_CLIENT_ID'))).trim();
    const clientSecret = (await rl.question(promptLine('GOOGLE_CLIENT_SECRET'))).trim();
    const refreshToken = (await rl.question(promptLine('GOOGLE_REFRESH_TOKEN'))).trim();
    const calendarId = (await rl.question(promptLine('GOOGLE_CALENDAR_ID', 'primary'))).trim() || 'primary';
    const zoomMeetingUrl = (await rl.question(promptLine('ZOOM_MEETING_URL'))).trim();

    if (!clientId || !clientSecret || !refreshToken || !zoomMeetingUrl) {
      throw new Error('Client ID, client secret, refresh token, and Zoom meeting URL are all required.');
    }

    const values = [
      ['GOOGLE_CLIENT_ID', clientId],
      ['GOOGLE_CLIENT_SECRET', clientSecret],
      ['GOOGLE_REFRESH_TOKEN', refreshToken],
      ['GOOGLE_CALENDAR_ID', calendarId],
      ['ZOOM_MEETING_URL', zoomMeetingUrl],
    ];

    for (const [key, value] of values) {
      console.log(`\nSetting ${key} in Netlify...`);
      await run('npx', ['netlify', 'env:set', key, value]);
    }

    console.log('\nAll booking environment variables were set in Netlify.');
    console.log('Next step: run a production deploy so live booking can use them.');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
