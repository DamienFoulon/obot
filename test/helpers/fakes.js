// Lets the pending promises and microtasks run
export const flush = () => new Promise((resolve) => setImmediate(resolve));

export const tracks = (...titles) => titles.map((title) => ({ title, author: 'Artist', duration: 60, requestedBy: 'u1' }));

// Plays nothing: records what the player asks. `gate` makes play() wait, `failing` makes it reject
export class FakeEngine {
  played = [];
  stopped = 0;
  paused = false;
  volume = 1;
  destroyed = false;
  failing = new Set();
  gate = null;
  // Like the audio player, which only pauses while it is actually playing
  canPause = true;

  onTrackEnd(callback) { this.trackEnd = callback; }
  onDisconnect(callback) { this.disconnect = callback; }

  async play(track) {
    this.played.push(track.title);
    if (this.gate) await this.gate;
    if (this.failing.has(track.title)) throw new Error(`cannot play ${track.title}`);
  }

  // Like the audio player: stopping makes it idle, which ends the track
  stop() {
    this.stopped++;
    queueMicrotask(() => this.trackEnd());
  }

  finish() { this.trackEnd(); }
  pause() {
    if (!this.canPause) return false;
    this.paused = true;
    return true;
  }

  resume() {
    this.paused = false;
    return true;
  }
  setVolume(volume) { this.volume = volume; }
  destroy() { this.destroyed = true; }
}

export class FakeUi {
  calls = [];
  update(state) { this.calls.push(['update', state.current?.title ?? null]); }
  warn(text) { this.calls.push(['warn', text]); }
  end(reason) { this.calls.push(['end', reason]); }
  get ended() { return this.calls.find(([type]) => type === 'end')?.[1] ?? null; }
}
