import { describe, expect, it } from 'vitest';

import { CLIENT_AREA_SECTIONS, createEmptyClientAreaSnapshot } from '../../lib/client-area/contracts';

describe('client area contracts', () => {
  it('defines the shared section slugs', () => {
    expect(CLIENT_AREA_SECTIONS.map((section) => section.slug)).toEqual([
      'inicio',
      'proyectos',
      'revisiones',
      'archivos',
      'mensajes',
      'facturacion',
    ]);
  });

  it('creates the empty client area snapshot', () => {
    const snapshot = createEmptyClientAreaSnapshot();
    const nextSnapshot = createEmptyClientAreaSnapshot();

    expect(snapshot.account.label).toBe('Área de Cliente');
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.reviews).toEqual([]);
    expect(snapshot.files).toEqual([]);
    expect(snapshot.messages).toEqual([]);
    expect(snapshot.billing.invoices).toEqual([]);
    expect(snapshot.timeline).toEqual([]);

    snapshot.projects.push({ id: 'project-1' });
    snapshot.timeline.push({ id: 'timeline-1', kind: 'event', label: 'Timeline item' });

    expect(nextSnapshot.projects).toEqual([]);
    expect(nextSnapshot.timeline).toEqual([]);
  });
});
