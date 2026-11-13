# Logistics library rules

- Extraction post-processing (hours, duration, year from receipt, known places via lieux_alias, atelier steps unchecked unless mentioned) lives in pure helpers (extraction-regles.ts, suggestions-email.ts) applied at ingestion and on display, so old and new mails follow the same rules.
- Queue triage is the pure rule set tri-file.ts, applied only by admin-confirmed batches whose counts must match the shown summary; mails are dismissed with motif_classement, never deleted.
