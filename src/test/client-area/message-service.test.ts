import { describe, expect, it, vi } from 'vitest';

import { postThreadMessage } from '../../lib/client-area/message-service';

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

describe('postThreadMessage', () => {
  it('returns null when no client is linked to the given user', async () => {
    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectChain([])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-no-client',
      body: 'Hello',
    });

    expect(result).toBeNull();
  });

  it('returns null when the thread does not exist', async () => {
    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        // 2. thread lookup
        .mockImplementationOnce(() => createSelectChain([])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await postThreadMessage({
      db,
      threadId: 'thread-nonexistent',
      userId: 'user-123',
      body: 'Hello',
    });

    expect(result).toBeNull();
  });

  it('returns null when the thread belongs to a different client', async () => {
    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        // 2. thread lookup (belongs to client-2)
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-2' }])),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-123',
      body: 'Hello from client-1',
    });

    expect(result).toBeNull();
  });

  it('inserts a message and updates the thread, then returns the new message id', async () => {
    const insertCalls: unknown[] = [];
    const updateCalls: unknown[] = [];

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      insert: vi.fn().mockReturnValue({
        values(values: unknown) {
          insertCalls.push(values);
          return Promise.resolve();
        },
      }),
      update: vi.fn().mockReturnValue({
        set(values: unknown) {
          updateCalls.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    const result = await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-123',
      body: 'We need to move the delivery to Thursday.',
    });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('id');
    expect(typeof result!.id).toBe('string');
    expect(result!.id.length).toBeGreaterThan(0);

    // Verify the insert was called
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        threadId: 'thread-1',
        authorUserId: 'user-123',
        authorRole: 'client',
        body: 'We need to move the delivery to Thursday.',
      }),
    );
    // Inserted message should have createdAt as a Date
    expect(insertCalls[0]).toHaveProperty('createdAt');
    expect(insertCalls[0].createdAt).toBeInstanceOf(Date);
  });

  it('updates the thread updatedAt timestamp after inserting the message', async () => {
    const updateSetCalls: unknown[] = [];

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      insert: vi.fn().mockReturnValue({
        values() {
          return Promise.resolve();
        },
      }),
      update: vi.fn().mockReturnValue({
        set(values: unknown) {
          updateSetCalls.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-123',
      body: 'Quick update on the project.',
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toHaveProperty('updatedAt');
    expect(updateSetCalls[0].updatedAt).toBeInstanceOf(Date);
  });

  it('does not insert or update when ownership check fails', async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-2' }])),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-123',
      body: 'Should not be inserted',
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('sets authorRole to client for all posted messages', async () => {
    const insertCalls: unknown[] = [];

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ id: 'client-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ clientId: 'client-1' }])),
      insert: vi.fn().mockReturnValue({
        values(values: unknown) {
          insertCalls.push(values);
          return Promise.resolve();
        },
      }),
      update: vi.fn().mockReturnValue({
        set() {
          return { where: () => Promise.resolve() };
        },
      }),
    } as unknown as import('../../types').AppContext['Variables']['db'];

    await postThreadMessage({
      db,
      threadId: 'thread-1',
      userId: 'user-123',
      body: 'A message from the client.',
    });

    expect(insertCalls[0].authorRole).toBe('client');
  });
});