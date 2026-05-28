/**
 * Buffer polyfill — install before any module that depends on `Buffer`.
 *
 * Must live in its own file and be imported via side-effect at the TOP of the
 * root layout (before any other imports in that file). This is critical:
 * `import { Buffer } from 'buffer'` hoists, so writing `global.Buffer = Buffer`
 * in the same file as other imports means those other imports' module bodies
 * run BEFORE the assignment. Putting the assignment in its own module ensures
 * the module body (and therefore the assignment) completes before the next
 * import statement in the importer is evaluated.
 *
 * Consumers needing Buffer at module-eval time: `@solana/web3.js`, `@polkadot/api`,
 * `bitcoinjs-lib`, `@bitcoinerlab/secp256k1`, plus any code that uses
 * `Buffer.from(...)` at the top level.
 */

import { Buffer } from 'buffer';

// Guard: only install if Hermes/engine hasn't already provided one (it won't in
// React Native today, but some test runners do).
const globalAny = globalThis as unknown as { Buffer?: typeof Buffer };
if (typeof globalAny.Buffer === 'undefined') {
  globalAny.Buffer = Buffer;
}
