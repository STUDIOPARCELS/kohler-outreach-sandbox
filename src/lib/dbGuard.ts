/**
 * supabase-js never throws on failed queries — every mutation resolves to
 * `{ error }`, which is trivially (and historically, systemically) discarded.
 * These helpers make writes loud.
 */

interface DbResult {
  error: { message: string } | null;
}

/**
 * Throw when a write failed. Use for mutations where failing the request is
 * safe (nothing irreversible has happened yet) — the route's error handling
 * turns the throw into a 500 instead of silently pretending success.
 */
export function mustWrite<T extends DbResult>(label: string, result: T): T {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

/**
 * Log and return a warning string when a write failed. Use for mutations that
 * run AFTER an irreversible external action (e.g. an SMTP send): the response
 * must stay 2xx so the caller doesn't retry the external action, but the
 * failed bookkeeping must be surfaced — include the returned warning in a
 * `warnings` array on the response.
 */
export function warnWrite(label: string, result: DbResult): string | null {
  if (!result.error) return null;
  const warning = `${label}: ${result.error.message}`;
  console.error(`[write-failed] ${warning}`);
  return warning;
}
