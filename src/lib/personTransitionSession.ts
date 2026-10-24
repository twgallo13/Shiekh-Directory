import { createPersonTransitionController } from './personTransitionController';
import type { SessionState } from './authSession';

/** Bind the future dialog controller to AuthProvider's synchronous boundary, not a render snapshot.
 * No route, capability or admission is enabled here. Inaccessible markers are not deleted.
 */
export async function openSessionBoundTransition(
  auth: { currentSession(): SessionState; sessionGeneration(): number; onSessionBoundary(listener: () => void): () => void },
  options: Omit<Parameters<typeof createPersonTransitionController>[0], 'session' | 'generation'>,
) {
  let invalidated = false, controller: Awaited<ReturnType<typeof createPersonTransitionController>> | undefined;
  let unsubscribe = () => {};
  unsubscribe = auth.onSessionBoundary(() => { invalidated = true; unsubscribe(); controller?.dispose(); options.port.dispose?.(); });
  try {
    controller = await createPersonTransitionController({ ...options, session: auth.currentSession, generation: auth.sessionGeneration });
    if (invalidated) { controller.dispose(); throw new Error('Session changed. Sign in and recover before continuing.'); }
    const originalDispose = controller.dispose;
    return { ...controller, dispose() { unsubscribe(); originalDispose(); } };
  } catch (error) { unsubscribe(); options.port.dispose?.(); throw error; }
}
