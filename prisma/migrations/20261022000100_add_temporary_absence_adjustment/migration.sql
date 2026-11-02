-- A temporary absence (for example a loan or off-site conservation) reduces
-- active quantity without implying the specimen left the collection for good
-- (client proposal §2). The specimen keeps its record and accession number.
ALTER TYPE "quantity_adjustment_type" ADD VALUE IF NOT EXISTS 'TEMPORARY_ABSENCE' BEFORE 'DATA_CORRECTION';
