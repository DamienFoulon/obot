/**
 * The open votes, in memory: a vote is a joke of the moment, a restart forgetting it is fine
 */

export const THRESHOLD = 4;
export const VOTE_TTL_MS = 5 * 60 * 1000;

export function createVotes({ now = Date.now } = {}) {
  const votes = new Map();
  let nextId = 1;

  const isExpired = (vote) => now() >= vote.expiresAt;
  const isOpen = (vote) => votes.has(vote.id) && !isExpired(vote);

  return {
    isExpired,

    open({ guildId, targetId, kind, authorId, channelId }) {
      const vote = {
        id: String(nextId++), guildId, targetId, kind, voters: [authorId], channelId, messageId: null, expiresAt: now() + VOTE_TTL_MS,
      };
      votes.set(vote.id, vote);
      return vote;
    },

    // The open vote of this target and kind ('litter' | 'release'), or null
    find(guildId, targetId, kind) {
      for (const vote of votes.values()) {
        if (isOpen(vote) && vote.guildId === guildId && vote.targetId === targetId && vote.kind === kind) return vote;
      }
      return null;
    },

    get(id) {
      return votes.get(id) ?? null;
    },

    // 'reached' closes the vote; 'closed' is a vote already reached, closed or expired
    cast(vote, userId) {
      if (!isOpen(vote)) {
        votes.delete(vote.id);
        return 'closed';
      }
      if (userId === vote.targetId) return 'target';
      if (vote.voters.includes(userId)) return 'duplicate';
      vote.voters.push(userId);
      if (vote.voters.length < THRESHOLD) return 'counted';
      votes.delete(vote.id);
      return 'reached';
    },

    close(vote) {
      votes.delete(vote.id);
    },
  };
}
