/**
  * Webhook Signature Verification
  *
  * Verifica firmas HMAC-SHA256 de webhooks entrantes.
  * Usado para autenticar webhooks de AI Engine y otros sistemas externos.
  */

/**
  * Verifica una firma HMAC-SHA256
  *
  * @param payload - El payload completo (JSON stringificado + timestamp)
  * @param signature - La firma recibida en el header X-Webhook-Signature
  * @param secret - El secreto compartido
  * @returns true si la firma es válida
  */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();

   // Importar clave para HMAC
  const keyData = await crypto.subtle.importKey(
     'raw',
    encoder.encode(secret),
     { name: 'HMAC', hash: 'SHA-256' },
    false,
     ['sign'],
   );

   // Firmar el payload
  const signatureBuffer = await crypto.subtle.sign('HMAC', keyData, encoder.encode(payload));

   // Convertir a base64url (sin padding)
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
     .replace(/=/g, '')
     .replace(/\+/g, '-')
     .replace(/\//g, '_');

   // Comparar en tiempo constante para prevenir timing attacks
  return constantTimeCompare(signature, signatureB64);
}

/**
  * Genera una firma HMAC-SHA256 para un payload
  *
  * @param payload - El payload a firmar
  * @param secret - El secreto compartido
  * @returns La firma en base64url
  */
export async function generateWebhookSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();

  const keyData = await crypto.subtle.importKey(
     'raw',
    encoder.encode(secret),
     { name: 'HMAC', hash: 'SHA-256' },
    false,
     ['sign'],
   );

  const signatureBuffer = await crypto.subtle.sign('HMAC', keyData, encoder.encode(payload));

  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
     .replace(/=/g, '')
     .replace(/\+/g, '-')
     .replace(/\//g, '_');
}

/**
  * Compara dos strings en tiempo constante para prevenir timing attacks
  */
function constantTimeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);

  let result = aBuf.length ^ bBuf.length;
  for (let i = 0; i < maxLen; i++) {
    const aByte = aBuf[i] ?? 0;
    const bByte = bBuf[i] ?? 0;
    result |= aByte ^ bByte;
   }

  return result === 0;
}
