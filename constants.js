// Permission bitfields used as `default_member_permissions` (sent as strings)
// See https://docs.discord.com/developers/topics/permissions#permissions-bitwise-permission-flags
export const Permissions = {
  KICK_MEMBERS: String(1n << 1n),
  BAN_MEMBERS: String(1n << 2n),
  ADMINISTRATOR: String(1n << 3n),
  MANAGE_GUILD: String(1n << 5n),
  MANAGE_MESSAGES: String(1n << 13n),
  MODERATE_MEMBERS: String(1n << 40n),
};

// Does the interaction member have this permission ? Administrators have them all
// `member.permissions` is computed by Discord for the channel of the interaction
export function hasPermission(interaction, permission) {
  if (!interaction.member) return false;
  const memberPermissions = BigInt(interaction.member.permissions);
  const administrator = BigInt(Permissions.ADMINISTRATOR);
  return (memberPermissions & administrator) === administrator
    || (memberPermissions & BigInt(permission)) === BigInt(permission);
}

// See https://docs.discord.com/developers/resources/application#application-object-application-integration-types
export const IntegrationTypes = { GUILD_INSTALL: 0, USER_INSTALL: 1 };

// See https://docs.discord.com/developers/interactions/application-commands#interaction-contexts
export const Contexts = { GUILD: 0, BOT_DM: 1, PRIVATE_CHANNEL: 2 };

// See https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-types
export const CommandTypes = { CHAT_INPUT: 1, USER: 2, MESSAGE: 3 };
