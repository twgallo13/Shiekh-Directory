import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser } from '../../src/types';
import { 
  getWorkflowRules, 
  updateWorkflowRule, 
  resetWorkflowRule, 
  getSettingsChangeHistory,
  DEFAULT_WORKFLOW_RULES,
  WORKFLOW_RULES_RANGES,
  type WorkflowRules 
} from '../services/workflowSettings';

export function createWorkflowRulesRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: { code: 'access_denied', message: 'Admin access required', requestId: res.locals.requestId },
      });
    }
    next();
  });

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const rules = await getWorkflowRules(db);
      res.json({ 
        data: rules,
        defaults: DEFAULT_WORKFLOW_RULES,
        ranges: WORKFLOW_RULES_RANGES,
      });
    } catch (error) {
      console.error('Get workflow rules error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get workflow rules', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/:field', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { field } = req.params;
      const { value } = req.body;

      if (!(field in DEFAULT_WORKFLOW_RULES)) {
        return res.status(400).json({
          error: { code: 'invalid_field', message: `Unknown field: ${field}`, requestId: res.locals.requestId },
        });
      }

      const fieldKey = field as keyof WorkflowRules;

      const result = await updateWorkflowRule(
        db,
        fieldKey,
        value,
        authUser.uid,
        authUser.email,
        authUser.role
      );

      if (!result.success) {
        return res.status(400).json({
          error: { code: 'validation_error', message: result.error, requestId: res.locals.requestId },
        });
      }

      // Note: updateWorkflowRule already handles audit logging via logSettingsChange

      const newRules = await getWorkflowRules(db);
      res.json({ data: newRules });
    } catch (error) {
      console.error('Update workflow rule error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update workflow rule', requestId: res.locals.requestId },
      });
    }
  });

  router.delete('/:field', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { field } = req.params;

      if (!(field in DEFAULT_WORKFLOW_RULES)) {
        return res.status(400).json({
          error: { code: 'invalid_field', message: `Unknown field: ${field}`, requestId: res.locals.requestId },
        });
      }

      const fieldKey = field as keyof WorkflowRules;

      const result = await resetWorkflowRule(
        db,
        fieldKey,
        authUser.uid,
        authUser.email,
        authUser.role
      );

      if (!result.success) {
        return res.status(400).json({
          error: { code: 'reset_error', message: result.error, requestId: res.locals.requestId },
        });
      }

      // Note: resetWorkflowRule calls updateWorkflowRule which handles audit logging

      const newRules = await getWorkflowRules(db);
      res.json({ data: newRules });
    } catch (error) {
      console.error('Reset workflow rule error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to reset workflow rule', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/history', async (req: Request, res: Response) => {
    try {
      const { limit = '50' } = req.query;
      const history = await getSettingsChangeHistory(
        db,
        'workflowRules',
        parseInt(limit as string, 10)
      );
      res.json({ data: history });
    } catch (error) {
      console.error('Get workflow rules history error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get history', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}
