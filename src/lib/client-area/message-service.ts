import { eq } from 'drizzle-orm';

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
    .where(eq(schema.clientThreads.id, threadId));

  return {
    id,
  };
}
