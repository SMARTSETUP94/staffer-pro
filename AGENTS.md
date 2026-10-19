# Architecture rules

- Opportunity creation reuses ClientCombobox for client selection/creation and a dedicated free-name chantier picker; an existing chantier supplies its title only, never changes its record, and the selected client ID is explicitly attached to the new opportunity.

- Expense report status filtering uses the shared pure filterNotesByStatus helper; totals stay based on all owned reports while only the displayed list is filtered.

- Keep the per-job logistics calendar in a dedicated dialog component using the existing logistics hooks and EtapeDialog; shared reads and edits stay consistent with the main planning.
- Derive occupied calendar dates with the pure calendrierChantier helper; this keeps multi-day coverage and empty-day filtering testable without UI snapshots.
- Keep client email suggestions in a dedicated opt-in reader section and authenticated server function reading the email under RLS; this isolates drafting from logistics and never sends email automatically.
- New client email drafting uses server-only Responses SDK helpers and shared output validation; this keeps credentials private and the generated result consistent between server and UI.
- Legal client prefill uses a dedicated review dialog and the existing authenticated enrichment function; preserve the stored SIRET and derive its SIREN to avoid losing establishment information.
- Store the legal company leader in the clients record and share its reviewed enrichment across both client editors; this keeps legal identity separate from contact records.- Expense reports (notes_de_frais) keep status transitions and authorship in the DB guard trigger; the UI never sets validator fields, so the audit trail cannot be bypassed.
