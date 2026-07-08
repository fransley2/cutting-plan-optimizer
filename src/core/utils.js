// Funções puras de apoio. Nada aqui toca DOM — testável isoladamente.

export const safeParseFloat = (val, fallback = 0) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
};

export const safeParseInt = (val, fallback = 0) => {
  const n = parseInt(val, 10);
  return Number.isInteger(n) ? n : fallback;
};

export const safeToFixed = (num, digits = 0) => {
  const n = parseFloat(num);
  return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
};

// Nativo: crypto.randomUUID() substitui o hack manual do arquivo original.
export const generateId = () => crypto.randomUUID();

export function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map(word => word[0].toUpperCase()).join('');
}
