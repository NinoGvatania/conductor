import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
      _supabase = createClient(url, key);
    }
    return Reflect.get(_supabase, prop);
  },
});
