/**
 * @discordjs/voice talks to the Gateway through an "adapter": it asks us to send its voice state updates (op 4),
 * and we give it the VOICE_STATE_UPDATE and VOICE_SERVER_UPDATE events of its guild
 * See https://github.com/discordjs/discord.js/tree/main/packages/voice#adapters
 */

// guildId -> methods given by @discordjs/voice
const adapters = new Map();

let sendToGateway = null;

// gateway.js gives its sender here: this file can't import gateway.js, which loads the events using this file
export function setVoicePayloadSender(send) {
  sendToGateway = send;
}

export function createAdapterCreator(guildId) {
  return (methods) => {
    adapters.set(guildId, methods);
    return {
      sendPayload(payload) {
        if (!sendToGateway) return false;
        sendToGateway(guildId, payload).catch((err) => {
          console.error(`Cannot send the voice payload of the guild ${guildId}`, err);
        });
        return true;
      },
      destroy() {
        adapters.delete(guildId);
      },
    };
  };
}

// Only the bot's own voice state matters to its voice connection
export function forwardVoiceStateUpdate(state) {
  if (state.user_id === process.env.APP_ID) adapters.get(state.guild_id)?.onVoiceStateUpdate(state);
}

export function forwardVoiceServerUpdate(data) {
  adapters.get(data.guild_id)?.onVoiceServerUpdate(data);
}
