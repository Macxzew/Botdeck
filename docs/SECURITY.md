# Security

Botdeck is a local tool that can control Discord bots and server actions. Use a disposable Discord test server before using it with an important server.

## Security model

- Discord bot tokens are encrypted at rest.
- Local API actions are protected against cross-site requests.
- WebSocket access requires a local auth token.
- WebSocket origins are checked.
- HTTPS/TLS can be generated or imported locally.
- Security headers and CSP are enabled.
- Sensitive actions are rate-limited.
- Read-only protections are enforced server-side.
- Security events are written to `.botdeck/audit/security-audit.jsonl`.

## Recommended usage

- Never commit Discord tokens.
- Use a dedicated test bot while evaluating Botdeck.
- Keep `.botdeck/` private.
- Review permissions before running destructive actions.
- Prefer read-only mode when inspecting servers.
