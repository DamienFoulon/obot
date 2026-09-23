import { Permissions, hasPermission } from '../../constants.js';

// With DJ_ROLE_ID, only DJs and administrators control the music; without it, every listener does
export function canControlMusic(interaction) {
  const djRoleId = process.env.DJ_ROLE_ID;
  if (!djRoleId) return true;
  return interaction.member.roles.includes(djRoleId) || hasPermission(interaction, Permissions.ADMINISTRATOR);
}

/**
 * Returns why the member can't use a music command or button, or null when they can
 * It depends on the live voice channels, so it can't be a `requiredPermission`
 */
export function getMusicAccessError(interaction, { userChannelId, botChannelId, needsControl }) {
  if (!userChannelId) return 'Join a voice channel first 🎧';
  if (botChannelId && userChannelId !== botChannelId) return `I'm playing in <#${botChannelId}>, join me there 🎧`;
  if (needsControl && !canControlMusic(interaction)) return 'Only DJs can do that 🎚️';
  return null;
}
