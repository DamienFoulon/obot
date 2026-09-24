import { InteractionResponseFlags, InteractionResponseType } from 'discord-interactions';
import { DuplicateNameError } from './errors.js';
import { isWorldThread } from './forum.js';
import {
  LIST_PAGE_SIZE, PICKER_PAGE_SIZE,
  buildCard, buildCoordinateModal, buildDeleteConfirmation, buildDeleted, buildListPage, buildMissing, buildPicker, formatPosition,
} from './messages.js';
import { parseCoordinateForm } from './parse.js';
import * as mysqlStore from './store.js';
import { escapeMarkdown, getModalValues } from '../../utils.js';

export const ERRORS = {
  notInWorld: 'Ce bouton ne fonctionne que dans un monde du forum des coordonnées.',
  unavailable: "Impossible d'accéder aux coordonnées pour le moment, réessaie dans un instant.",
  missing: "Cette coordonnée n'existe plus.",
};

const { EPHEMERAL, IS_COMPONENTS_V2 } = InteractionResponseFlags;

// A new ephemeral text message: errors and confirmations
function reply(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  };
}

// A new ephemeral Components V2 message: the list and the picker opened from the panel
function replyWith(message) {
  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { ...message, flags: EPHEMERAL | IS_COMPONENTS_V2 } };
}

// Updates the ephemeral message the button or the select belongs to
function update(message) {
  return { type: InteractionResponseType.UPDATE_MESSAGE, data: { ...message, flags: IS_COMPONENTS_V2 } };
}

function modal(data) {
  return { type: InteractionResponseType.MODAL, data };
}

const duplicate = (name) => reply(`❌ Une coordonnée « ${escapeMarkdown(name)} » existe déjà dans ce monde.`);

/**
 * Coordinates interactions -> responses. The world is always the post the interaction comes from:
 * custom ids only carry coordinate ids and pages, and every store call is scoped to the post
 */
export function createCoordinateHandlers(store) {
  async function inWorld(interaction, action) {
    if (!(await isWorldThread(interaction.channel_id, interaction.channel?.parent_id))) return reply(ERRORS.notInWorld);
    try {
      return await action(interaction.channel_id, interaction.member.user.id);
    } catch (err) {
      console.error('Coordinates error:', err);
      return reply(ERRORS.unavailable);
    }
  }

  // The page is clamped: coordinates may have been deleted since the message was shown
  async function loadPage(threadId, page, size) {
    const total = await store.countCoordinates(threadId);
    const last = Math.max(0, Math.ceil(total / size) - 1);
    const current = Math.min(Math.max(0, Number(page) || 0), last);
    return { coordinates: await store.listCoordinates(threadId, { offset: current * size, limit: size }), total, page: current };
  }

  function readForm(interaction) {
    return parseCoordinateForm(getModalValues(interaction.data.components));
  }

  return {
    openAdd: (interaction) => inWorld(interaction, async () => (
      modal(buildCoordinateModal({ customId: 'coords_add_modal', title: 'Ajouter une coordonnée' }))
    )),

    submitAdd: (interaction) => inWorld(interaction, async (threadId, userId) => {
      const { value, error } = readForm(interaction);
      if (error) return reply(`❌ ${error}`);
      try {
        await store.addCoordinate(threadId, value, userId);
      } catch (err) {
        if (err instanceof DuplicateNameError) return duplicate(value.name);
        throw err;
      }
      return reply(`✅ Coordonnée **${escapeMarkdown(value.name)}** enregistrée : ${formatPosition(value)}`);
    }),

    showList: (interaction, page, { edit = false } = {}) => inWorld(interaction, async (threadId) => {
      const message = buildListPage(await loadPage(threadId, page, LIST_PAGE_SIZE));
      return edit ? update(message) : replyWith(message);
    }),

    showPicker: (interaction, page, { edit = false } = {}) => inWorld(interaction, async (threadId) => {
      const message = buildPicker(await loadPage(threadId, page, PICKER_PAGE_SIZE));
      return edit ? update(message) : replyWith(message);
    }),

    showCard: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      return update(coordinate ? buildCard(coordinate, page) : buildMissing(page));
    }),

    openEdit: (interaction, id) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      if (!coordinate) return reply(ERRORS.missing);
      return modal(buildCoordinateModal({ customId: `coords_edit_modal:${coordinate.id}`, title: 'Modifier une coordonnée', coordinate }));
    }),

    submitEdit: (interaction, id) => inWorld(interaction, async (threadId, userId) => {
      if (!(await store.getCoordinate(threadId, id))) return reply(ERRORS.missing);
      const { value, error } = readForm(interaction);
      if (error) return reply(`❌ ${error}`);
      let updated;
      try {
        updated = await store.updateCoordinate(threadId, id, value, userId);
      } catch (err) {
        if (err instanceof DuplicateNameError) return duplicate(value.name);
        throw err;
      }
      if (!updated) return reply(ERRORS.missing);
      return reply(`✅ Coordonnée **${escapeMarkdown(value.name)}** modifiée : ${formatPosition(value)}`);
    }),

    askDelete: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      return update(coordinate ? buildDeleteConfirmation(coordinate, page) : buildMissing(page));
    }),

    confirmDelete: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      if (!coordinate || !(await store.deleteCoordinate(threadId, id))) return update(buildMissing(page));
      return update(buildDeleted(coordinate, page));
    }),
  };
}

export const coordinateHandlers = createCoordinateHandlers(mysqlStore);
