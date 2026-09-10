export interface TableConfig {
  name: string;
  primaryKey: string;
  columns: readonly string[];
  searchColumns?: readonly string[];
}

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertIdentifier(value: string): string {
  if (!identifier.test(value))
    throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): unknown {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  return JSON.parse(decoded) as unknown;
}

export function assertTable(table: TableConfig): void {
  const columns = new Set(table.columns);
  if (!identifier.test(table.name))
    throw new Error(`Unsafe table name: ${table.name}`);
  if (!columns.has(table.primaryKey))
    throw new Error(`Primary key missing from columns for ${table.name}`);
  for (const column of table.searchColumns ?? []) {
    if (!columns.has(column))
      throw new Error(`Search column missing from columns for ${table.name}`);
  }
}

export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
