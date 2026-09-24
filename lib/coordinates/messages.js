import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { DIMENSIONS, LIMITS } from './parse.js';
import { escapeMarkdown, parseColor } from '../../utils.js';

/**
 * Every message of the coordinates feature, in French, as Components V2
 * See https://docs.discord.com/developers/components/reference#container
 */

export const LIST_PAGE_SIZE = 10;
// A select menu holds 25 options at most
export const PICKER_PAGE_SIZE = 25;

const EMPTY_WORLD = "Aucune coordonnée dans ce monde pour l'instant. Utilise ➕ Ajouter.";

function button(customId, label, style = ButtonStyleTypes.SECONDARY, disabled = false) {
  return { type: MessageComponentTypes.BUTTON, custom_id: customId, label, style, disabled };
}

function row(...components) {
  return { type: MessageComponentTypes.ACTION_ROW, components };
}

function text(content) {
  return { type: MessageComponentTypes.TEXT_DISPLAY, content };
}

function container(...components) {
  return {
    components: [{ type: MessageComponentTypes.CONTAINER, accent_color: parseColor(process.env.OBOT_COLOR), components }],
    allowed_mentions: { parse: [] },
  };
}

function pageCount(total, size) {
  return Math.max(1, Math.ceil(total / size));
}

function countLabel(total) {
  return `${total} coordonnée${total > 1 ? 's' : ''}`;
}

export function formatPosition({ dimension, x, y, z }) {
  return `${DIMENSIONS[dimension].emoji} ${x} ${y} ${z}`;
}

export function formatCoordinateLine(coordinate) {
  const { dimension, name, x, y, z, note, createdBy, updatedBy } = coordinate;
  let line = `${DIMENSIONS[dimension].emoji} **${escapeMarkdown(name)}** — ${x} ${y} ${z}`;
  if (note) line += ` · *${escapeMarkdown(note)}*`;
  return line + (updatedBy ? ` · modifiée par <@${updatedBy}>` : ` · ajoutée par <@${createdBy}>`);
}

// The permanent message of each world: a regular message, so it carries its own flags
export function buildPanel() {
  return {
    ...container(
      text('## 📍 Coordonnées\nAjoute, modifie ou retrouve les coordonnées de ce monde. Les réponses ne sont visibles que par toi.'),
      row(
        button('coords_add', '➕ Ajouter', ButtonStyleTypes.SUCCESS),
        button('coords_edit', '✏️ Modifier', ButtonStyleTypes.PRIMARY),
        button('coords_list', '📜 Lister'),
      ),
    ),
    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
  };
}

export function buildListPage({ coordinates, total, page }) {
  if (!total) return container(text(`## 📜 Coordonnées\n${EMPTY_WORLD}`));
  const pages = pageCount(total, LIST_PAGE_SIZE);
  return container(
    text(`## 📜 Coordonnées\n${coordinates.map(formatCoordinateLine).join('\n')}`),
    text(`-# Page ${page + 1}/${pages} · ${countLabel(total)}`),
    row(
      button(`coords_page:${page - 1}`, '◀ Précédent', ButtonStyleTypes.SECONDARY, page <= 0),
      button(`coords_page:${page + 1}`, 'Suivant ▶', ButtonStyleTypes.SECONDARY, page >= pages - 1),
    ),
  );
}

export function buildPicker({ coordinates, total, page }) {
  if (!total) return container(text(`## ✏️ Modifier\n${EMPTY_WORLD}`));
  const pages = pageCount(total, PICKER_PAGE_SIZE);
  const components = [
    text('## ✏️ Modifier\nChoisis la coordonnée à modifier ou à supprimer.'),
    row({
      type: MessageComponentTypes.STRING_SELECT,
      // The page comes back with the choice, for the "Retour" button of the card
      custom_id: `coords_pick:${page}`,
      placeholder: 'Choisis une coordonnée',
      options: coordinates.map(({ id, name, dimension, x, y, z }) => ({
        label: name,
        value: String(id),
        description: `${DIMENSIONS[dimension].label} · ${x} ${y} ${z}`,
        emoji: { name: DIMENSIONS[dimension].emoji },
      })),
    }),
  ];
  if (pages > 1) {
    components.push(
      text(`-# Page ${page + 1}/${pages} · ${countLabel(total)}`),
      row(
        button(`coords_pick_page:${page - 1}`, '◀ Précédent', ButtonStyleTypes.SECONDARY, page <= 0),
        button(`coords_pick_page:${page + 1}`, 'Suivant ▶', ButtonStyleTypes.SECONDARY, page >= pages - 1),
      ),
    );
  }
  return container(...components);
}

