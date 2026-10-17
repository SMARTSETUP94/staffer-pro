# Architecture rules

- Keep the per-job logistics calendar in a dedicated dialog component using the existing logistics hooks and EtapeDialog; shared reads and edits stay consistent with the main planning.
- Derive occupied calendar dates with the pure calendrierChantier helper; this keeps multi-day coverage and empty-day filtering testable without UI snapshots.
- Keep client email suggestions in a dedicated opt-in reader section and authenticated server function reading the email under RLS; this isolates drafting from logistics and never sends email automatically.
- New client email drafting uses server-only Responses SDK helpers and shared output validation; this keeps credentials private and the generated result consistent between server and UI.
- Legal client prefill uses a dedicated review dialog and the existing authenticated enrichment function; preserve the stored SIRET and derive its SIREN to avoid losing establishment information.