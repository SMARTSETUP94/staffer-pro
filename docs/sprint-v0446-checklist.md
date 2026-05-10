# Sprint v0.44.6 — Clôture audit v0.43-v0.44

**Date** : 10 mai 2026
**Effort réel** : ~1h
**Statut** : ✅ LIVRÉ

Dernier sprint correctif post-audit `docs/audit-v0.43-v0.44.md`. Traite le bloc 🟡 (basse criticité) restant après v0.44.3 → v0.44.5.

---

## ✅ Livré

### 1. Convention migrations RLS (doc)
- `DROP POLICY IF EXISTS … ; CREATE POLICY …` doit précéder toute création de policy (idempotence re-run).
- Consigné dans `docs/adr/004-migrations-policy-idempotence.md`.

### 2. `docs/db-schema.md` — index DB centralisé
- Liste lisible des 60+ tables groupées par domaine (auth/rh/affaires/devis/staffing/atelier/contrats/audit).
- Source de vérité humaine ; `types.ts` reste la source machine.

### 3. Audit TTL signed URLs
| Bucket | TTL actuel | Verdict |
|---|---|---|
| `affaires-photos` | 1h (`SIGN_TTL_SEC`) | ✅ OK |
| `fabrication-photos` | 1h | ✅ OK |
| `affaire-attachments` (journal) | 60s | ✅ OK très court |
| `feedback` screenshots | 1h | ✅ OK |
| `avatars` | 1 an | 🟡 Accepté (équivalent public, low-risk) |
| `contrats-intermittents` | **1 an** | 🟠 Dette — à refactorer en signed-on-demand |

**Décision** : URL contrats stockée en DB → réduire TTL casserait les anciens contrats. Refactor à prévoir : ne plus stocker `pdf_url` mais regénérer signed URL à la demande (TTL ≤ 5min) côté page contrat. Tâche v0.46 ou v0.47.

### 4. États vides — vérifiés (faux positifs audit)
- `mobile.chef.atelier.tsx:177,287` — "Aucun objet en cours" + "Aucun objet sur vos chantiers actifs" ✅
- `mobile.chef.dashboard.tsx:240` — "Aucune affaire active où vous êtes chef" ✅
- Galerie photos vide — gérée par `AffaireDocumentsGallery` empty state ✅

Aucune action nécessaire.

---

## 🟡 Reporté (faible ROI court terme)

- **A11Y axe-core** sur `/mobile/chef/atelier` + modale signature — à intégrer dans batterie E2E v0.34.x.
- **Lighthouse mobile 4G** — nécessite environnement CI mobile, à planifier hors sprint dev.
- **E2E camera upload réel** — caméra mockée acceptable, real-device test à faire en QA terrain.
- **Refactor TTL contrats → signed-on-demand** — voir §3 ci-dessus.

---

## Audit v0.43-v0.44 — Statut final

| Bloc | Statut |
|---|---|
| 🔴 Top #1 Finalisation v0.45 | ✅ v0.44.3 (socle UI + E2E stub) |
| 🟠 Top #2 Triggers business | ✅ v0.44.3 |
| 🟠 Top #3 Audit trail soft-delete | ✅ v0.44.3 |
| 🟡 Top #4 Perf galerie | ✅ v0.44.4 |
| 🟡 Top #5 ADR + dead code | ✅ v0.44.4 |
| 🟠 Bloc moyen (mapper erreurs + RLS soft-delete + signed_at) | ✅ v0.44.5 |
| 🟡 Bloc bas (doc + TTL audit + états vides) | ✅ v0.44.6 |

**Audit clôturé.** Reprise roadmap v0.45 RLS hardening DB possible.
