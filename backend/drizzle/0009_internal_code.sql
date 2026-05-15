-- Add internal article code to menu entries (optional, kitchen/POS use)
ALTER TABLE menu_entries ADD COLUMN internal_code TEXT;
