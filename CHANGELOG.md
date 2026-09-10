# Changelog

## Unreleased

### Breaking changes

- PostgreSQL and MySQL `list_<table>` tools now return `{ "rows": [...], "nextCursor": string | null }` instead of a bare row array. Pass `nextCursor` as `cursor` to fetch the next page.
