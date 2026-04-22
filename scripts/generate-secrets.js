#!/usr/bin/env node

/**
 * Security Setup Script
 *
 * Genera secrets cryptográficamente seguros para el CRM
 * Ejecutar: node scripts/generate-secrets.js
 *
 * Luego configurar con:
 *   npx wrangler secret put SESSION_SECRET --env production
 *   npx wrangler secret put CRON_SECRET --env production
 *   npx wrangler secret put WEBHOOK_SECRET --env production
 *   npx wrangler secret put AI_ENGINE_JWT_SECRET --env production
 */

function generateSecret(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

console.log('=== Grande & Gordo CRM - Security Setup ===\n');

const sessionSecret = generateSecret(32);
const cronSecret = generateSecret(16);
const webhookSecret = generateSecret(32);
const aiEngineJwtSecret = generateSecret(32);

console.log('Secrets generados (NO commitear estos valores):\n');

console.log('┌─────────────────────────────────────────────────────────────┐');
console.log('│ SESSION_SECRET (32 bytes = 64 caracteres hex)              │');
console.log('│', sessionSecret, '│');
console.log('└─────────────────────────────────────────────────────────────┘\n');

console.log('┌─────────────────────────────────────────────────────────────┐');
console.log('│ CRON_SECRET (16 bytes = 32 caracteres hex)                 │');
console.log('│', cronSecret, '│');
console.log('└─────────────────────────────────────────────────────────────┘\n');

console.log('┌─────────────────────────────────────────────────────────────┐');
console.log('│ WEBHOOK_SECRET (32 bytes = 64 caracteres hex)              │');
console.log('│', webhookSecret, '│');
console.log('└─────────────────────────────────────────────────────────────┘\n');

console.log('┌─────────────────────────────────────────────────────────────┐');
console.log('│ AI_ENGINE_JWT_SECRET (32 bytes = 64 caracteres hex)        │');
console.log('│', aiEngineJwtSecret, '│');
console.log('└─────────────────────────────────────────────────────────────┘\n');

console.log('=== Comandos para configurar en producción ===\n');

console.log('1. SESSION_SECRET:');
console.log('   npx wrangler secret put SESSION_SECRET --env production');
console.log('   (pegar:', sessionSecret, ')\n');

console.log('2. CRON_SECRET:');
console.log('   npx wrangler secret put CRON_SECRET --env production');
console.log('   (pegar:', cronSecret, ')\n');

console.log('3. WEBHOOK_SECRET:');
console.log('   npx wrangler secret put WEBHOOK_SECRET --env production');
console.log('   (pegar:', webhookSecret, ')\n');

console.log('4. AI_ENGINE_JWT_SECRET:');
console.log('   npx wrangler secret put AI_ENGINE_JWT_SECRET --env production');
console.log('   (pegar:', aiEngineJwtSecret, ')\n');

console.log('=== Instrucciones para AI Engine ===\n');
console.log('El AI Engine debe firmar sus webhooks con WEBHOOK_SECRET:');
console.log('1. Construir payload: JSON.stringify(body) + timestamp');
console.log('2. Generar firma HMAC-SHA256 con el secreto');
console.log('3. Enviar headers: X-Webhook-Signature, X-Webhook-Timestamp\n');

console.log('⚠️  IMPORTANTE:');
console.log('   - NUNCA commitear estos secrets al repositorio');
console.log('   - Rotar inmediatamente si hay alguna exposición');
console.log('   - Usar un password manager para guardarlos\n');
