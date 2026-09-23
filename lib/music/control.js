import { InteractionResponseType } from 'discord-interactions';
import { getMusicAccessError } from './permissions.js';
import { getPlayer } from './players.js';
import { getBotChannel, getUserChannel } from './voiceStates.js';
import { isYtDlpAvailable } from './ytdlp.js';
import { ephemeralReply } from '../../utils.js';

export const MUSIC_UNAVAILABLE = 'Music is not available on this bot (yt-dlp is missing) 🔇';

/**
 * Runs `action(player)` for a command or button that controls the playback
 * Returns { error } when the member can't, or { message } with what `action` returned
 */
export function controlMusic(interaction, action) {
  if (!isYtDlpAvailable()) return { error: MUSIC_UNAVAILABLE };
  const guildId = interaction.guild_id;
  const player = getPlayer(guildId);
  if (!player) return { error: 'Nothing is playing 🔇' };
  const error = getMusicAccessError(interaction, {
    userChannelId: getUserChannel(guildId, interaction.member.user.id),
    botChannelId: getBotChannel(guildId),
    needsControl: true,
  });
  if (error) return { error };
  return { message: action(player) };
}

export function controlMusicReply(interaction, action) {
  const { error, message } = controlMusic(interaction, action);
  return ephemeralReply(error ?? message);
}

// Buttons answer only on errors: on success the "Now playing" message updates itself
export function controlMusicButton(interaction, action) {
  const { error } = controlMusic(interaction, action);
  return error ? ephemeralReply(error) : { type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE };
}
