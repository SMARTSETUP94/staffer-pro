# Import and history rules
- Planning history is derived from the internal non-materialized assignment view; readers, counters and Excel exports share it so corrections are never copied to a second ledger.
- Export history in one authorized database statement; one snapshot prevents corrections between pages from producing an inconsistent workbook.
- Historical Excel text cells stay literal strings and spreadsheet dependencies load only on export.