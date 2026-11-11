# Clients

- Pennylane readiness rules live only in src/lib/clients/pennylane.ts (mirrored by trigger clients_controle_pennylane); billing edits send changed fields only. The trigger never blocks: invalid values are emptied and kept verbatim in notes, so mail, MCP, merge and import paths cannot fail on them.
- Quadra accounting codes live in comptes_auxiliaires and the accountant's notes in import_compta_remarques; numero_compte_client stays reserved for Pennylane 411 accounts, and a billing platform counts like a billing e-mail for Pennylane readiness.
- Client payment defaults are enforced by the column default for automatic creation and shared through pennylane.ts for the editable creation form; omit the field on automatic inserts rather than explicitly sending NULL so the database default applies.
