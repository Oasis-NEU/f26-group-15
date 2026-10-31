import { createClient } from "@supabase/supabase-js";

const supabase_url = import.meta.env.VITE_PUBLIC_SUPABASE_URL
const supabase_public_key =  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabase_url, supabase_public_key)