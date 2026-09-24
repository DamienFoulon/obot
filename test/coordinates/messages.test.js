import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCard, buildCoordinateModal, buildDeleteConfirmation, buildListPage, buildPanel, buildPicker, formatCoordinateLine,
} from '../../lib/coordinates/messages.js';

const coordinate = (id, extra = {}) => ({
  id, threadId: 't1', name: `Lieu ${id}`, dimension: 'overworld', x: 120, y: 64, z: -340,
  note: null, createdBy: 'u1', updatedBy: null, ...extra,
});
const inner = (message) => message.components[0].components;
const texts = (message) => inner(message).filter((c) => c.type === 10).map((c) => c.content).join('\n');
const buttons = (message) => inner(message).filter((c) => c.type === 1).flatMap((row) => row.components).filter((c) => c.type === 2);

test('the panel has the 3 buttons and is a Components V2 message', () => {
  const panel = buildPanel();
  assert.equal(panel.flags, 32768);
  assert.deepEqual(buttons(panel).map((b) => b.custom_id), ['coords_add', 'coords_edit', 'coords_list']);
  assert.deepEqual(panel.allowed_mentions, { parse: [] });
});

test('a list line: icon, escaped name and note, author or last editor', () => {
  assert.equal(formatCoordinateLine(coordinate(1, { name: '*Base*', dimension: 'nether', note: 'près du _portail_' })),
    '🔥 **\\*Base\\*** — 120 64 -340 · *près du \\_portail\\_* · ajoutée par <@u1>');
  assert.equal(formatCoordinateLine(coordinate(1, { updatedBy: 'u2' })), '🌍 **Lieu 1** — 120 64 -340 · modifiée par <@u2>');
});

test('a list page with its paging buttons', () => {
  const coordinates = Array.from({ length: 10 }, (_, i) => coordinate(i + 1));
  const first = buildListPage({ coordinates, total: 23, page: 0 });
  assert.match(texts(first), /Lieu 10/);
  assert.match(texts(first), /Page 1\/3 · 23 coordonnées/);
  const [previous, next] = buttons(first);
  assert.equal(previous.custom_id, 'coords_page:-1');
  assert.equal(previous.disabled, true);
  assert.equal(next.custom_id, 'coords_page:1');
  assert.equal(next.disabled, false);
  const last = buildListPage({ coordinates: coordinates.slice(0, 3), total: 23, page: 2 });
  assert.equal(buttons(last)[1].disabled, true);
});

test('an empty world', () => {
  assert.match(texts(buildListPage({ coordinates: [], total: 0, page: 0 })), /Aucune coordonnée dans ce monde/);
  assert.match(texts(buildPicker({ coordinates: [], total: 0, page: 0 })), /Aucune coordonnée dans ce monde/);
});

test('the picker: a select of the page, paging only above 25', () => {
  const coordinates = Array.from({ length: 25 }, (_, i) => coordinate(i + 1));
  const picker = buildPicker({ coordinates, total: 30, page: 0 });
  const select = inner(picker).find((c) => c.type === 1 && c.components[0].type === 3).components[0];
  assert.equal(select.custom_id, 'coords_pick:0');
  assert.equal(select.options.length, 25);
  assert.deepEqual(select.options[0], { label: 'Lieu 1', value: '1', description: 'Overworld · 120 64 -340', emoji: { name: '🌍' } });
  assert.deepEqual(buttons(picker).map((b) => b.custom_id), ['coords_pick_page:-1', 'coords_pick_page:1']);
  assert.deepEqual(buttons(buildPicker({ coordinates: coordinates.slice(0, 3), total: 3, page: 0 })), []);
});

test('the card and the delete confirmation keep the picker page', () => {
  const card = buildCard(coordinate(7, { note: 'ferme', updatedBy: 'u2' }), 2);
  assert.match(texts(card), /Overworld[\s\S]*120 64 -340[\s\S]*ferme[\s\S]*<@u1>[\s\S]*<@u2>/);
  assert.deepEqual(buttons(card).map((b) => b.custom_id), ['coords_modify:7', 'coords_delete:7:2', 'coords_back:2']);
  const confirmation = buildDeleteConfirmation(coordinate(7), 2);
  assert.deepEqual(buttons(confirmation).map((b) => b.custom_id), ['coords_delete_confirm:7:2', 'coords_back:2']);
});

test('the modal, empty or prefilled', () => {
  const empty = buildCoordinateModal({ customId: 'coords_add_modal', title: 'Ajouter une coordonnée' });
  assert.equal(empty.custom_id, 'coords_add_modal');
  assert.deepEqual(empty.components.map((label) => label.component.custom_id), ['name', 'coordinates', 'dimension', 'note']);
  assert.equal(empty.components[2].component.options.find((o) => o.default).value, 'overworld');

  const filled = buildCoordinateModal({ customId: 'coords_edit_modal:7', title: 'Modifier une coordonnée', coordinate: coordinate(7, { dimension: 'end', note: 'ferme' }) });
  assert.equal(filled.components[0].component.value, 'Lieu 7');
  assert.equal(filled.components[1].component.value, '120 64 -340');
  assert.equal(filled.components[2].component.options.find((o) => o.default).value, 'end');
  assert.equal(filled.components[3].component.value, 'ferme');
  assert.equal(filled.components[3].component.required, false);
});
