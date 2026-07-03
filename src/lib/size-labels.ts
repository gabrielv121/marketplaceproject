/** Normalize listing/bid size labels for matching (legacy `US 7` → `US M 7`). */
export function normalizeSizeLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  const legacy = /^US\s+([\d.]+)$/i.exec(trimmed);
  if (legacy) return `US M ${legacy[1]}`;
  const spaced = /^US\s+([MW])\s+([\d.]+)$/i.exec(trimmed);
  if (spaced) return `US ${spaced[1].toUpperCase()} ${spaced[2]}`;
  return trimmed;
}

export function sizeLabelsMatch(a: string, b: string): boolean {
  return normalizeSizeLabel(a) === normalizeSizeLabel(b);
}
