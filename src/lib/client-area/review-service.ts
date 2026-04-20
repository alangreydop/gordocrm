import { and, eq } from 'drizzle-orm';

import { schema, type Database } from '../../../db/index.js';

export interface SaveReviewDecisionInput {
  db: Database;
  reviewId: string;
  userId: string;
  status: 'approved' | 'changes_requested';
  note: string | null;
}

export async function saveReviewDecision({
  db,
  reviewId,
  userId,
  status,
  note,
}: SaveReviewDecisionInput) {
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, userId))
    .limit(1);

  if (!client) {
    return null;
  }

  const [review] = await db
    .select({ clientId: schema.clientReviews.clientId })
    .from(schema.clientReviews)
    .where(eq(schema.clientReviews.id, reviewId))
    .limit(1);

  if (!review || review.clientId !== client.id) {
    return null;
  }

  await db
    .update(schema.clientReviews)
    .set({
      status,
      decisionNote: note,
      decidedByUserId: userId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.clientReviews.id, reviewId),
        eq(schema.clientReviews.clientId, client.id),
      ),
    );

  return {
    id: reviewId,
    status,
  };
}
