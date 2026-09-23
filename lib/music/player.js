import { QUEUE_LIMIT } from './limits.js';

export const IDLE_TIMEOUT = 5 * 60_000;
export const ALONE_TIMEOUT = 60_000;
export const MAX_FAILURES = 3;
export const LOOP_MODES = ['off', 'track', 'queue'];

/**
 * The music of a guild: the queue and what to play next. It doesn't know Discord:
 * - `engine` plays the tracks in the voice channel (see voiceEngine.js)
 * - `ui` shows what happens (see nowPlaying.js)
 */
export class Player {
  queue = [];
  current = null;
  loop = 'off';
  volume = 100;
  paused = false;
  destroyed = false;
  #failures = 0;
  #loading = false;
  #skipRequested = false;
  #idleTimer = null;
  #aloneTimer = null;

  constructor({ engine, ui, onDestroy = () => {} }) {
    this.engine = engine;
    this.ui = ui;
    this.onDestroy = onDestroy;
    engine.onTrackEnd(() => this.#handleTrackEnd());
    engine.onDisconnect(() => this.destroy('disconnected'));
  }

  get state() {
    return { current: this.current, queue: this.queue, loop: this.loop, volume: this.volume, paused: this.paused };
  }

  // Returns how many tracks were added: the queue holds QUEUE_LIMIT tracks, the current one included
  add(tracks) {
    const room = QUEUE_LIMIT - this.queue.length - (this.current ? 1 : 0);
    const added = tracks.slice(0, Math.max(0, room));
    if (!added.length) return 0;
    this.queue.push(...added);
    if (this.current) this.#update();
    else this.#playNext();
    return added.length;
  }

  skip() {
    if (!this.current) return false;
    this.#skipRequested = true;
    // A track still loading is stopped as soon as it starts, see #playNext
    if (!this.#loading) this.engine.stop();
    return true;
  }

  pause() {
    if (!this.current || this.paused || this.#loading) return false;
    // The audio player only pauses once the audio really plays (not while it is still buffering)
    if (!this.engine.pause()) return false;
    this.paused = true;
    this.#update();
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.engine.resume();
    this.paused = false;
    this.#update();
    return true;
  }

  setVolume(volume) {
    this.volume = volume;
    this.engine.setVolume(volume / 100);
  }

  setLoop(mode) {
    this.loop = mode;
    this.#update();
  }

  // Nobody listens anymore: leave after ALONE_TIMEOUT, unless someone comes back
  setAlone(alone) {
    if (!alone) {
      clearTimeout(this.#aloneTimer);
      this.#aloneTimer = null;
    } else {
      this.#aloneTimer ??= setTimeout(() => this.destroy('alone'), ALONE_TIMEOUT);
    }
  }

  stop() {
    this.destroy('stopped');
  }

  destroy(reason) {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.#idleTimer);
    clearTimeout(this.#aloneTimer);
    this.engine.destroy();
    this.ui.end(reason);
    this.onDestroy();
  }

  #update() {
    this.ui.update(this.state);
  }

  #handleTrackEnd() {
    if (this.destroyed) return;
    const finished = this.current;
    if (finished) {
      if (this.loop === 'queue') this.queue.push(finished);
      else if (this.loop === 'track' && !this.#skipRequested) this.queue.unshift(finished);
    }
    this.#skipRequested = false;
    this.#playNext();
  }

  async #playNext() {
    this.current = this.queue.shift() ?? null;
    this.paused = false;
    clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
    if (!this.current) {
      this.#update();
      this.#idleTimer = setTimeout(() => this.destroy('idle'), IDLE_TIMEOUT);
      return;
    }

    const track = this.current;
    this.#loading = true;
    try {
      await this.engine.play(track);
    } catch (err) {
      this.#loading = false;
      if (!this.destroyed) this.#handleFailure(track, err);
      return;
    }
    this.#loading = false;
    if (this.destroyed) return;
    this.#failures = 0;
    this.#update();
    if (this.#skipRequested) this.engine.stop();
  }

  #handleFailure(track, err) {
    console.error(`Couldn't play ${track.title}:`, err.message);
    this.#skipRequested = false;
    this.#failures++;
    if (this.#failures >= MAX_FAILURES) {
      this.ui.warn('⚠️ Something is wrong with playback, stopping');
      this.destroy('failed');
      return;
    }
    this.ui.warn(`⚠️ Couldn't play **${track.title}**, skipping`);
    this.#playNext();
  }
}
