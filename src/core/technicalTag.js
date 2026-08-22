function text(value) {
  return value == null ? '' : String(value).trim();
}

export function normalizeTechnicalTag(value) {
  return text(value).toLocaleUpperCase();
}

export function extractTechnicalTag(value) {
  const source = text(value);
  if (!source) return '';
  return text(source.match(/\bTAG\s*:?\s*([^\r\n,;]+)/i)?.[1]);
}
