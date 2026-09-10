# Examples

## Basic

```bash
npm run dev --workspace @mcp-starter/example-basic
```

Exposes `hello` and `calculate`.

## REST API

```bash
npm run dev --workspace @mcp-starter/example-rest-api
```

Exposes `list_posts` from JSONPlaceholder with a typed response schema.

## PostgreSQL

Set `POSTGRES_URL`, then:

```bash
npm run dev --workspace @mcp-starter/example-postgres
```

Exposes `list_users`, `get_users`, and `search_users` using parameterized SQL.

## Redis

Set `REDIS_URL` and optionally `REDIS_KEY_PREFIX`, then:

```bash
npm run dev --workspace @mcp-starter/example-redis
```

Exposes namespaced cache operations.

## Complete

Use Docker Compose from the repository root:

```bash
export MCP_API_KEY="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
docker compose up --build
```
