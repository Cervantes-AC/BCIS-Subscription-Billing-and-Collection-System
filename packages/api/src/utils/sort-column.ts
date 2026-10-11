/** Select a sortable Drizzle column from an explicit allow-list. */
export function sortColumn<T extends Record<string, object>>(
  columns: T,
  requested: string | undefined,
  fallback: keyof T,
): T[keyof T] {
  if (requested && Object.prototype.hasOwnProperty.call(columns, requested)) {
    return columns[requested as keyof T];
  }
  return columns[fallback];
}
