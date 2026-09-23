import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';
import { formatDuration, formatTrack } from './format.js';
import { DiscordRequest, parseColor, sendMessage } from '../../utils.js';

/**
 * One "Now playing" message per player, edited on each change instead of posting new ones
 * (the `ui` of player.js). Components V2, see https://docs.discord.com/developers/components/reference#container
 */

const END_TEXTS = {
  alone: '⏹️ Playback ended, everybody left 👋',
  disconnected: '⏹️ Disconnected',
};

function button(customId, emoji, label, style = ButtonStyleTypes.SECONDARY) {
  return { type: MessageComponentTypes.BUTTON, custom_id: customId, style, emoji: { name: emoji }, label };
}

function container(components) {
  return {
    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
    components: [{ type: MessageComponentTypes.CONTAINER, accent_color: parseColor(process.env.OBOT_COLOR), components }],
    // "requested by @someone" must not ping them on every edit
    allowed_mentions: { parse: [] },
  };
}

export function buildNowPlayingMessage({ current, queue, loop, paused }) {
  if (!current) {
    return container([
      { type: MessageComponentTypes.TEXT_DISPLAY, content: '### 💤 Nothing playing\nAdd tracks with `/play`, otherwise I leave in 5 minutes' },
      { type: MessageComponentTypes.ACTION_ROW, components: [button('music_stop', '⏹️', 'Stop', ButtonStyleTypes.DANGER)] },
    ]);
  }

  const next = queue[0];
  const text = {
    type: MessageComponentTypes.TEXT_DISPLAY,
    content: [
      `### ${paused ? '⏸️ Paused' : '🎶 Now playing'}`,
      formatTrack(current),
      `${formatDuration(current.duration)} · requested by <@${current.requestedBy}>`,
      `**Next:** ${next ? formatTrack(next) : 'nothing yet'}`,
    ].join('\n'),
  };
  const body = current.thumbnail
    ? { type: MessageComponentTypes.SECTION, components: [text], accessory: { type: MessageComponentTypes.THUMBNAIL, media: { url: current.thumbnail } } }
    : text;

  return container([
    body,
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        paused ? button('music_pause', '▶️', 'Resume') : button('music_pause', '⏸️', 'Pause'),
        button('music_skip', '⏭️', 'Skip'),
        button('music_loop', '🔁', `Loop: ${loop}`),
        button('music_stop', '⏹️', 'Stop', ButtonStyleTypes.DANGER),
      ],
    },
  ]);
}

export function buildEndedMessage(reason) {
  return container([{ type: MessageComponentTypes.TEXT_DISPLAY, content: END_TEXTS[reason] ?? '⏹️ Playback ended' }]);
}

export function createNowPlaying(channelId) {
  let messageId = null;
  // Discord calls run one after the other: two quick updates must not post two messages
  let chain = Promise.resolve();
  const enqueue = (task) => {
    chain = chain.then(task).catch((err) => console.error('Cannot update the "Now playing" message:', err.message));
  };

  async function show(body) {
    if (messageId) {
      try {
        await DiscordRequest(`channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body });
        return;
      } catch (err) {
        // Deleted by someone: post a new one
        if (!err.message.includes('Discord API error 404')) throw err;
      }
    }
    messageId = (await sendMessage(channelId, body)).id;
  }

  return {
    // The message is built right away: the state keeps changing while the call waits
    update: (state) => {
      const body = buildNowPlayingMessage(state);
      enqueue(() => show(body));
    },
    warn: (content) => enqueue(() => sendMessage(channelId, { content, allowed_mentions: { parse: [] } })),
    end: (reason) => enqueue(async () => {
      if (messageId) await DiscordRequest(`channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: buildEndedMessage(reason) });
    }),
  };
}
