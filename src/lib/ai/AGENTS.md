# AI library rules

- All AI calls go through fournisseur.server.ts (appelerIAJson / appelerIAZod): model per usage in MODELES_PAR_USAGE, Claude via native Messages, Gemini fallback only on 429/5xx/invalid output, one ia_appels row per call without content; model choice and costs stay in one place.
