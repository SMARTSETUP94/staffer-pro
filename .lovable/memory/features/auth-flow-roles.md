---
name: Auth flow différencié par rôle
description: Magic link landing → /auth/set-password obligatoire pour chef/admin, optionnel pour employés. Reset password via Resend custom branded.
type: feature
---

## Pages auth

- `/login` : 3 onglets (Mot de passe / Lien magique / Créer)
- `/auth/set-password` : 1er login après magic link. Chef/admin = obligatoire, employé = bouton skip
- `/auth/forgot-password` : envoie reset via Resend (from onboarding@setup.paris) — réponse générique anti-énumération
- `/auth/reset-password` : détecte event PASSWORD_RECOVERY, formulaire nouveau password

## Tracking password set

- Colonne `profiles.password_set_done` (bool) + `password_set_at` (timestamptz)
- Server fn `markPasswordSet({ skipped })` flag le profile et active le role (invite → actif)
- AuthGuard /_app redirige vers /auth/set-password si chef/admin sans password

## Émission emails

- Lien recovery généré server-side via `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` → ne déclenche PAS d'email Supabase natif
- Envoi via Resend gateway `connector-gateway.lovable.dev/resend/emails`
- Templates dans `src/lib/email-templates/{invitation,password-reset}.ts`

## Module backend

`src/lib/auth-actions.ts` : `markPasswordSet` (avec middleware auth), `sendPasswordReset` (sans auth, public).
