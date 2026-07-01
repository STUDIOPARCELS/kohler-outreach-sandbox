import { createClient } from "@supabase/supabase-js";

// Use KOHLER_* env vars first (immune to Supabase integration overrides),
// then fall back to standard names
const url = process.env.KOHLER_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.KOHLER_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function buildClient() {
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }
  return createClient(url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// Lazy init: envs are validated at first use, not at import, so `next build`
// succeeds in environments (e.g. fresh Vercel projects) that lack them.
let client: ReturnType<typeof buildClient> | null = null;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof buildClient>, {
  get(_target, prop, receiver) {
    if (!client) client = buildClient();
    return Reflect.get(client, prop, receiver);
  },
});
