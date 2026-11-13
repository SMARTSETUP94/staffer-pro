import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("affaire_documents").select("storage_path").not("document_parent_id","is",null).limit(30);
const s = (await db.storage.from("affaires-photos").createSignedUrls(data!.map(d=>d.storage_path), 600)).data!;
async function essai(n: number, schemaInt: boolean) {
  const content: any[] = [{ type: "text", text: "Décris" }, ...s.slice(0, n).map(x => ({ type: "image_url", image_url: { url: x.signedUrl } }))];
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content }], tools: [{ type: "function", function: { name: "p", parameters: { type: "object", properties: { c: schemaInt ? { type: "integer", minimum: 0, maximum: 100 } : { type: "number" } }, required: ["c"] } } }], tool_choice: { type: "function", function: { name: "p" } } }) });
  console.log(n, schemaInt, r.status, (await r.text()).slice(0, 150));
}
await essai(2, true); await essai(2, false); await essai(30, false);