export function buildCard(coordinate, page) {
  const { id, name, dimension, x, y, z, note, createdBy, updatedBy } = coordinate;
  const lines = [
    `## ${DIMENSIONS[dimension].emoji} ${escapeMarkdown(name)}`,
    `**Dimension :** ${DIMENSIONS[dimension].label}`,
    `**Position :** ${x} ${y} ${z}`,
  ];
  if (note) lines.push(`**Note :** ${escapeMarkdown(note)}`);
  lines.push(`**Ajoutée par :** <@${createdBy}>`);
  if (updatedBy) lines.push(`**Modifiée par :** <@${updatedBy}>`);
  return container(
    text(lines.join('\n')),
    row(
      button(`coords_modify:${id}`, '✏️ Modifier', ButtonStyleTypes.PRIMARY),
      button(`coords_delete:${id}:${page}`, '🗑️ Supprimer', ButtonStyleTypes.DANGER),
      button(`coords_back:${page}`, '↩ Retour'),
    ),
  );
}

// Everybody can delete: ask once more
export function buildDeleteConfirmation(coordinate, page) {
  return container(
    text(`Supprimer **${escapeMarkdown(coordinate.name)}** ? Tout le monde perdra cette coordonnée.`),
    row(
      button(`coords_delete_confirm:${coordinate.id}:${page}`, '🗑️ Oui, supprimer', ButtonStyleTypes.DANGER),
      button(`coords_back:${page}`, '↩ Annuler'),
    ),
  );
}

export function buildDeleted(coordinate, page) {
  return container(
    text(`🗑️ Coordonnée **${escapeMarkdown(coordinate.name)}** supprimée.`),
    row(button(`coords_back:${page}`, '↩ Retour')),
  );
}

export function buildMissing(page) {
  return container(text("Cette coordonnée n'existe plus."), row(button(`coords_back:${page}`, '↩ Retour')));
}

// Modals hold 5 components at most: X, Y and Z share one field
// See https://docs.discord.com/developers/components/reference#label
export function buildCoordinateModal({ customId, title, coordinate }) {
  const label = (labelText, component, description) => ({
    type: MessageComponentTypes.LABEL, label: labelText, ...(description && { description }), component,
  });
  const input = (id, style, options) => ({ type: MessageComponentTypes.INPUT_TEXT, custom_id: id, style, ...options });
  const chosen = coordinate?.dimension ?? 'overworld';

  return {
    custom_id: customId,
    title,
    components: [
      label('Nom', input('name', TextStyleTypes.SHORT, { max_length: LIMITS.name, value: coordinate?.name, placeholder: 'Base principale' })),
      label(
        'Coordonnées',
        input('coordinates', TextStyleTypes.SHORT, {
          max_length: 60,
          value: coordinate ? `${coordinate.x} ${coordinate.y} ${coordinate.z}` : undefined,
          placeholder: '120 64 -340',
        }),
        'X Y Z, par exemple 120 64 -340',
      ),
      label('Dimension', {
        type: MessageComponentTypes.STRING_SELECT,
        custom_id: 'dimension',
        options: Object.entries(DIMENSIONS).map(([value, { label: name, emoji }]) => ({
          label: name, value, emoji: { name: emoji }, default: value === chosen,
        })),
      }),
      label('Note', input('note', TextStyleTypes.PARAGRAPH, {
        max_length: LIMITS.note, required: false, value: coordinate?.note ?? undefined, placeholder: 'Facultatif',
      })),
    ],
  };
}
