/**
 * Thin typed wrapper around the untyped CommonJS shim that ships with the
 * `promise` package. Kept in its own file so consumers don't have to deal
 * with the dynamic require pattern.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tracking = require('promise/setimmediate/rejection-tracking') as {
  enable: (options: {
    allRejections?: boolean;
    onUnhandled?: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
};

export const rejectionTracking = tracking;
