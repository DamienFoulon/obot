import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ERRORS, createCoordinateHandlers } from '../../lib/coordinates/handlers.js';
import { createFakeStore } from '../helpers/fakeCoordinateStore.js';

const REPLY = 4;
const UPDATE = 7;
const MODAL = 9;

let store;
let handlers;

beforeEach(() => {
  process.env.COORDINATES_FORUM_ID = 'forum';
  process.env.DB_HOST = 'db';
  store = createFakeStore();
  handlers = createCoordinateHandlers(store);
});

const interaction = (threadId, data = {}, parentId = 'forum', userId = 'u1') => ({
  channel_id: threadId, channel: { id: threadId, parent_id: parentId }, member: { user: { id: userId } }, data,
});

// A submitted modal, as Discord sends it: labels wrapping the inputs and the select
const submitted = ({ name = 'Base', coordinates = '120 64 -340', dimension = 'overworld', note = '' } = {}) => ({
  components: [
    { type: 18, component: { type: 4, custom_id: 'name', value: name } },
    { type: 18, component: { type: 4, custom_id: 'coordinates', value: coordinates } },
    { type: 18, component: { type: 3, custom_id: 'dimension', values: [dimension] } },
    { type: 18, component: { type: 4, custom_id: 'note', value: note } },
  ],
});

const allText = (response) => JSON.stringify(response.data);

test('adding a coordinate', async () => {
  const response = await handlers.submitAdd(interaction('t1', submitted({ name: 'Base', dimension: 'nether' })));
  assert.equal(response.type, REPLY);
  assert.equal(response.data.flags, 64);
  assert.equal(response.data.content, '✅ Coordonnée **Base** enregistrée : 🔥 120 64 -340');
  assert.deepEqual(store.rows.map((row) => [row.threadId, row.name, row.createdBy]), [['t1', 'Base', 'u1']]);
});

test('an invalid form or a duplicate name writes nothing', async () => {
  const invalid = await handlers.submitAdd(interaction('t1', submitted({ coordinates: '1 2' })));
  assert.match(invalid.data.content, /^❌ Les coordonnées doivent être 3 nombres entiers/);
  await handlers.submitAdd(interaction('t1', submitted({ name: 'Base' })));
  const duplicate = await handlers.submitAdd(interaction('t1', submitted({ name: 'BASE' })));
  assert.equal(duplicate.data.content, '❌ Une coordonnée « BASE » existe déjà dans ce monde.');
  assert.equal(store.rows.length, 1);
});

test('the same name in two worlds is fine', async () => {
  await handlers.submitAdd(interaction('t1', submitted({ name: 'Base' })));
  const other = await handlers.submitAdd(interaction('t2', submitted({ name: 'Base' })));
  assert.match(other.data.content, /^✅/);
  assert.equal(store.rows.length, 2);
});

test('outside the coordinates forum, every handler refuses', async () => {
  const outside = interaction('t1', submitted(), 'other');
  for (const response of [await handlers.openAdd(outside), await handlers.submitAdd(outside), await handlers.showList(outside, 0)]) {
    assert.equal(response.type, REPLY);
    assert.equal(response.data.content, ERRORS.notInWorld);
  }
  assert.equal(store.rows.length, 0);
});

test('the add button opens the modal', async () => {
  const response = await handlers.openAdd(interaction('t1'));
  assert.equal(response.type, MODAL);
  assert.equal(response.data.custom_id, 'coords_add_modal');
});

test('the list only shows the coordinates of its world, paged', async () => {
  for (let i = 1; i <= 12; i++) await store.addCoordinate('t1', { name: `A${String(i).padStart(2, '0')}`, dimension: 'overworld', x: i, y: 64, z: 0, note: null }, 'u1');
  await store.addCoordinate('t2', { name: 'Ailleurs', dimension: 'overworld', x: 0, y: 64, z: 0, note: null }, 'u1');

  const first = await handlers.showList(interaction('t1'), 0);
  assert.equal(first.type, REPLY);
  assert.equal(first.data.flags, 64 | 32768);
  assert.match(allText(first), /A01[\s\S]*A10/);
  assert.doesNotMatch(allText(first), /A11|Ailleurs/);

  const second = await handlers.showList(interaction('t1'), 1, { edit: true });
  assert.equal(second.type, UPDATE);
  assert.match(allText(second), /A11[\s\S]*A12/);
  assert.match(allText(second), /Page 2\/2 · 12 coordonnées/);
});

