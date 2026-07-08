export const MANDATORY_PART_COLORS = [
  '#4299e1',
  '#ed8936',
  '#48bb78',
  '#f6e05e',
  '#667eea',
];

export const SECONDARY_PART_COLORS = [
  '#9f7aea',
  '#f56565',
  '#38b2ac',
  '#ed64a6',
  '#a0aec0',
];

export const PART_COLOR_PALETTE = [...MANDATORY_PART_COLORS, ...SECONDARY_PART_COLORS];

function normalizeColorKey(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const hueToRgb = (p, q, t) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const r = hueToRgb(p, q, h / 360 + 1 / 3);
  const g = hueToRgb(p, q, h / 360);
  const b = hueToRgb(p, q, h / 360 - 1 / 3);

  const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getPieceColorKey(piece = {}) {
  const rawMark = piece?.mark;
  const normalizedMark = normalizeColorKey(rawMark);
  if (normalizedMark) return normalizedMark;

  const fallbackPos = normalizeColorKey(piece?.pos);
  if (fallbackPos) return fallbackPos;

  const fallbackDwg = normalizeColorKey(piece?.dwgNumber);
  if (fallbackDwg) return fallbackDwg;

  const fallbackMaterial = normalizeColorKey(piece?.material);
  const fallbackLength = piece?.length != null ? String(piece.length) : '';
  if (fallbackMaterial && fallbackLength) return `${fallbackMaterial} ${fallbackLength}`;

  if (piece?.id != null) return String(piece.id);
  return 'UNDEFINED';
}

export function buildPieceColorMap(pieces = []) {
  const colorMap = new Map();
  const keys = new Set();

  pieces.forEach((piece) => {
    const key = getPieceColorKey(piece);
    if (!keys.has(key)) {
      keys.add(key);
    }
  });

  const uniqueKeys = Array.from(keys);
  uniqueKeys.forEach((key, index) => {
    let color = PART_COLOR_PALETTE[index];
    if (!color) {
      const hue = (index * 137.508) % 360;
      color = hslToHex(hue, 58, 48);
    }
    colorMap.set(key, color);
  });

  return colorMap;
}

export function getColorForPiece(piece, colorMap = new Map()) {
  return colorMap.get(getPieceColorKey(piece)) || '#22505F';
}

export function getContrastTextColor(hexColor) {
  const normalized = hexColor.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((ch) => ch + ch).join('')
    : normalized;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? '#1f2937' : '#ffffff';
}
