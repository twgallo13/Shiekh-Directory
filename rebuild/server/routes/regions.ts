import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { Region, District } from '../../src/types';

export function createRegionsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('regions')
        .where('lifecycle', '==', 'active')
        .get();
      
      const regions: Region[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Region[];
      
      regions.sort((a, b) => a.name.localeCompare(b.name));
      
      return res.json({ data: regions });
    } catch (error) {
      console.error('List regions error:', error);
      return res.status(500).json({
        error: {
          code: 'list_error',
          message: 'Failed to list regions',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}

export function createDistrictsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      let query = db.collection('districts')
        .where('lifecycle', '==', 'active');
      
      if (req.query.regionId) {
        query = query.where('regionId', '==', req.query.regionId);
      }
      
      const snapshot = await query.get();
      
      const districts: District[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as District[];
      
      districts.sort((a, b) => a.name.localeCompare(b.name));
      
      return res.json({ data: districts });
    } catch (error) {
      console.error('List districts error:', error);
      return res.status(500).json({
        error: {
          code: 'list_error',
          message: 'Failed to list districts',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}
