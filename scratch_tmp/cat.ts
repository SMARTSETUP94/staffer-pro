import { createClient } from "@supabase/supabase-js";
import { categoriserBoite } from "@/lib/devis/images-ia.server";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN}` } } });
console.log(JSON.stringify(await categoriserBoite(db, "39155994-5b07-4585-93b0-20aec0ce2686")));
