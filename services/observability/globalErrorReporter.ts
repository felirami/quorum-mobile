/**
 * Global error reporter — installs once at app startup.
 *
 * Covers the surfaces that React's <ErrorBoundary> doesn't:
 *   - Uncaught sync/async errors at the RN bridge level (event handlers,
 *     setTimeout callbacks, anything that bubbles past a missing try/catch).
 *   - Unhandled Promise rejections (a category RN's default handler swallows).
 *
 * Both call `report` so we have a single hook for crash reporting later.
 * The original RN handler is preserved so the dev red-box still surfaces in
 * development.
 */

import { rejectionTracking } from './rejectionTrackingShim';
import { logger } from '@quilibrium/quorum-shared';
let installed = false;

function report(source: string, error: unknown, extra?: Record<string, unknown>): void {
  // Keep the format predictable so we can grep for it in metro / crash logs.
  // When we wire up Sentry/etc later, this is the single point to forward to.
  const err = error instanceof Error ? error : new Error(String(error));
  // eslint-disable-next-line no-console
  logger.error(`[global-error] source=${source} message=${err.message}`, extra ?? '', err.stack ?? '(no stack)');
}

export function installGlobalErrorReporter(): void {
  if (installed) return;
  installed = true;

  // 1. RN bridge-level uncaught errors. Preserve the previous handler so
  // the dev red-box still surfaces.
  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (error: Error, isFatal?: boolean) => void; setGlobalHandler: (h: (error: Error, isFatal?: boolean) => void) => void } }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      report('ErrorUtils', error, { isFatal: !!isFatal });
      previous?.(error, isFatal);
    });
  }

  // 2. Unhandled Promise rejections — RN ships the shim but doesn't enable
  // it by default. allRejections=true covers both never-handled and
  // late-handled rejections so we don't miss flap-fixed ones.
  rejectionTracking.enable({
    allRejections: true,
    onUnhandled: (id: number, error: unknown) => {
      report('UnhandledPromiseRejection', error, { id });
    },
    onHandled: () => {
      // A rejection that was eventually caught — quiet. We could log this if
      // we want to track flaky async paths, but it's normally noise.
    },
  });
}
