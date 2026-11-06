export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/** Search vocabulary only. Never assigns technical families or contracted work. */
export function catalogSearchTerms(value: string): string[][] {
  const aliases: Record<string, string[]> = {
    oleo: ['óleo', 'oleo', 'lubrificante'],
    oleos: ['óleo', 'oleo', 'lubrificante'],
    filtro: ['filtro', 'filter'],
    filtros: ['filtro', 'filter'],
    filter: ['filtro', 'filter'],
    bateria: ['bateria', 'battery'],
    baterias: ['bateria', 'battery'],
    battery: ['bateria', 'battery'],
    mangueiras: ['mangueira'],
    abracadeiras: ['abraçadeira', 'abracadeira'],
  };
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => [
      ...new Set([
        term,
        normalizeSearchText(term),
        ...(aliases[normalizeSearchText(term)] || []),
      ]),
    ]);
}

export function matchesSearchText(haystack: string, query: string) {
  const text = normalizeSearchText(haystack);
  return catalogSearchTerms(query).every((variants) =>
    variants.some((term) => text.includes(normalizeSearchText(term))),
  );
}
