import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("affaire_documents").select("storage_path").not("document_parent_id","is",null).limit(30);
const s = (await db.storage.from("affaires-photos").createSignedUrls(data!.map(d=>d.storage_path), 600)).data!;
const item = (x: any) => ({ type: "object", additionalProperties: false, required: ["ligne_id","document_id","confiance","justification","legende"], properties: { ligne_id: { type: "string" }, document_id: { type: "string" }, confiance: { type: "integer", minimum: 0, maximum: 100 }, justification: { type: "string", maxLength: 160 }, legende: { type: "string", maxLength: 80 }, ...x } });
async function essai(lbl: string, params: any, n = 30, sys = true) {
  const content: any[] = [{ type: "text", text: "Place les images" }];
  s.slice(0, n).forEach((x, i) => { content.push({ type: "text", text: `Image ${i}` }); content.push({ type: "image_url", image_url: { url: x.signedUrl } }); });
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [...(sys ? [{ role: "system", content: "données" }] : []), { role: "user", content }], tools: [{ type: "function", function: { name: "propositions", parameters: params } }], tool_choice: { type: "function", function: { name: "propositions" } } }) });
  console.log(lbl, r.status, (await r.text()).slice(0, 120));
}
const full = { type: "object", additionalProperties: false, required: ["propositions"], properties: { propositions: { type: "array", maxItems: 300, items: item({}) } } };
await essai("full30", full);
await essai("full2", full, 2);
await essai("full30-nomax", { type: "object", required: ["propositions"], properties: { propositions: { type: "array", items: item({}) } } });
