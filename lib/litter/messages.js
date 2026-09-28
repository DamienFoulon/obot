import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
import { THRESHOLD } from './votes.js';

/**
 * Every text of the litter, in French. Public messages only ping the people involved
 */

const mention = (id) => `<@${id}>`;
const mentions = (ids) => ids.map(mention).join(', ');
const count = (vote) => `**${vote.voters.length}/${THRESHOLD}**`;

// Ephemeral answers when the target can't be handled
export const REFUSALS = {
  notConfigured: () => "La litière n'est pas configurée 🐈",
  self: () => 'Tu ne peux pas te mettre toi-même à la litière 💩',
  gone: (id) => `${mention(id)} n'est plus sur le serveur 👀`,
  bot: () => 'Je ne peux pas envoyer un bot à la litière 🤖',
  owner: () => 'Je ne peux pas envoyer le propriétaire du serveur à la litière 👑',
  above: (id) => `${mention(id)} a un rôle au-dessus du mien, je ne peux pas y toucher ⬆️`,
};

// Ephemeral answers to the command and the button (the vote outcomes have the same names as in votes.js)
export const REPLIES = {
  sent: () => "C'est fait, direction la litière 💩",
  released: () => "C'est fait, Pipette a nettoyé 🕊️",
  started: () => 'Vote lancé 👇',
  counted: (vote) => `Ta voix est comptée (${vote.voters.length}/${THRESHOLD}) 🗳️`,
  duplicate: () => 'Tu as déjà voté 🗳️',
  target: () => 'Tu ne peux pas voter contre toi-même 💩',
  reached: () => 'Le peuple a parlé 👇',
  closed: () => 'Ce vote est terminé ⌛',
};

export const voteLink = (vote) => `https://discord.com/channels/${vote.guildId}/${vote.channelId}/${vote.messageId}`;

// components: [] removes the button when a vote message is edited
const publicMessage = (content, users) => ({ content, allowed_mentions: { users: [...new Set(users)] }, components: [] });

export const buildSent = (targetId, byId) => publicMessage(
  `💩 ${mention(targetId)} a fait de la merde : direction la litière de Pipette ! (par ${mention(byId)})`, [targetId, byId],
);

export const buildReleased = (targetId, byId) => publicMessage(
  `🕊️ ${mention(targetId)} sort de la litière (par ${mention(byId)}), Pipette a nettoyé.`, [targetId, byId],
);

const WORDING = {
  litter: {
    proposal: (author, target) => `${author} propose d'envoyer ${target} dans la litière de Pipette 💩`,
    button: { style: ButtonStyleTypes.DANGER, label: '💩 Voter' },
    reached: (target) => `💩 Le peuple a parlé : ${target} part à la litière de Pipette !`,
  },
  release: {
    proposal: (author, target) => `${author} propose de libérer ${target} de la litière 🕊️`,
    button: { style: ButtonStyleTypes.SUCCESS, label: '🕊️ Voter' },
    reached: (target) => `🕊️ Le peuple pardonne : ${target} sort de la litière.`,
  },
};

// The author of the vote is its first voter
export function buildVote(vote) {
  const wording = WORDING[vote.kind];
  const content = `🗳️ ${wording.proposal(mention(vote.voters[0]), mention(vote.targetId))} · ${count(vote)} · votes : ${mentions(vote.voters)}`;
  const message = publicMessage(content, [vote.targetId, ...vote.voters]);
  message.components = [{
    type: MessageComponentTypes.ACTION_ROW,
    components: [{ type: MessageComponentTypes.BUTTON, ...wording.button, custom_id: `litter_vote:${vote.id}` }],
  }];
  return message;
}

export const buildVoteReached = (vote) => publicMessage(
  `${WORDING[vote.kind].reached(mention(vote.targetId))} (${THRESHOLD} votes : ${mentions(vote.voters)})`, [vote.targetId, ...vote.voters],
);

export const buildVoteExpired = (vote) => publicMessage(`⌛ Vote expiré : ${mention(vote.targetId)} reste où il est.`, [vote.targetId]);

export const buildVoteFailed = (vote, reason) => publicMessage(`⌛ Trop tard : ${reason}`, [vote.targetId]);

// An admin acted while the vote was open
export const buildVoteOverruled = (vote) => publicMessage(`⌛ Vote clos : un admin a tranché pour ${mention(vote.targetId)}.`, [vote.targetId]);

// A vote the bot forgot (restart): its target is unknown
export const buildVoteForgotten = () => publicMessage('⌛ Ce vote est terminé.', []);
