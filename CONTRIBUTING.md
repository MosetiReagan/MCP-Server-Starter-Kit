# Contributing

## Development setup

```bash
git clone <your-fork-url>
cd mcp-server-starter-kit
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Node.js 20 or newer is required.

## Architecture

- `packages/core`: MCP wrapper, config schema, logging, and errors
- `packages/server`: transports, authentication, health, readiness, lifecycle
- `packages/integrations`: PostgreSQL, MySQL, Redis, and REST adapters
- `packages/cli`: validation, doctor, inspection, and lifecycle commands
- `packages/create-mcp-server`: standalone project generator and template
- `examples`: runnable reference servers

Keep public APIs close to the official MCP TypeScript SDK. Avoid adding layers
that make it harder to understand standard MCP behavior.

## Code style

- TypeScript strict mode
- ESM modules
- Zod validation for external input and output
- No `any`, stack traces in client errors, or hardcoded credentials
- Prettier formatting
- Comments only where a security or protocol decision needs explanation

Run:

```bash
npm run format
npm run lint
npm run typecheck
```

## Tests

Add focused tests for:

- schema validation and useful configuration errors
- tool registration and execution
- authentication and authorization failures
- HTTP health, readiness, CORS, and MCP transport behavior
- integration parameterization and allowlists
- CLI failure exit codes

Run:

```bash
npm test
npm run test:watch
```

## Adding an integration

1. Add a narrowly scoped adapter under `packages/integrations/src`.
2. Require explicit allowlists for tables, keys, operations, or scopes.
3. Bind all values; validate identifiers separately.
4. Add a timeout and safe dependency health check.
5. Document credential handling and least-privilege requirements.
6. Add tests that prove unsafe input is rejected.

## Pull requests

- Keep changes focused and include a clear rationale.
- Update documentation and examples when behavior changes.
- Run lint, typecheck, tests, and build.
- Describe authentication, secrets, SQL, and network exposure impacts.
