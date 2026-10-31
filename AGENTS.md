# Architecture rules

- MCP uses the official Lovable SDK and managed OAuth, with per-request local consent/revocation, capabilities and caller-scoped database clients; no business tool may use an admin client. Provider-owned OAuth endpoints are advertised through discovery rather than reimplemented.
- MCP readers select explicit safe fields and paginate deterministically; non-global scopes fail closed until a scoped reader exists, and materialized aggregate views are never exposed to scoped users.
- MCP technical audit fails closed, excludes free-text arguments and keeps business reads separate from connection administration; admin-only server functions may use provider admin APIs after verifying roles.
- MCP throttling runs in request middleware before SDK dispatch; a caller-verified database RPC serializes each user's rolling quota and refusal audit together, so multiple Worker instances and OAuth clients cannot bypass it. Keep generated SDK routes unchanged.
- MCP writes use database-locked, target/snapshot-bound confirmations and caller/client-namespaced idempotency keys with request hashes; global-scope business dispatch runs as a validated NOLOGIN NOBYPASSRLS role inheriting authenticated grants, calling shared invoker RPCs, never an admin business client. Historical atomic opportunity creation retains its explicit SECURITY DEFINER authorization.
- Shared affair, opportunity action and logistics RPCs enforce explicit field allow-lists and caller affair access; logistics moves preserve duration, while cancellation remains a soft status change.
- Security migrations must explicitly redefine each affected RPC from its freshly read current definition; never rewrite function bodies dynamically with regexp_replace or replace on pg_get_functiondef, because critical business RPCs must remain reviewable.
- All protected server functions retain bearer attachment in src/start.ts so ordinary signed-in requests preserve the caller's RLS.

- affaire_roles (employee-based, one holder per role) is the single source of project-team roles; legacy charge_affaires_id/chef_projet_id/dessinateur_id stay synchronized both ways by depth-guarded triggers so older readers and Claude keep working. Writes go through app_affecter_role_projet; workload counts come from the SECURITY DEFINER charge_roles_projet so every user sees identical totals.

- The chantier list derives code conversion labels, chronology and opportunity filtering from persisted code_opportunite through a shared pure helper; signing never changes the original list position.

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
- Legacy SECURITY DEFINER business RPCs start with mcp_assert_legacy_oauth_write and MCP previews check rights via mcp_preview_assert_affaire; OAuth tokens can only write inside the transaction-scoped dispatch context opened by mcp_execute_write_locked, so confirmations cannot be bypassed.
- Project-team writes on affaire_roles are authorized by user_can_write_affaire, which mirrors app_assert_affaire_write scope rules; keeping one scope rule avoids RLS rejecting writes the guard already allowed.
- Opportunity status `a_l_etude` (with `affaires.date_visite_technique`) is whitelisted in BOTH app_modifier_affaire and mcp_dispatch_write; any new status or commercial field must be added to both explicit allow-lists, keeping gagne/perdu reserved to the app for MCP.
- Staffing-authored quotes (devis.redige_dans_staffing) are written only through devis_* SECURITY DEFINER RPCs that set the transaction flag app.devis_rpc; a trigger rejects direct writes, so locking, versioning and audit cannot be bypassed. Legacy ProGBat imports keep devis.statut and devis_postes untouched.
- Quote totals come from the single SQL function devis_calculer_interne, mirrored by the pure helper src/lib/devis/calcul.ts for instant UI recalculation; tests keep both in agreement.
- Purchase prices, cost rates and margins are never selected directly: catalogue and quote-line tables have RLS with no policies, Staffing quote rows are readable only through devis_peut_lire (a restrictive policy), frozen cost/margin live in devis_snapshot_couts (no policies), and RPC readers null cost fields without devis.couts.
- Supplier catalogue imports stage rows in chunks, show a price-change summary, then deactivate (never delete) the supplier's previous rows; quote lines copy prices at insertion so catalogue updates never alter existing quotes.
