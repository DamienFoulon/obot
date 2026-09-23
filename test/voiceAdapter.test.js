import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAdapterCreator, forwardVoiceServerUpdate, forwardVoiceStateUpdate, setVoicePayloadSender,
} from '../lib/music/voiceAdapter.js';

function libraryMethods(received) {
  return {
    onVoiceStateUpdate: (data) => received.push(['state', data.user_id]),
    onVoiceServerUpdate: (data) => received.push(['server', data.guild_id]),
    destroy() {},
  };
}

test('forwards the bot voice state and the voice server of its guild only', () => {
  process.env.APP_ID = 'bot';
  const received = [];
  const adapter = createAdapterCreator('g1')(libraryMethods(received));

  forwardVoiceStateUpdate({ guild_id: 'g1', user_id: 'someone' });
  forwardVoiceStateUpdate({ guild_id: 'g1', user_id: 'bot' });
  forwardVoiceServerUpdate({ guild_id: 'g2' });
  forwardVoiceServerUpdate({ guild_id: 'g1' });
  assert.deepEqual(received, [['state', 'bot'], ['server', 'g1']]);

  adapter.destroy();
  forwardVoiceServerUpdate({ guild_id: 'g1' });
  assert.equal(received.length, 2);
});

test('sends the payloads through the Gateway sender', () => {
  const sent = [];
  setVoicePayloadSender(async (guildId, payload) => sent.push([guildId, payload.op]));
  const adapter = createAdapterCreator('g1')(libraryMethods([]));
  assert.equal(adapter.sendPayload({ op: 4 }), true);
  assert.deepEqual(sent, [['g1', 4]]);
  adapter.destroy();
});
