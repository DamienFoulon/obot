import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCoordinateForm, parseCoordinates } from '../../lib/coordinates/parse.js';

test('the accepted coordinate formats', () => {
  const expected = { x: 120, y: 64, z: -340 };
  assert.deepEqual(parseCoordinates('120 64 -340'), expected);
  assert.deepEqual(parseCoordinates('120, 64, -340'), expected);
  assert.deepEqual(parseCoordinates('120;64;-340'), expected);
  assert.deepEqual(parseCoordinates('x:120 y:64 z:-340'), expected);
  assert.deepEqual(parseCoordinates('X: 120 Y: 64 Z: -340'), expected);
  assert.deepEqual(parseCoordinates('  120\t 64   -340 '), expected);
  assert.deepEqual(parseCoordinates('-120, +64 ,-340'), { x: -120, y: 64, z: -340 });
});

test('the refused coordinates', () => {
  assert.equal(parseCoordinates('120 64'), null);
  assert.equal(parseCoordinates('120 64 -340 12'), null);
  assert.equal(parseCoordinates('120 abc -340'), null);
  assert.equal(parseCoordinates('120.5 64 -340'), null);
  assert.equal(parseCoordinates(''), null);
});

const form = (values) => parseCoordinateForm({ name: 'Base', coordinates: '120 64 -340', dimension: ['nether'], note: '', ...values });

test('a valid form', () => {
  assert.deepEqual(form({ name: '  Base principale ', note: ' ferme à fer ' }).value, {
    name: 'Base principale', dimension: 'nether', x: 120, y: 64, z: -340, note: 'ferme à fer',
  });
  assert.equal(form({ note: '   ' }).value.note, null);
  assert.equal(form({ dimension: undefined }).value.dimension, 'overworld');
  assert.equal(form({ dimension: ['moon'] }).value.dimension, 'overworld');
  assert.equal(form({ dimension: ['toString'] }).value.dimension, 'overworld');
});

test('the form errors, in French', () => {
  assert.equal(form({ name: '  ' }).error, 'Le nom est obligatoire.');
  assert.equal(form({ name: 'x'.repeat(51) }).error, 'Le nom ne doit pas dépasser 50 caractères.');
  assert.equal(form({ note: 'x'.repeat(201) }).error, 'La note ne doit pas dépasser 200 caractères.');
  assert.equal(form({ coordinates: '1 2' }).error, 'Les coordonnées doivent être 3 nombres entiers, par exemple `120 64 -340`.');
  assert.equal(form({ coordinates: '30000001 64 0' }).error, 'X et Z doivent être entre -30000000 et 30000000.');
  assert.equal(form({ coordinates: '0 64 -30000001' }).error, 'X et Z doivent être entre -30000000 et 30000000.');
  assert.equal(form({ coordinates: '0 2049 0' }).error, 'Y doit être entre -2048 et 2048.');
  assert.ok(form({ coordinates: '30000000 -2048 -30000000' }).value);
});
