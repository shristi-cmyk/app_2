# viaSocket Tools

Three tools: **Partner Outreach** (`/outreach`) and **Invoice Mailer** (`/`) behind one password, and **EOD Reports** (`/eod`) with its own per-person sign-in.

## Partner Outreach

Goes through the public apps list and, for each app, decides whether to pitch the **SDK** (viaSocket Embed), a **GTM** partnership (co-marketing, listing), or **not to reach out**, with a reason.
For SDK and GTM it drafts the email. You review each draft: send it as is, edit it, or tell the AI what to change. Sent emails go out through your Gmail and are added to the pipeline.

1. **Setup → Import**: in Google Sheets, File → Download → CSV for the `TOTAL PUBLIC APPS` tab and the `Shristi_Pipleline` tab, then pick each file. Re-importing keeps verdicts and drafts.
2. **Setup → Connect Gmail**, and fill in your name, pitches and email style.
3. **Dashboard → Check the next N apps**. Clear cases are settled by rules for free (own products, enterprise giants, duplicates, already active or rejected in the pipeline); the rest go to Claude, one call per app.
4. **Review drafts**: send, edit, ask for changes, switch SDK/GTM, or skip.
5. **Pipeline**: the sheet's rows plus every email sent from here; edit status, follow-up date and notes.

The apps export only names four of its columns, so the importer reads fields by position (`lib/outreach/sheets.js`). If columns move in the sheet, update `APP_COLUMNS` there.


## EOD Reports

Daily end-of-day updates for a team, and evidence for the team lead's monthly ratings (the app never rates anyone).

- **Employees** (`/eod`) write their update in a chat. AI (viaSocket's, no model key) splits it into Done / Blockers / Plan using only their words; anything it can't match to the message is dropped and reported. They check and edit the draft, then confirm. Nothing is logged before that.
- A confirmed entry is appended to the **Google Sheet** (the source of truth; one row per person per day, keyed by `Entry ID`), posted to the **Slack EOD channel**, and sent as the *EOD Entry Submitted* event. Each step is recorded, so retries never write a second row, post twice or send the event twice.
- **End of day**: a viaSocket schedule calls `/api/eod/cron`; everyone on the roster without an entry gets a private Slack DM (once per day) and an *EOD Entry Missing* event.
- **TLs** (`/eod/team`) see who has submitted, browse history from the sheet, and ask for a brief: consistency (days logged vs working days, computed, not AI), recurring themes, recurring/unresolved blockers and gaps, each citing sheet rows. Evaluative language is filtered out of every brief. The monthly rollup also posts to the TL review channel/DM.
- **Review** (`/eod/review`): entries that look incomplete or contradictory, and failed sheet/Slack steps with Retry.
- **Admin**: *Integrations* (connect Slack and Google Sheets once for the company, live status, viaSocket's prebuilt UI), *Automation* (the four events: set up, open in the builder with a sample payload for field mapping, test, pause, run history, delivery retries; the end-of-day schedule), *Settings* (sheet, tab and columns; Slack channels; timezone and working days; roster, roles and passwords; audit trail).

Statuses: Draft → Confirmed → Logged (or Flagged) · Missing. Employees only ever reach their own entries; team data is TL/admin-only, checked on the server.

Setup: set the `EOD_*` variables (below), sign in at `/eod` with `EOD_ADMIN_EMAIL` / `EOD_ADMIN_PASSWORD`, then Integrations → connect Slack and Google Sheets → Settings → pick the sheet, channels and add people → Automation → set up the four events and save the schedule.

## Invoice Mailer

When a new row is added to a Google Sheet, a PDF invoice is generated from a Google Docs template and emailed to the buyer with Gmail. Google access goes through viaSocket's embed (no Google OAuth code in this app).

Sheet columns: `buyer_email`, `buyer_name`, `invoice_no`, `amount`, `date`.
Template placeholders: `{{buyer_email}}`, `{{buyer_name}}`, `{{invoice_no}}`, `{{amount}}`, `{{date}}`.

## Environment variables (set these on the host; never commit them)

| Name | Value |
| --- | --- |
| `VIASOCKET_ORG_ID` | `62791` |
| `VIASOCKET_PROJECT_ID` | `projC9zfc2g2` |
| `VIASOCKET_API_URL` | `https://flow-api.viasocket.com` |
| `VIASOCKET_EMBED_SECRET` | from the viaSocket dashboard (Install Code). Server only. |
| `APP_PASSWORD` | password for the browser login prompt (choose one) |
| `DATA_DIR` | optional; folder for the state files (use persistent storage) |
| `ANTHROPIC_API_KEY` | Claude API key, for Partner Outreach's AI check and drafts. Server only. |
| `EOD_VIASOCKET_ORG_ID` | `4160` (EOD Reports' own embed) |
| `EOD_VIASOCKET_PROJECT_ID` | `projOEUNHFgu` |
| `EOD_VIASOCKET_EMBED_SECRET` | from that embed's Install Code. Server only. |
| `EOD_WORKSPACE_UID` | optional, default `eod-workspace`: the company identity the admin connects apps under. Never change it once set. |
| `EOD_SESSION_SECRET` | random, 16+ characters; signs EOD sign-in cookies |
| `EOD_ADMIN_EMAIL`, `EOD_ADMIN_PASSWORD` | the first EOD admin's sign-in |
| `EOD_CRON_KEY` | random, 16+ characters; the end-of-day schedule's key |

## Run

`npm install && npm run build && npm start` (reads `PORT`). Tests: `npm test`.

## Notes
- State is JSON files in `DATA_DIR`: `state.json` (connections, the active subscription), `outreach.json` (apps, verdicts, drafts, pipeline) and `eod.json` (EOD roster, settings, entry statuses, idempotency records, audit trail; logged entries themselves are in the Google Sheet). On a host with ephemeral disk it resets on redeploy; reconnect and save again, or mount a volume.
- The row handler runs on viaSocket, so new rows are processed even if this app is asleep.
