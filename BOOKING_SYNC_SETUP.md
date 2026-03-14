# AIdedEQ Booking Sync Setup

This site now supports two modes:

1. `Request mode`
   The public booking page captures structured requests through the existing Netlify form flow.

2. `Live mode`
   Netlify Functions query `Google Calendar` for real availability and create calendar events that include your Zoom meeting URL.

## What is already in the code

- `/book/` booking page
- tool-specific deep links into `/book/?tool=...`
- `/.netlify/functions/founder-availability`
- `/.netlify/functions/book-founder-call`
- production domain is `https://aidedeq.org`
- `https://aidedeq.com` now redirects to `https://aidedeq.org`

## What you need to turn on live mode

Set these Netlify environment variables for the `tpc-aidedeq` site:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `ZOOM_MEETING_URL`
- `CRM_SUPABASE_URL`
- `CRM_SUPABASE_SERVICE_ROLE_KEY`

## Recommended cheapest path

Use your existing Zoom room link in `ZOOM_MEETING_URL` first.

That gives you:

- real Google Calendar conflict checking
- auto-created Google Calendar events
- invite email sent to the person booking
- Zoom location included automatically
- booking records written into the Mission2Practice sales CRM

Later, if you want a unique Zoom link per meeting, we can add a Zoom OAuth app and switch `book-founder-call` to create meetings dynamically.

## Google setup

1. Use the Google Workspace account you named: `admin@thepracticecenter.org`.
2. Create a Google Cloud project.
3. Enable the `Google Calendar API`.
4. Create OAuth credentials for a web app.
5. Generate a refresh token tied to the Google account that owns the booking calendar.
6. Set `GOOGLE_CALENDAR_ID` to the calendar you want to use, or `primary`.

If you want all confirmations and calendar ownership to run through Google Workspace, the cleanest first setup is:

- authenticate as `admin@thepracticecenter.org`
- set `GOOGLE_CALENDAR_ID=primary`
- use that same Google Workspace calendar as the source of truth for founder availability

Official docs:

- <https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query>
- <https://developers.google.com/workspace/calendar/api/guides/create-events>
- <https://developers.google.com/identity/protocols/oauth2/web-server>

## Zoom setup

1. Decide which Zoom URL should be the default booking room right now.
2. Put that URL into `ZOOM_MEETING_URL`.

That is enough for the first live version.

## Calendar behavior

The booking page now uses a navigable monthly calendar instead of a running list of dates.

- users can move month to month
- they click a day first
- then the available times for that specific day open below
- the frontend supports a rolling future calendar instead of only April and May

## Netlify CLI commands

Link the site folder to the live Netlify site:

`npx netlify link --id 4bca62a0-864f-47c0-9259-8b985e3a95e9`

Preview deploy:

`npx netlify deploy --dir .`

Production deploy:

`npx netlify deploy --dir . --prod`

## Current blocker

Real booking still needs Google Workspace credentials in Netlify.

The site-level Netlify setting `ignore_html_forms` is still enabled, so standard HTML-form fallback should not be treated as your reliable intake path. The clean path is to finish the Google Calendar setup for `admin@thepracticecenter.org` and use live mode as the source of truth.

CRM sync also depends on a live Supabase project URL and service-role key. The public booking function now expects:

- `CRM_SUPABASE_URL`
- `CRM_SUPABASE_SERVICE_ROLE_KEY`

If the Supabase project host does not resolve, booking will still succeed in Google Calendar but the CRM write will fail until the Supabase project URL is corrected.

## Helpful local scripts

Generate the Google refresh token:

`node scripts/google-workspace-refresh-token.mjs`

Set the Netlify environment variables after you have the token:

`node scripts/set-netlify-booking-env.mjs`
