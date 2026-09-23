import {
  AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, createAudioPlayer, entersState, joinVoiceChannel,
} from '@discordjs/voice';
import { createTrackStream } from './audio.js';
import { createAdapterCreator } from './voiceAdapter.js';

// An error whose message can be shown as is to the member
export class VoiceJoinError extends Error {}

/**
 * Plays the tracks of a Player in a voice channel (the `engine` of player.js)
 * See https://discordjs.guide/voice
 */
class VoiceEngine {
  #stream = null;
  #volume = 1;
  #destroyed = false;
  #onTrackEnd = () => {};
  #onDisconnect = () => {};

  constructor(connection) {
    this.connection = connection;
    this.audioPlayer = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    connection.subscribe(this.audioPlayer);

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.#killStream();
      if (!this.#destroyed) this.#onTrackEnd();
    });
    // The player goes idle after an error: the queue moves on by itself
    this.audioPlayer.on('error', (err) => console.error('Audio player error:', err.message));

    // Moved to another channel or network issue: Discord reconnects within a few seconds, otherwise give up
    // See https://discordjs.guide/voice/voice-connections.html#handling-disconnects
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (!this.#destroyed) this.#onDisconnect();
      }
    });
  }

  onTrackEnd(callback) {
    this.#onTrackEnd = callback;
  }

  onDisconnect(callback) {
    this.#onDisconnect = callback;
  }

  async play(track) {
    const stream = await createTrackStream(track);
    // Stopped while the track was loading
    if (this.#destroyed) {
      stream.kill();
      return;
    }
    this.#stream = stream;
    stream.resource.volume.setVolume(this.#volume);
    this.audioPlayer.play(stream.resource);
  }

  pause() {
    this.audioPlayer.pause();
  }

  resume() {
    this.audioPlayer.unpause();
  }

  stop() {
    this.audioPlayer.stop(true);
  }

  setVolume(volume) {
    this.#volume = volume;
    this.#stream?.resource.volume.setVolume(volume);
  }

  destroy() {
    this.#destroyed = true;
    this.#killStream();
    this.audioPlayer.stop(true);
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
  }

  #killStream() {
    this.#stream?.kill();
    this.#stream = null;
  }
}

// Without the Connect permission or in a full channel, Discord never answers: the join times out
export async function connectVoiceEngine({ guildId, channelId }) {
  const connection = joinVoiceChannel({ guildId, channelId, adapterCreator: createAdapterCreator(guildId), selfDeaf: true });
  // Voice WebSocket or UDP errors are re-emitted here: without a listener, the throw would kill the whole bot
  // Recovery is handled by the Disconnected listener of the engine
  connection.on('error', (err) => console.error('Voice connection error:', err.message));
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch {
    connection.destroy();
    throw new VoiceJoinError(`I couldn't join <#${channelId}>: check that I have the **Connect** and **Speak** permissions there, and that the channel isn't full 🔒`);
  }
  return new VoiceEngine(connection);
}
