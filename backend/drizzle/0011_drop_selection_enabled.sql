-- selection_enabled was a legacy mirror of modules.ordering.enabled (added in
-- 0007, folded into the JSON modules column in 0010). It is now the single
-- source of truth, so the column is redundant.
ALTER TABLE settings DROP COLUMN selection_enabled;
