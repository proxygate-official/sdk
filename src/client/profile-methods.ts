import type { ApiMethodDeps } from './api-methods.js';
import type {
  SetContactEmailOptions,
  SetContactEmailResponse,
  VerifyContactEmailOptions,
  VerifyContactEmailResponse,
} from '../types.js';

/**
 * POST /v1/profile/email — wallet/bearer-authed.
 *
 * Associates a contact email with the authenticated wallet. The gateway sends
 * a verification email containing a one-time token; the caller confirms via
 * {@link verifyContactEmail}.
 *
 * Errors are NOT swallowed: `deps.authenticatedRequest` throws `ProxygateError`
 * on any non-OK response, which propagates to the caller (CLI surfaces the
 * action/docs pointer; agents can switch on `err.code`).
 */
export function setContactEmail(
  deps: ApiMethodDeps,
  opts: SetContactEmailOptions,
): Promise<SetContactEmailResponse> {
  return deps.authenticatedRequest<SetContactEmailResponse>('POST', '/v1/profile/email', {
    body: { email: opts.email },
  });
}

/**
 * POST /v1/profile/email/verify — wallet/bearer-authed.
 *
 * Confirms ownership of a previously submitted email using the emailed token.
 *
 * On the heavy "web-claim" collision path (email already bound to another
 * identity), the gateway returns an error carrying an `action`/`docs` pointer.
 * This method does NOT catch it — the `ProxygateError` propagates so the caller
 * can surface the pointer ("sign in with the original method, link your wallet
 * in Settings"). The light path returns a {@link VerifyContactEmailResponse}.
 */
export function verifyContactEmail(
  deps: ApiMethodDeps,
  opts: VerifyContactEmailOptions,
): Promise<VerifyContactEmailResponse> {
  return deps.authenticatedRequest<VerifyContactEmailResponse>('POST', '/v1/profile/email/verify', {
    body: { token: opts.token },
  });
}
