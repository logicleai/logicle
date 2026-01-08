# Security at a Glance

## Attack Surface

- **Role/ownership abuse**: Admin routes and user-scoped resources could be invoked without the right role or owner checks.
- **Cookie-based auth abuse**: CSRF against session cookie; login/logout CSRF; fixation; re-use of SSO transient cookies.
- **SSO flow tampering**: OIDC/SAML callback replay, missing state/PKCE verification, lingering transient cookies.

## Countermeasures

- **Role & ownership**: Each operation declares `authentication` (`public`/`user`/`admin`). The route wrapper validates the signed JWT session cookie and enforces role; handlers validate ownership for user-scoped data.
- **CSRF on authenticated APIs**: Authenticated endpoints reject requests whose `Sec-Fetch-Site` is not `same-origin`. Login/logout/join are marked `preventCrossSite`, so cross-site calls fail. Main session cookie is `HttpOnly`, `SameSite=Lax`.
- **SSO hardening (OIDC/SAML)**:
  - Short-lived transient `sso_flow_session` (`SameSite=None; Secure`) holds only `state` and PKCE verifier/idp to allow IdP redirects/POSTs.
  - Always emits random `state`; OIDC also uses PKCE. Callbacks verify `state` (and PKCE), then destroy the transient session and set a delete cookie.
  - Permanent app session is issued only after successful verification.
- **Session integrity**: App session is a signed JWT (`session` cookie) with `sub/email/role/tokenVersion/exp` (+ optional `idp`). It’s `HttpOnly`; integrity is protected by `NEXTAUTH_SECRET`. Data is not encrypted, but tampering invalidates it.
