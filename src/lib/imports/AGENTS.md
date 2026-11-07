# Import and history rules
- Planning history is derived from the internal non-materialized assignment view; readers, counters and Excel exports share it so corrections are never copied to a second ledger.
- Export history in one authorized database statement; one snapshot prevents corrections between pages from producing an inconsistent workbook.
- Historical Excel text cells stay literal strings and spreadsheet dependencies load only on export.
- History classifies terrain and atelier within the same deduplicated passage; default counters use terrain-only operations/places, while workbook summaries expose both flags without changing the ten assignment columns.- Planning équipes exports carry a hidden _staffing sheet; Excel reimports of that sheet or the exact Planning layout are read deterministically by lirePlanningExcel without AI, so export→import round-trips stay identical and idempotent.
