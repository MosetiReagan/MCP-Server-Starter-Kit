# Production deployment

## Checklist

- Set `MCP_HOST=0.0.0.0` only when traffic is filtered by a firewall or reverse proxy.
- Enable API-key authentication.
- Set exact `CORS_ORIGINS`.
- Use a least-privilege PostgreSQL, MySQL, or Redis account.
- Set `LOG_LEVEL=info` and ship logs to a protected destination.
- Deploy behind TLS.
- Configure liveness to `/health` and readiness to `/ready`.
- Limit request body size and timeout to your actual protocol needs.
- Run containers as non-root users.

## Environment

Copy `.env.example` and set only the integrations you enable. Startup fails with
a useful message when a required dependency variable is missing.

## Docker

```bash
export MCP_API_KEY="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
docker compose up --build
```

The image is multi-stage and runs as the non-root `app` user. Development
dependencies are pruned after build.
