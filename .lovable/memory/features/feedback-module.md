---
name: feedback-module
description: Module signalement in-app v0.14 — bouton flottant chefs/admins, capture html-to-image, page admin, email Resend
type: feature
---

# Module Feedback (v0.14)

## Pourquoi
Centraliser les retours des 5 chefs d'équipe interrogés cette semaine, sans
passer par WhatsApp / email perso. Tracking statut + priorité + capture d'écran.

## Architecture

### Front
- `src/components/feedback/FeedbackButton.tsx` : bouton flottant (`fixed bottom-6 right-6`),
  monté globalement dans `AppLayout`. N'apparaît QUE pour `isAdminOrChef` (RLS empêche aussi côté DB).
- Capture via `html-to-image` (`toPng`), filtre les éléments `data-feedback-skip="true"`
  et les `[role="dialog"]` pour ne pas capturer le modal lui-même.
- Page admin : `src/routes/_app.admin.feedback.tsx` — accès `isAdmin` uniquement,
  redirige vers `/dashboard` sinon.

### Backend
- Table `feedbacks` : enums `feedback_type` (bug/idee/amelioration/question),
  `feedback_priorite` (basse/moyenne/haute/critique), `feedback_statut` (nouveau/en_cours/resolu/ferme/rejete).
- Bucket privé `feedback-screenshots`, paths `{user_id}/{timestamp}-{rand}.png`,
  RLS scopée auth.uid().
- Trigger `notify_feedback_created` : crée une notification in-app pour chaque admin actif.
- Trigger `guard_feedback_resolution` : auto-fill resolved_at/resolved_by sur statut terminal.

### Email Resend (post-insert)
- Edge function `notify-feedback-email` (verify_jwt = false, idempotente — récupère
  les données via service-role à partir de `feedback_id`).
- Appelée côté client après insert réussi (best-effort, non bloquant).
- Template HTML inline branded indigo `#2A2A8C` / cream `#F7F4EF`.
- From : `signalement@notify.setup.paris` (fallback `onboarding@resend.dev` si domaine non vérifié).
- Reply-to : email de l'auteur du signalement.
- To : tous les profils admins actifs.
