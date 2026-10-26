# Architecture rules

- Opportunity signing validates the manually entered code independently of declared typology and always calls the explicit-code RPC overload; optional suggestions never overwrite typed input.

- Tableur autosave queues are keyed by persisted row and edited field, flushing the pending value rather than a rendered row; this prevents adjacent edits from discarding typology changes. Final typology selections are saved immediately.

- Inbox imports deduplicate with a unique nullable internet_message_id and fail closed on lookup errors; exact historical identity matching fills missing stable IDs, while full read-only Inbox pagination prevents restored mail from starving later imports.

- Opportunity details live in the shared affair layout through one reusable fiche component; legacy opportunity URLs redirect to that tab and email filing defaults to the same affair ID, preventing separate records or divergent copies.

- Global and per-affair document views share affaire_documents and private affaires-photos storage; email attachment filing uses an authenticated server function under user RLS and a unique source reference to prevent duplicates.

- Opportunity numbering is allocated atomically by create_opportunite; UI codes are previews, historical code_opportunite values count as used, and creation surfaces read back the allocated numero to avoid stale numbers.

- Opportunity creation reuses ClientCombobox for client selection/creation and a dedicated free-name chantier picker; an existing chantier supplies its title only, never changes its record, and the selected client ID is explicitly attached to the new opportunity.

- Expense report status filtering uses the shared pure filterNotesByStatus helper; totals stay based on all owned reports while only the displayed list is filtered.

- Keep the per-job logistics calendar in a dedicated dialog component using the existing logistics hooks and EtapeDialog; shared reads and edits stay consistent with the main planning.
- Derive occupied calendar dates with the pure calendrierChantier helper; this keeps multi-day coverage and empty-day filtering testable without UI snapshots.
- Keep client email suggestions in a dedicated opt-in reader section and authenticated server function reading the email under RLS; this isolates drafting from logistics and never sends email automatically.
- New client email drafting uses server-only Responses SDK helpers and shared output validation; this keeps credentials private and the generated result consistent between server and UI.
- Legal client prefill uses a dedicated review dialog and the existing authenticated enrichment function; preserve the stored SIRET and derive its SIREN to avoid losing establishment information.
- Store the legal company leader in the clients record and share its reviewed enrichment across both client editors; this keeps legal identity separate from contact records.- Expense reports (notes_de_frais) keep status transitions and authorship in the DB guard trigger; the UI never sets validator fields, so the audit trail cannot be bypassed.
