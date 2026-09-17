/**
 * The single denylist for both SafetyClassifier (which forces UNSAFE on a match) and
 * PatchValidator (which refuses to apply a patch touching one of these, independent of
 * classification). Previously each module hand-maintained its own copy and they drifted apart —
 * PatchValidator's copy was missing the auth/payment/billing/crypto path patterns entirely,
 * undermining the "defense in depth" this denylist is supposed to provide. One list, imported by
 * both, so that can't happen again.
 *
 * All patterns are case-insensitive — broadening a denylist is always safe; narrowing it by
 * accident (as an inconsistent `/i` flag did before) is not.
 */
export const SECURITY_DENYLIST_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /\.(pem|key|crt|p12|pfx)$/i,
  /(^|\/)secrets?\//i,
  /(^|\/)\.github\/workflows\//i,
  /(^|\/)\.git\//i,
  /(^|\/)(auth|authentication|payment|billing|crypto)[^/]*\//i,
  /(auth|authentication|payment|billing)[^/]*\.[jt]sx?$/i,
];

export function matchesSecurityDenylist(path: string): boolean {
  return SECURITY_DENYLIST_PATTERNS.some((p) => p.test(path));
}
