import { createClient } from "@supabase/supabase-js";

// Server-only: uses the secret key, which bypasses RLS on private buckets.
const supabase = createClient(`${process.env.SUPABASE_URL}`, `${process.env.SUPABASE_SECRET_KEY}`, {
    auth: { persistSession: false },
});

export { supabase };
