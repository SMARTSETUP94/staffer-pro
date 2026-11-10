# Architecture rules

- Data quality uses an authenticated admin-only paginated reader with explicit safe fields and existing quality RPCs for confirmed writes; the admin home shares its query and pure anomaly helpers so counters match without exposing remuneration.

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

- Expense report status filtering uses pure filterNotesByStatus; totals use all owned reports.

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
- Quote-to-pipeline effects go through the internal non-callable devis_opp_avancer helper (never downgrades, ordering a_faire < a_l_etude < envoye < presque_gagne); gagne/perdu stay human app actions, lost opportunities refuse open quotes by trigger, so pipeline automation stays predictable and MCP cannot close deals.
- Quote totals expose total_ht, remise and net_ht from devis_calculer_interne; net HT is the single billed amount used for frozen montant_ht, pipeline CA and margin, so remises never drift between screens.
- Without devis.couts, devis_lire strips purchase price and coefficient from materials and free lines but returns server-computed prix_vente_unitaire/prix_vente; the local calculator falls back to that sale price so totals stay identical.
- Staffing quotes are deleted only logically (devis.supprime_le) through devis_supprimer, and every reader excludes them via devis_peut_lire; versions keep counting deleted rows so numbers are never reused, and only admins restore within 30 days.
- Quote margins are always computed from known costs: devis_calculer_interne returns a main-d'œuvre/matériaux/autres cost–sale breakdown plus missing-cost list (mirrored by calcul.ts), frozen at validation in devis_snapshot_couts.detail; cost fields and cout_* parameters are stripped for callers without devis.couts.
- MCP quote drafting goes only through devis_mcp_appliquer (six whitelisted draft tools, mode autonomie/conversation, human-edit lock, devis_mcp_journal); files are uploaded by the server tool and only their storage path reaches the database, so validation, sending, signing and settings stay human-only.
- MCP quote corrections reuse devis_remplir (modifications / suppressions with per-target field allow-lists, soft deletes restorable from the editor trash); in autonomie they require a Claude-created, untouched draft, so Claude never silently rewrites human work.
- Client quote PDFs are built only from devis_lire_client (pure pdf-client.ts, shared by app and MCP) and stored in private devis-exports with devis_exports history, so internal costs never reach clients.
- Quote issuer details and payment terms come from parametres_entreprise through devis_lire_client; optional chantier/signataire fields are human-authored through devis_entete_modifier, never inferred from technical authors, to preserve existing quotes.

- Subdirectories may have their own AGENTS.md (e.g. src/lib/devis); read it before changing files there.- Pipeline indicators come from the single invoker RPC pipeline_indicateurs (affaires RLS + devis_peut_lire/devis_calculer): one latest quote per active 9XXX opportunity (estimate only without a quote or at 0 €, kept separate) plus every open (not signed/refused) last-version quote of 6XXX sites returned separately as supplements; probabilities are dated devis_parametres proba_*; the UI only sums its rows.
- Pipeline opportunity filters are applied through the pure passeFiltres helper (src/lib/pipeline-filtres.ts) and edited in a single Filtres sheet; preferences persist per user in localStorage so tiles, column totals and cards stay filtered consistently.
- /dispos calls only dispos_public_* definer RPCs; tables stay RLS-only.
- Logistics date changes move linked non-imported assignments transactionally through a table trigger; invalid shortened periods fail atomically, covering UI and RPC paths without copying historical rows.
- Weekly planning imports use reviewed document extraction and a transactional, chantier-locked RPC over existing logistics stages and assignments; provenance stays on assignments so renamed files cannot create duplicate interventions or overwrite human corrections.
- Weekly planning filters and Excel block rows use pure client helpers over the authorized weekly reader; exports load spreadsheet code lazily and prepare a Blob before the download click to preserve mobile user activation.
- Forwarded client requests use one pure Outlook header resolver across ingestion, reanalysis and backfill; receipt mailbox defines source, original receipt time and transfer headers are preserved, and historical smart rows require mailbox identity proof before reclassification.
- smart@ is no longer polled (cron removed, route returns 410); Demandes clients reads devis@ only, and unproven pending smart@ requests are soft-dismissed by the pure doitEcarterSmart rule so nothing is deleted.
- The logistics planning is one page (/logistique) with Étapes, Équipes, Personnes and a read-only chef tab; /logistique/equipes only redirects there. Alerts, qualified needs, WhatsApp texts, team copy and filters are pure helpers in src/lib/logistique/planning-semaine.ts so every view and the tests share one rule set.
- Logistics form requests: emails_entrants rows via token-gated service-role RPCs; poller never creates steps.

- Atelier people use pole-scoped assignations and guarded RPCs; the shared safe reader and working-day helpers drive both views, leaving quote capacity and logistics totals unchanged.
