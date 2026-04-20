import { and, eq } from 'drizzle-orm';

import { schema, type Database } from '../../../db/index.js';

export interface PostThreadMessageInput {
  db: Database;
  threadId: string;
  userId: string;
  body: string;
}

export async function postThreadMessage({
  db,
  threadId,
  userId,
  body,
}: PostThreadMessageInput) {
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, userId))
    .limit(1);

  if (!client) {
    return null;
  }

  const [thread] = await db
    .select({ clientId: schema.clientThreads.clientId })
    .from(schema.clientThreads)
    .where(eq(schema.clientThreads.id, threadId))
    .limit(1);

  if (!thread || thread.clientId !== client.id) {
    return null;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.clientMessages).values({
    id,
    threadId,
    authorUserId: userId,
    authorRole: 'client',
    body,
    createdAt: now,
  });

  await db
    .update(schema.clientThreads)
    .set({
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.clientThreads.id, threadId),
        eq(schema.clientThreads.clientId, client.id),
      ),
    );

  return {
    id,
  };
}
