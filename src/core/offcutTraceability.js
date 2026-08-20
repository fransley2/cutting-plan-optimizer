function text(value) {
  return value == null ? '' : String(value).trim();
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

export function createOffcutTraceability(parentTrace, index, options = {}) {
  const prefix = text(options.tracePrefix || parentTrace) || 'TRACE';
  const suffix = text(options.traceSuffix) || 'OC';
  const separator = options.traceSeparator == null ? '-' : String(options.traceSeparator);
  const padSize = positiveInteger(options.tracePadSize, 3);
  const sequence = positiveInteger(index, 1);
  return [prefix, suffix, String(sequence).padStart(padSize, '0')].filter(Boolean).join(separator);
}
