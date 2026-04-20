import { getWorkspace } from './api';
import type { ClientAreaSnapshot } from './api';

export async function bootstrapClientArea(): Promise<ClientAreaSnapshot> {
  try {
    return await getWorkspace();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      window.location.href = '/login';
      return new Promise(() => {});
    }
    const { createEmptyClientAreaSnapshot } = await import('../../../../src/lib/client-area/contracts');
    return createEmptyClientAreaSnapshot();
  }
}