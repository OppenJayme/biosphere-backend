/**
 * Automated suites must never call a real AI provider, whatever a developer's
 * local .env contains. Values already in process.env take precedence over
 * .env when ConfigModule loads it, so these keep the optional FAQ AI layer
 * off. AI behavior is covered by unit tests with a mocked provider.
 */
process.env.CHATBOT_AI_ENABLED = 'false';
process.env.GEMINI_API_KEY = '';
