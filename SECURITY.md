# Security Policy

## Supported versions

Security fixes target the current `main` branch and the latest tagged release.

## API keys and secrets

- Store API keys outside Git and container images.
- Use a secret manager or encrypted environment storage in production.
- Set `MCP_API_KEY` to at least 32 random characters.
- Rotate keys when operators, deployments, or logs may have been exposed.
- Never place credentials in tool descriptions, prompts, resources, or response bodies.

## Database permissions

Create a dedicated database user with only the permissions the server needs:

- PostgreSQL/MySQL: `SELECT` on explicitly exposed tables
- Redis: a dedicated logical database and prefix where possible
- Do not use table owners, superusers, or admin accounts

The bundled adapters only expose table configurations you explicitly provide and
bind all values as parameters. They do not provide an unrestricted SQL tool. If
you add one for internal development, gate it behind authentication and do not
deploy it to production.

## External API credentials

Keep upstream credentials server-side. Do not proxy arbitrary client-controlled
headers to upstream APIs. Map each operation explicitly, validate responses, and
set conservative timeouts and retry limits.

## Network exposure

- Bind to `127.0.0.1` unless the server is intentionally exposed.
- Use TLS at a trusted edge reverse proxy or load balancer.
- Run as a non-root container user.
- Restrict database and Redis services to an internal network.
- Do not expose PostgreSQL, MySQL, or Redis ports publicly.

## CORS

`CORS_ORIGINS` must list exact origins. The server does not default to `*`.
Only list origins that should be allowed to call the authenticated MCP endpoint.

## Reporting a vulnerability

Please report vulnerabilities privately to the repository maintainer through
GitHub security advisories. Include reproduction steps, affected versions, logs
with secrets removed, and your recommended mitigation. Do not open a public
issue for a suspected vulnerability.
