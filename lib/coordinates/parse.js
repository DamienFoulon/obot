export const DIMENSIONS = {
  overworld: { label: 'Overworld', emoji: '🌍' },
  nether: { label: 'Nether', emoji: '🔥' },
  end: { label: 'End', emoji: '🌌' },
};

// Y is wider than vanilla (-64 to 320): modded servers can go further
export const LIMITS = { name: 50, note: 200, xz: 30_000_000, y: 2048 };

// "120 64 -340", "120, 64, -340", "120;64;-340", "x:120 y:64 z:-340" -> { x, y, z }, or null
export function parseCoordinates(text) {
  const parts = String(text)
    .replace(/[xyz]\s*[:=]/gi, ' ')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 3 || !parts.every((part) => /^[+-]?\d+$/.test(part))) return null;
  const [x, y, z] = parts.map(Number);
  return { x, y, z };
}

// Values of the add / edit modal -> { value } or { error } (a French message for the member)
export function parseCoordinateForm({ name, coordinates, dimension, note }) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) return { error: 'Le nom est obligatoire.' };
  if (cleanName.length > LIMITS.name) return { error: `Le nom ne doit pas dépasser ${LIMITS.name} caractères.` };

  const cleanNote = String(note ?? '').trim();
  if (cleanNote.length > LIMITS.note) return { error: `La note ne doit pas dépasser ${LIMITS.note} caractères.` };

  const position = parseCoordinates(coordinates ?? '');
  if (!position) return { error: 'Les coordonnées doivent être 3 nombres entiers, par exemple `120 64 -340`.' };
  const { x, y, z } = position;
  if (Math.abs(x) > LIMITS.xz || Math.abs(z) > LIMITS.xz) {
    return { error: `X et Z doivent être entre -${LIMITS.xz} et ${LIMITS.xz}.` };
  }
  if (Math.abs(y) > LIMITS.y) return { error: `Y doit être entre -${LIMITS.y} et ${LIMITS.y}.` };

  // The select sends a list of values
  const chosen = dimension?.[0];
  return {
    value: {
      name: cleanName,
      dimension: Object.hasOwn(DIMENSIONS, chosen ?? '') ? chosen : 'overworld',
      x, y, z,
      note: cleanNote || null,
    },
  };
}
