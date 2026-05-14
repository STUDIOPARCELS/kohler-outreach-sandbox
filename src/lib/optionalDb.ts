export interface OptionalDbError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

export function isMissingTableError(error: OptionalDbError | null | undefined, tableName: string): boolean {
  const text = [error?.code, error?.message, error?.details].filter(Boolean).join(" ").toLowerCase();
  const table = tableName.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("could not find the table") ||
    text.includes(`relation "public.${table}" does not exist`) ||
    text.includes(`relation "${table}" does not exist`)
  );
}

export function optionalDbErrorMessage(error: OptionalDbError | null | undefined): string {
  return error?.message || error?.details || error?.code || "unknown database error";
}
