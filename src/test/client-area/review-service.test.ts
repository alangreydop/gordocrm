import { describe, expect, it, vi } from 'vitest';

import { saveReviewDecision } from '../../lib/client-area/review-service';

function createSelectChain(rows: unknown[]) {
  return {
    from() {
      return {
        where() {
          return {
            limit() {
              return Promise.resolve(rows);
            },
          };
        },
      };
    },
  };
}


describe('saveReviewDecision', () => {
  it('returns null when no client is linked to the given user', async () => {
    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectChain([])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-no-client',
      status: 'approved',
      note: null,
    });

    expect(result).toBeNull();
  });

  it('returns null when the review does not exist', async () => {
    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        // 2. review lookup
        .mockImplementationOnce(() => createSelectChain([])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await saveReviewDecision({
      db,
      reviewId: 'review-nonexistent',
      userId: 'user-123',
      status: 'approved',
      note: null,
    });

    expect(result).toBeNull();
  });

  it('returns null when the review belongs to a different client', async () => {
    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        // 2. review lookup (belongs to client-2)
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-2' }])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-123',
      status: 'approved',
      note: 'Looks good',
    });

    expect(result).toBeNull();
  });

  it('updates the review and returns the result on success', async () => {
    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        // 2. review lookup
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      update: vi.fn().mockReturnValue({
        set() {
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-123',
      status: 'approved',
      note: 'Approved with minor changes',
    });

    expect(result).toEqual({
      id: 'review-1',
      status: 'approved',
    });
  });

  it('calls db.update with the correct status and note', async () => {
    const setCalls: unknown[] = [];
    const whereCalls: unknown[] = [];

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      update: vi.fn().mockReturnValue({
        set(values: unknown) {
          setCalls.push(values);
          return {
            where(...args: unknown[]) {
              whereCalls.push(args);
              return Promise.resolve();
            },
          };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-123',
      status: 'changes_requested',
      note: 'Please fix the color balance',
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toEqual(
      expect.objectContaining({
        status: 'changes_requested',
        decisionNote: 'Please fix the color balance',
        decidedByUserId: 'user-123',
      }),
    );
    // decidedAt and updatedAt should be Date instances
    expect(setCalls[0]).toHaveProperty('decidedAt');
    expect(setCalls[0]).toHaveProperty('updatedAt');
    expect(setCalls[0].decidedAt).toBeInstanceOf(Date);
    expect(setCalls[0].updatedAt).toBeInstanceOf(Date);
  });

  it('passes null note when no note is provided', async () => {
    const setCalls: unknown[] = [];

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      update: vi.fn().mockReturnValue({
        set(values: unknown) {
          setCalls.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-123',
      status: 'approved',
      note: null,
    });

    expect(setCalls[0].decisionNote).toBeNull();
  });

  it('does not call db.update when ownership check fails', async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-2' }])),
      update: vi.fn(),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await saveReviewDecision({
      db,
      reviewId: 'review-1',
      userId: 'user-123',
      status: 'approved',
      note: null,
    });

    expect(db.update).not.toHaveBeenCalled();
  });
});