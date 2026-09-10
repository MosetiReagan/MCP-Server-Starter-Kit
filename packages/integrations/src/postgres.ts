import type pg from "pg";
import { z } from "zod";
import type { Toolkit } from "@mcp-starter/core";
import {
  assertIdentifier,
  assertTable,
  jsonResult,
  type TableConfig,
} from "./sql.js";

export interface PostgresOptions {
  pool: pg.Pool;
  tables: readonly TableConfig[];
}

export function registerPostgresTools(
  toolkit: Toolkit,
  options: PostgresOptions,
): void {
  for (const table of options.tables) {
    assertTable(table);
    const qualified = table.name;
    const columns = table.columns.map(assertIdentifier).join(", ");
    const primary = assertIdentifier(table.primaryKey);

    toolkit.tool(
      `list_${table.name}`,
      { description: `List rows from ${table.name}` },
      async () => {
        const result = await options.pool.query(
          `SELECT ${columns} FROM ${qualified} ORDER BY ${primary} LIMIT 100`,
        );
        return jsonResult(result.rows);
      },
    );

    toolkit.tool(
      `get_${table.name}`,
      {
        description: `Get one ${table.name} row by primary key`,
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const result = await options.pool.query(
          `SELECT ${columns} FROM ${qualified} WHERE ${primary} = $1 LIMIT 1`,
          [id],
        );
        return jsonResult(result.rows[0] ?? null);
      },
    );

    if (table.searchColumns?.length) {
      const searchColumns = table.searchColumns.map(assertIdentifier);
      const where = searchColumns
        .map((column, index) => `${column}::text ILIKE $${String(index + 1)}`)
        .join(" OR ");
      toolkit.tool(
        `search_${table.name}`,
        {
          description: `Search ${table.name} safely with parameterized queries`,
          inputSchema: {
            query: z.string().min(1).max(100),
            limit: z.number().int().min(1).max(100).default(20),
          },
        },
        async ({ query, limit }) => {
          const parameters = searchColumns.map(() => `%${query}%`);
          parameters.push(String(limit));
          const result = await options.pool.query(
            `SELECT ${columns} FROM ${qualified} WHERE ${where} LIMIT $${String(parameters.length)}`,
            parameters,
          );
          return jsonResult(result.rows);
        },
      );
    }
  }
}
