// The voice channel of the litter; its category is hidden with it
export const litterChannelId = () => process.env.LITTER_CHANNEL_ID;

// The feature needs the litter channel and the database (saved roles)
export function isLitterEnabled() {
  return Boolean(litterChannelId() && process.env.DB_HOST);
}
