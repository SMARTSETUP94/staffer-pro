-- P1 (migration séparée : ALTER TYPE ... ADD VALUE ne peut pas être utilisé dans la même transaction)
ALTER TYPE public.devis_redaction_statut ADD VALUE IF NOT EXISTS 'remplace';