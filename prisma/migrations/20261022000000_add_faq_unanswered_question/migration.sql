-- Public FAQ assistant questions that received no approved answer, kept for
-- curator review (client proposal §7). Rows older than 90 days are pruned by
-- the application; no visitor identity or IP address is stored.
CREATE TABLE "faq_unanswered_question" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" VARCHAR(500) NOT NULL,
    "normalized_question" VARCHAR(500) NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "asked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "faq_entry_id" UUID,

    CONSTRAINT "faq_unanswered_question_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_faq_unanswered_question_asked_at"
ON "faq_unanswered_question"("asked_at");

CREATE INDEX "idx_faq_unanswered_question_normalized"
ON "faq_unanswered_question"("normalized_question");

ALTER TABLE "faq_unanswered_question"
ADD CONSTRAINT "faq_unanswered_question_reviewed_by_fkey"
FOREIGN KEY ("reviewed_by") REFERENCES "user_account"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "faq_unanswered_question"
ADD CONSTRAINT "faq_unanswered_question_faq_entry_id_fkey"
FOREIGN KEY ("faq_entry_id") REFERENCES "faq_entry"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "faq_unanswered_question" ENABLE ROW LEVEL SECURITY;
