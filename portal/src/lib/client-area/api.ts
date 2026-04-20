import { api } from '../api-client';
import type { ClientAreaSnapshot } from '../../../../src/lib/client-area/contracts';

export type { ClientAreaSnapshot };

let cachedSnapshot: ClientAreaSnapshot | null = null;

export async function getWorkspace(): Promise<ClientAreaSnapshot> {
  if (cachedSnapshot) return cachedSnapshot;

  const snapshot = await api<ClientAreaSnapshot>('/api/portal/client-area/workspace');
  cachedSnapshot = snapshot;
  return snapshot;
}

export function invalidateWorkspace(): void {
  cachedSnapshot = null;
}