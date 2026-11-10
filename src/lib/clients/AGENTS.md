# Clients

- Pennylane readiness rules live only in src/lib/clients/pennylane.ts (mirrored by trigger clients_controle_pennylane); billing edits send changed fields only. The trigger never blocks: invalid values are emptied and kept verbatim in notes, so mail, MCP, merge and import paths cannot fail on them.
