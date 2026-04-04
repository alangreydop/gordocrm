// Global test setup for the Cloudflare/D1 runtime.
// Tests can override these values when they spin up isolated Workers envs.
process.env['APP_ENV'] = 'test';
process.env['CORS_ORIGIN'] = 'http://localhost:4321';
process.env['SESSION_SECRET'] = 'test-session-secret-12345';
