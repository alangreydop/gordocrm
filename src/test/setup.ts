// Global test setup
// Set minimal required env vars so config doesn't throw during tests
process.env['NODE_ENV'] = 'test';
process.env['STRIPE_SECRET_KEY'] = 'sk_test_placeholder';
process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_placeholder';
process.env['FAL_KEY'] = 'test_fal_key';
process.env['OPENAI_API_KEY'] = 'sk-test';
process.env['R2_ACCOUNT_ID'] = 'test';
process.env['R2_ACCESS_KEY_ID'] = 'test';
process.env['R2_SECRET_ACCESS_KEY'] = 'test';
process.env['R2_BUCKET_NAME'] = 'test-bucket';
process.env['AIRTABLE_API_KEY'] = 'test';
process.env['AIRTABLE_BASE_ID'] = 'test';
process.env['RESEND_API_KEY'] = 're_test';
