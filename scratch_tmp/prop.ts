import { createClient } from "@supabase/supabase-js";
import { proposerPhotos } from "@/lib/devis/images-ia.server";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN}` } } });
const D = (await Bun.file("/tmp/devis_essai").text()).trim();
try { const r = await proposerPhotos(db, "afcb9389-edb4-4ce0-b82c-e302a0aff71a", D, "app"); console.log(JSON.stringify(r).slice(0, 3000)); } catch (e) { console.log("ERR", (e as Error).message); }
