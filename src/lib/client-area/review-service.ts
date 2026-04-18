import { eq } from 'drizzle-orm';

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
  await db
    .update(schema.clientReviews)
    .set({
      status,
      decisionNote: note,
      decidedByUserId: userId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.clientReviews.id, reviewId));

  return {
    id: reviewId,
    status,
  };
}
