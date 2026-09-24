import { checkListeners } from '../../lib/music/players.js';
import { forwardVoiceStateUpdate } from '../../lib/music/voiceAdapter.js';
import { getUserChannel, updateVoiceState } from '../../lib/music/voiceStates.js';
import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'VOICE_STATE_UPDATE';

export async function execute(state) {
  // The channel the member leaves is only known before the voice states are updated
  const oldChannelId = state.guild_id ? getUserChannel(state.guild_id, state.user_id) : null;
  updateVoiceState(state);
  forwardVoiceStateUpdate(state);
  if (!state.guild_id) return;
  checkListeners(state.guild_id);
  await tempVoice.onVoiceState({
    guildId: state.guild_id,
    userId: state.user_id,
    member: state.member,
    bot: Boolean(state.member?.user?.bot),
    oldChannelId,
    newChannelId: state.channel_id,
  });
}
