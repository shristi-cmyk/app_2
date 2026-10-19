# viaSocket Tools

Two tools behind one password: **Partner Outreach** (`/outreach`) and **Invoice Mailer** (`/`).

## Partner Outreach

Goes through the public apps list and, for each app, decides whether to pitch the **SDK** (viaSocket Embed), a **GTM** partnership (co-marketing, listing), or **not to reach out**, with a reason.
For SDK and GTM it drafts the email. You review each draft: send it as is, edit it, or tell the AI what to change. Sent emails go out through your Gmail and are added to the pipeline.

1. **Setup → Import**: in Google Sheets, File → Download → CSV for the `TOTAL PUBLIC APPS` tab and the `Shristi_Pipleline` tab, then pick each file. Re-importing keeps verdicts and drafts.
2. **Setup → Connect Gmail**, and fill in your name, pitches and email style.
3. **Dashboard → Check the next N apps**. Clear cases are settled by rules for free (own products, enterprise giants, duplicates, already active or rejected in the pipeline); the rest go to Claude, one call per app.
4. **Review drafts**: send, edit, ask for changes, switch SDK/GTM, or skip.
5. **Pipeline**: the sheet's rows plus every email sent from here; edit status, follow-up date and notes.

The apps export only names four of its columns, so the importer reads fields by position (`lib/outreach/sheets.js`). If columns move in the sheet, update `APP_COLUMNS` there.

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

## Run

`npm install && npm run build && npm start` (reads `PORT`). Tests: `npm test`.

## Notes
- State is JSON files in `DATA_DIR`: `state.json` (connections, the active subscription) and `outreach.json` (apps, verdicts, drafts, pipeline). On a host with ephemeral disk it resets on redeploy; reconnect and save again, or mount a volume.
- The row handler runs on viaSocket, so new rows are processed even if this app is asleep.
