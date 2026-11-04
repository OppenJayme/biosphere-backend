-- Optional visit request reference number a visitor quotes when a General
-- Inquiry follows up on, changes, or cancels a visit request they already sent.
ALTER TABLE public.inquiry ADD COLUMN visit_reference_code VARCHAR(8);
ALTER TABLE public.inquiry ADD CONSTRAINT inquiry_visit_reference_code_format
  CHECK (visit_reference_code IS NULL OR visit_reference_code ~ '^[0-9A-F]{8}$');
