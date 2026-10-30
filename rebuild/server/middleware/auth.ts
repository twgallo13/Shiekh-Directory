import { type Request, type Response, type NextFunction, Router } from 'express';
import { randomUUID } from 'crypto';
import { getAuthClient } from '../firebase';

export function createAuthMiddleware(): Router {
  const router = Router();
  
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
          requestId: res.locals.requestId,
        },
      });
    }
    
    const token = authHeader.slice(7);
    
    try {
      const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      
      if (isEmulator && token.startsWith('test-token-')) {
        res.locals.user = {
          uid: token.replace('test-token-', ''),
          email: 'test@example.com',
        };
        return next();
      }
      
      const auth = getAuthClient();
      const decodedToken = await auth.verifyIdToken(token);
      res.locals.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
      };
      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired authentication token',
          requestId: res.locals.requestId,
        },
      });
    }
  });
  
  return router;
}
