/** Texte lisible d'une demande issue du formulaire logistique (métadonnées → corps). */
type Inter = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const dateFr = (d: string) => { const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; };

export function estFormulaire(meta: unknown): meta is Record<string, unknown> {
  return !!meta && typeof meta === "object" && (meta as Record<string, unknown>)["origine"] === "formulaire";
}

export function resumeFormulaire(meta: Record<string, unknown>, demandeur?: string | null): string {
  const lignes: string[] = ["Demande envoyée depuis le formulaire logistique."];
  if (demandeur) lignes.push(`Demandeur : ${demandeur}`);
  if (s(meta["opp_projet"])) lignes.push(`Projet : ${meta["opp_projet"]}`);
  const ech = Array.isArray(meta["echeances"]) ? (meta["echeances"] as Inter[]) : [];
  ech.forEach((x, i) => {
    lignes.push("", ech.length > 1 ? `Intervention ${i + 1}` : "Intervention");
    const h = s(x["heure_debut"]);
    const heure = h ? (x["a_partir_de"] ? `à partir de ${h}` : s(x["heure_fin"]) ? `${h} – ${x["heure_fin"]}` : h) : null;
    const champs: [string, unknown][] = [
      ["Type", x["type"]], ["Date", s(x["date"]) ? dateFr(String(x["date"])) : null], ["Heure", heure],
      ["Adresse", x["lieu"]], ["Contact sur place", x["contact_sur_place"]], ["Accès / contraintes", x["acces"]],
      ["Véhicule", x["vehicule"]], ["Nombre de personnes", x["nb_personnes"] != null ? String(x["nb_personnes"]) : null],
      ["Chef d'équipe", x["responsable"]], ["Commentaire", x["commentaire"]],
    ];
    for (const [k, v] of champs) if (s(v)) lignes.push(`${k} : ${v}`);
  });
  const f = Array.isArray(meta["fichiers"]) ? meta["fichiers"].length : 0;
  if (f) lignes.push("", `Pièces jointes : ${f}`);
  return lignes.join("\n");
}
