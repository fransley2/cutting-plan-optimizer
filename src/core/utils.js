// Funções puras de apoio. Nada aqui toca DOM — testável isoladamente.

const NUMBER_SPACE = /[\s\u00A0\u2007\u202F]/;
const NUMBER_SPACES = /[\s\u00A0\u2007\u202F]/g;
const NUMBER_SPACE_GROUP = '[\\s\\u00A0\\u2007\\u202F]';

export function parseLocalizedNumber(value) {
  const rawValue = value;
  const invalid = () => ({ rawValue, parsedValue: null, valid: false, detectedFormat: 'unrecognized' });

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { rawValue, parsedValue: value, valid: true, detectedFormat: 'number' }
      : invalid();
  }

  const source = String(value ?? '').trim();
  if (!source) return invalid();

  const match = source.match(/^([+-]?\d(?:[\d.,\s\u00A0\u2007\u202F]*\d)?)\s*(?:[^\d.,\s\u00A0\u2007\u202F].*)?$/u);
  if (!match) return invalid();

  const tokenWithSpaces = match[1].trim();
  if (NUMBER_SPACE.test(tokenWithSpaces)) {
    const groupedSpaces = new RegExp(`^[+-]?\\d{1,3}(?:${NUMBER_SPACE_GROUP}\\d{3})+$`, 'u');
    if (!groupedSpaces.test(tokenWithSpaces)) return invalid();
  }

  const token = tokenWithSpaces.replace(NUMBER_SPACES, '');
  let normalized = token;
  let detectedFormat = 'plain';

  if (token.includes(',') && token.includes('.')) {
    if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
      if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(token)) return invalid();
      normalized = token.replaceAll('.', '').replace(',', '.');
      detectedFormat = 'pt-BR';
    } else {
      if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+$/.test(token)) return invalid();
      normalized = token.replaceAll(',', '');
      detectedFormat = 'en-US';
    }
  } else if (token.includes(',')) {
    if (/^[+-]?\d{1,3}(?:,\d{3})+$/.test(token)) {
      normalized = token.replaceAll(',', '');
      detectedFormat = 'en-US';
    } else if (/^[+-]?\d+,\d+$/.test(token)) {
      normalized = token.replace(',', '.');
      detectedFormat = 'pt-BR';
    } else {
      return invalid();
    }
  } else if (token.includes('.')) {
    if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(token)) {
      normalized = token.replaceAll('.', '');
      detectedFormat = 'pt-BR';
    } else if (!/^[+-]?\d+\.\d+$/.test(token)) {
      return invalid();
    } else {
      detectedFormat = 'en-US';
    }
  } else if (!/^[+-]?\d+$/.test(token)) {
    return invalid();
  }

  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue)
    ? { rawValue, parsedValue, valid: true, detectedFormat }
    : invalid();
}

export const safeToFixed = (num, digits = 0) => {
  const n = parseFloat(num);
  return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
};

export function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map(word => word[0].toUpperCase()).join('');
}