test('a page past the end shows the last page', async () => {
  await store.addCoordinate('t1', { name: 'Seule', dimension: 'end', x: 0, y: 64, z: 0, note: null }, 'u1');
  const response = await handlers.showList(interaction('t1'), 5, { edit: true });
  assert.match(allText(response), /Seule/);
  assert.match(allText(response), /Page 1\/1/);
});

test('editing: card, prefilled modal, update', async () => {
  const id = await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 1, y: 2, z: 3, note: null }, 'u1');
  const card = await handlers.showCard(interaction('t1'), String(id), 0);
  assert.equal(card.type, UPDATE);
  assert.match(allText(card), /coords_modify:1/);

  const modal = await handlers.openEdit(interaction('t1'), String(id));
  assert.equal(modal.type, MODAL);
  assert.equal(modal.data.custom_id, 'coords_edit_modal:1');
  assert.equal(modal.data.components[1].component.value, '1 2 3');

  const done = await handlers.submitEdit(interaction('t1', submitted({ name: 'base', coordinates: '4 5 6', dimension: 'end' }), 'forum', 'u2'), String(id));
  assert.equal(done.data.content, '✅ Coordonnée **base** modifiée : 🌌 4 5 6');
  assert.deepEqual(store.rows[0], { id, threadId: 't1', name: 'base', dimension: 'end', x: 4, y: 5, z: 6, note: null, createdBy: 'u1', updatedBy: 'u2' });
});

test('renaming to the name of another coordinate is refused', async () => {
  await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const id = await store.addCoordinate('t1', { name: 'Ferme', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const response = await handlers.submitEdit(interaction('t1', submitted({ name: 'base' })), String(id));
  assert.equal(response.data.content, '❌ Une coordonnée « base » existe déjà dans ce monde.');
  assert.equal(store.rows[1].name, 'Ferme');
});

test('deleting asks for confirmation, then deletes', async () => {
  const id = await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const ask = await handlers.askDelete(interaction('t1'), String(id), 3);
  assert.match(allText(ask), /coords_delete_confirm:1:3/);
  assert.equal(store.rows.length, 1);
  const done = await handlers.confirmDelete(interaction('t1'), String(id), 3);
  assert.equal(done.type, UPDATE);
  assert.match(allText(done), /Coordonnée \*\*Base\*\* supprimée/);
  assert.equal(store.rows.length, 0);
});

test("another world's coordinate behaves as missing and is never changed", async () => {
  const id = String(await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 1, y: 2, z: 3, note: null }, 'u1'));
  const fromOtherWorld = interaction('t2', submitted({ name: 'Piratée', coordinates: '9 9 9' }));

  assert.match(allText(await handlers.showCard(fromOtherWorld, id, 0)), /Cette coordonnée n'existe plus/);
  assert.equal((await handlers.openEdit(fromOtherWorld, id)).data.content, ERRORS.missing);
  assert.equal((await handlers.submitEdit(fromOtherWorld, id)).data.content, ERRORS.missing);
  assert.match(allText(await handlers.askDelete(fromOtherWorld, id, 0)), /n'existe plus/);
  assert.match(allText(await handlers.confirmDelete(fromOtherWorld, id, 0)), /n'existe plus/);
  assert.deepEqual(store.rows.map((row) => [row.name, row.x]), [['Base', 1]]);
});

test('a database error gives a polite message', async () => {
  const broken = createCoordinateHandlers({ ...store, countCoordinates: async () => { throw new Error('ECONNREFUSED'); } });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await broken.showList(interaction('t1'), 0);
    assert.equal(response.data.content, ERRORS.unavailable);
  } finally {
    console.error = original;
  }
});
