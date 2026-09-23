import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { MUSIC_UNAVAILABLE } from '../../lib/music/control.js';
import { formatAdded } from '../../lib/music/format.js';
import { getMusicAccessError } from '../../lib/music/permissions.js';
import { getOrCreatePlayer } from '../../lib/music/players.js';
import { ResolveError } from '../../lib/music/resolvers/errors.js';
import { resolve } from '../../lib/music/resolvers/index.js';
import { VoiceJoinError } from '../../lib/music/voiceEngine.js';
import { getBotChannel, getUserChannel } from '../../lib/music/voiceStates.js';
import { YtDlpError, isYtDlpAvailable, warnIfBotCheck } from '../../lib/music/ytdlp.js';
import { replyAfter } from '../../utils.js';

export const data = {
  name: 'play',
  description: 'Play a song or a playlist in your voice channel',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 3, // STRING
      name: 'query',
      description: 'A YouTube, SoundCloud, Spotify, Deezer or Apple Music link, or what to search on YouTube',
      required: true,
      max_length: 500,
    },
  ],
};

function describeResolveError(err) {
  if (err instanceof ResolveError) return err.message;
  if (err instanceof YtDlpError) {
    warnIfBotCheck(err);
    if (err.botCheck) return 'YouTube is blocking me right now 🤖 ask the bot owner to set up YTDLP_COOKIES';
    return `I couldn't read this link: ${err.message.replace(/^ERROR: /, '')}`;
  }
  throw err;
}

export async function execute(interaction, res) {
  const query = interaction.data.options.find((option) => option.name === 'query').value;
  const guildId = interaction.guild_id;
  const userId = interaction.member.user.id;

  // Reading a playlist or joining a channel takes more than the 3 seconds Discord waits for
  await replyAfter(interaction, res, async () => {
    if (!isYtDlpAvailable()) return MUSIC_UNAVAILABLE;
    const userChannelId = getUserChannel(guildId, userId);
    const accessError = getMusicAccessError(interaction, { userChannelId, botChannelId: getBotChannel(guildId), needsControl: false });
    if (accessError) return accessError;

    let result;
    try {
      result = await resolve(query, userId);
    } catch (err) {
      return describeResolveError(err);
    }
    if (!result.tracks.length) return 'Nothing to play in there 🤷';

    let player;
    try {
      player = await getOrCreatePlayer({ guildId, channelId: userChannelId, textChannelId: interaction.channel_id });
    } catch (err) {
      if (err instanceof VoiceJoinError) return err.message;
      throw err;
    }
    // Reading the link takes time: meanwhile, another /play may have taken the bot to another channel
    const channelError = getMusicAccessError(interaction, {
      userChannelId: getUserChannel(guildId, userId),
      botChannelId: getBotChannel(guildId),
      needsControl: false,
    });
    if (channelError) return channelError;
    return formatAdded(result, player.add(result.tracks));
  });
}
