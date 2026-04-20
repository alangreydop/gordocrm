import { getWorkspace } from './api';
import type { ClientAreaSnapshot } from './api';

export async function bootstrapClientArea(): Promise<ClientAreaSnapshot> {
  try {
    return await getWorkspace();
  } catch {
    const { createEmptyClientAreaSnapshot } = await import('../../../../src/lib/client-area/contracts');
    return createEmptyClientAreaSnapshot();
  }
}