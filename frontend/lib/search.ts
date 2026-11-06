export {
  normalizeSearchText as normalizeSearch,
  matchesSearchText as matchesSearch,
} from "../../backend/src/common/catalog-search-terms";

export function selectedLookupRecord<T extends { id: string }>(
  options: readonly T[],
  selectedId: string,
  selectedDetails?: T | null,
): T | null {
  if (!selectedId) return null;
  if (selectedDetails?.id === selectedId) return selectedDetails;
  return options.find((option) => option.id === selectedId) ?? null;
}
