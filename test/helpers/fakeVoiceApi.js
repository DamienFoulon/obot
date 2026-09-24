// Records the Discord calls of the rooms registry. `failing.<method>` makes a call throw:
// an Error for every call, or an array of errors used one per call
export class FakeVoiceApi {
  calls = [];
  failing = {};
  nextId = 100;
  created = null;
  channels = new Map();

  constructor(channels = []) {
    for (const channel of channels) this.channels.set(channel.id, channel);
  }

  #fail(method) {
    const failure = this.failing[method];
    const err = Array.isArray(failure) ? failure.shift() : failure;
    if (err) throw err;
  }

  of(type) { return this.calls.filter(([name]) => name === type); }

  async getChannel(id) { this.calls.push(['get', id]); return this.channels.get(id); }
  async createChannel(guildId, body) {
    this.calls.push(['create', body.name]);
    this.#fail('create');
    this.created = body;
    const channel = { id: `room${this.nextId++}`, ...body };
    this.channels.set(channel.id, channel);
    return channel;
  }
  async moveMember(guildId, userId, channelId) { this.calls.push(['move', userId, channelId]); this.#fail('move'); }
  async deleteChannel(channelId) { this.calls.push(['delete', channelId]); this.#fail('delete'); }
  async renameChannel(channelId, name) { this.calls.push(['rename', channelId, name]); this.#fail('rename'); }
  async setOwner(channelId, userId) { this.calls.push(['owner', channelId, userId]); }
  async removeOverwrite(channelId, userId) { this.calls.push(['unowner', channelId, userId]); }
}

// setTimeout / clearTimeout / Date.now on a clock moved by hand
export class FakeTimers {
  now = 0;
  timers = [];
  set = (fn, delay) => {
    const timer = { fn, at: this.now + delay };
    this.timers.push(timer);
    return timer;
  };
  clear = (timer) => { this.timers = this.timers.filter((t) => t !== timer); };
  async advance(ms) {
    this.now += ms;
    const due = this.timers.filter((t) => t.at <= this.now);
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const timer of due) await timer.fn();
  }
}
