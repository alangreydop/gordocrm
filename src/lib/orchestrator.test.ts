import { describe, it, expect } from 'vitest';
import { getTransition } from './orchestrator.js';

describe('orchestrator state machine', () => {
  describe('valid transitions', () => {
    it('transitions pending → plan_generated on brief_received', () => {
      const result = getTransition('pending', 'brief_received', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('plan_generated');
    });

    it('transitions plan_generated → asset_factory_dispatched on plan_approved', () => {
      const result = getTransition('plan_generated', 'plan_approved', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('asset_factory_dispatched');
    });

    it('transitions asset_factory_dispatched → asset_generated on assets_generated', () => {
      const result = getTransition('asset_factory_dispatched', 'assets_generated', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('asset_generated');
    });

    it('transitions asset_generated → qa_evaluation on qa_requested (within retry limit)', () => {
      const result = getTransition('asset_generated', 'qa_requested', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_evaluation');
    });

    it('transitions qa_evaluation → approved on qa_passed', () => {
      const result = getTransition('qa_evaluation', 'qa_passed', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('approved');
    });

    it('transitions qa_evaluation → qa_hitl_review on qa_in_band', () => {
      const result = getTransition('qa_evaluation', 'qa_in_band', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_hitl_review');
    });

    it('transitions qa_evaluation → rejected on qa_failed', () => {
      const result = getTransition('qa_evaluation', 'qa_failed', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('rejected');
    });

    it('transitions qa_hitl_review → approved on hitl_approved', () => {
      const result = getTransition('qa_hitl_review', 'hitl_approved', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('approved');
    });

    it('transitions qa_hitl_review → rejected on hitl_rejected', () => {
      const result = getTransition('qa_hitl_review', 'hitl_rejected', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('rejected');
    });

    it('transitions approved → delivery_ready on delivery_confirmed', () => {
      const result = getTransition('approved', 'delivery_confirmed', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('delivery_ready');
    });

    it('transitions delivery_ready → crm_notified on crm_notified', () => {
      const result = getTransition('delivery_ready', 'crm_notified', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('crm_notified');
    });

    it('transitions any non-terminal state → cancelled on cancel', () => {
      const states = [
        'pending', 'processing', 'plan_generated', 'asset_factory_dispatched',
        'asset_generated', 'qa_pending', 'qa_evaluation', 'qa_hitl_review',
        'approved', 'rejected', 'delivery_ready',
      ] as const;

      for (const state of states) {
        const result = getTransition(state, 'cancel', 0, 0);
        expect(result).not.toBeNull();
        expect(result!.newState).toBe('cancelled');
      }
    });
  });

  describe('retry logic', () => {
    it('plan_generated retries on plan_rejected when retryCount < 3', () => {
      const result = getTransition('plan_generated', 'plan_rejected', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('plan_generated');
    });

    it('plan_generated → plan_rejected when retryCount >= 3', () => {
      const result = getTransition('plan_generated', 'plan_rejected', 3, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('plan_rejected');
    });

    it('rejected → plan_generated on retry_plan', () => {
      const result = getTransition('rejected', 'retry_plan', 1, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('plan_generated');
    });

    it('rejected → plan_rejected on plan_retry_exhausted', () => {
      const result = getTransition('rejected', 'plan_retry_exhausted', 3, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('plan_rejected');
    });

    it('qa_evaluation retries on brand_graph_unavailable when qaRetryCount < 3', () => {
      const result = getTransition('qa_evaluation', 'brand_graph_unavailable', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_evaluation');
    });

    it('qa_evaluation → qa_pending on brand_graph_unavailable when qaRetryCount >= 3', () => {
      const result = getTransition('qa_evaluation', 'brand_graph_unavailable', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_pending');
    });

    it('asset_generated → qa_evaluation on qa_requested when qaRetryCount < 3', () => {
      const result = getTransition('asset_generated', 'qa_requested', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_evaluation');
    });

    it('asset_generated → qa_pending on qa_requested when qaRetryCount >= 3', () => {
      const result = getTransition('asset_generated', 'qa_requested', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('qa_pending');
    });
  });

  describe('invalid transitions', () => {
    it('returns null for invalid state+event combinations', () => {
      const invalidCombos: Array<[string, string]> = [
        ['pending', 'plan_approved'],
        ['plan_generated', 'brief_received'],
        ['approved', 'brief_received'],
        ['completed', 'brief_received'],
        ['failed', 'retry_plan'],
        ['cancelled', 'qa_requested'],
        ['crm_notified', 'delivery_confirmed'],
      ];

      for (const [state, event] of invalidCombos) {
        const result = getTransition(state as never, event as never, 0, 0);
        expect(result).toBeNull();
      }
    });
  });

  describe('terminal states', () => {
    it('terminal states have no outgoing transitions', () => {
      const terminalStates = ['completed', 'failed', 'delivered', 'cancelled', 'crm_notified'] as const;
      const events = [
        'brief_received', 'plan_approved', 'qa_passed', 'delivery_confirmed',
      ] as const;

      for (const state of terminalStates) {
        for (const event of events) {
          const result = getTransition(state, event, 0, 0);
          expect(result).toBeNull();
        }
      }
    });
  });

  describe('timeout transitions', () => {
    it('plan_generated → timeout on timeout event', () => {
      const result = getTransition('plan_generated', 'timeout', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('timeout');
    });

    it('asset_factory_dispatched → timeout on timeout event', () => {
      const result = getTransition('asset_factory_dispatched', 'timeout', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('timeout');
    });

    it('qa_hitl_review → timeout on timeout event', () => {
      const result = getTransition('qa_hitl_review', 'timeout', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.newState).toBe('timeout');
    });
  });
});