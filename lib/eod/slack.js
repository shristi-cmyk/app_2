import { IDS } from './config.js'
import { db } from './db.js'
import { runAction, connection, ActionError } from './vs.js'

// Fixed in code for every message, with the reason:
// - bot_details.bot_name "EOD Reports": one recognisable sender for the whole team.
// - preview.unfurl_*: false, so entries stay compact text.
// - No schedule_type / buttons / tagged_users: posts go out at once, with no extra notifications.
const BOT = { bot_name: 'EOD Reports' }

const bullets = (items) => (items.length ? items.map((x) => `• ${x}`).join('\n') : '_none_')

export function formatEntry(member, entry) {
  return [
    `*EOD · ${member.name}* · ${entry.date}`,
    `*Done*\n${bullets(entry.fields.done)}`,
    `*Blockers*\n${bullets(entry.fields.blockers)}`,
    `*Plan*\n${bullets(entry.fields.plan)}`
  ].join('\n')
}

async function sendToChannel(channelId, text) {
  const { scriptId } = connection('slack')
  const result = await runAction(scriptId, IDS.slackSendMessage, {
    destination: { messageto: 'channel', channel_id: [channelId] },
    markdown_content: text,
    bot_details: BOT,
    preview: { unfurl_links: false, unfurl_media: false }
  })
  return { ts: result?.ts || result?.message?.ts || null, channel: result?.channel || channelId }
}

// An entry goes only to the designated EOD channel, never anywhere else.
export async function postEntry(member, entry) {
  const channel = db().settings.slack.eodChannelId
  if (!channel) throw new ActionError('The Slack EOD channel is not set in Settings.')
  return sendToChannel(channel, formatEntry(member, entry))
}

// A private DM to one person: no one else sees who has not reported.
export async function sendDm(slackUserId, content) {
  const { scriptId } = connection('slack')
  const result = await runAction(scriptId, IDS.slackSendDm, {
    userId: slackUserId,
    content,
    isScheduledMessage: 'no',
    bot_details: { ...BOT, customIcon: false }
  })
  return { ts: result?.ts || null }
}

// TL-only summaries (rollups) go to the TL review channel or DM the admin chose.
export async function postToTl(text) {
  const s = db().settings.slack
  if (!s.tlTargetId) throw new ActionError('The TL review channel/DM is not set in Settings.')
  if (s.tlTargetType === 'user') return sendDm(s.tlTargetId, text)
  return sendToChannel(s.tlTargetId, text)
}

export function reminderText(member, date, appUrl) {
  const link = appUrl ? `\nSubmit it here: ${appUrl.replace(/\/$/, '')}/eod` : ''
  return `Hi ${member.name}, we haven't received your EOD update for ${date} yet.${link}`
}
