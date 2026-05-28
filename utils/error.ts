/**
 * Type-safe error message extraction.
 *
 * Use in catch blocks after replacing `catch (err: any)` with `catch (err: unknown)`.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
