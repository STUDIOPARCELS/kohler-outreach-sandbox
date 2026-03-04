import { createClient } from "@supabase/supabase-js";

// Use KOHLER_* env vars first (immune to Supabase integration overrides),
// then fall back to standard names
const url = process.env.KOHLER_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.KOHLER_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
}

export const supabaseAdmin = createClient(url, key);
