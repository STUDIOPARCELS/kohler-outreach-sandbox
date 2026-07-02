/**
 * PostgREST caps un-ranged selects at 1000 rows, silently truncating anything
 * larger. Page with .range() until a short page comes back. The page builder
 * must apply a deterministic .order() (e.g. by id) or pages can overlap.
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  label?: string
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await fetchPage(start, start + pageSize - 1);
    if (error) throw new Error(label ? `${label}: ${error.message}` : error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
