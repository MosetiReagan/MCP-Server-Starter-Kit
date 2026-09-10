import mysql from "mysql2/promise";
import { z } from "zod";
import type { Toolkit } from "@mcp-starter/core";
import {
  assertIdentifier,
  assertTable,
  decodeCursor,
  encodeCursor,
  jsonResult,
  type TableConfig,
} from "./sql.js";

export interface MysqlOptions {
  pool: mysql.Pool;
  tables: readonly TableConfig[];
}

export function registerMysqlTools(
  toolkit: Toolkit,
  options: MysqlOptions,
): void {
  for (const table of options.tables) {
    assertTable(table);
    const columns = table.columns
      .map((column) => `\`${assertIdentifier(column)}\``)
      .join(", ");
    const primary = `\`${assertIdentifier(table.primaryKey)}\``;
    toolkit.tool(
      `list_${table.name}`,
      {
        description: `List rows from ${table.name} with cursor pagination`,
        annotations: { readOnlyHint: true, idempotentHint: true },
        inputSchema: {
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().min(1).optional(),
        },
      },
      async ({ limit, cursor }) => {
        const parameters: unknown[] = [limit];
        const where = cursor ? `WHERE ${primary} > ?` : "";
        if (cursor) parameters.push(decodeCursor(cursor));
        const [rows] = await options.pool.query(
          `SELECT ${columns} FROM \`${table.name}\` ${where} ORDER BY ${primary} LIMIT ?`,
          parameters,
        );
        const listedRows = rows as Record<string, unknown>[];
        const lastRow = listedRows.at(-1);
        const nextCursor =
          listedRows.length === limit && lastRow
            ? encodeCursor(lastRow[table.primaryKey])
            : null;
        return jsonResult({ rows: listedRows, nextCursor });
      },
    );
    toolkit.tool(
      `get_${table.name}`,
      {
        description: `Get one ${table.name} row by primary key`,
        inputSchema: { id: z.string() },
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ id }) => {
        const [rows] = await options.pool.query(
          `SELECT ${columns} FROM \`${table.name}\` WHERE ${primary} = ? LIMIT 1`,
          [id],
        );
        return jsonResult((rows as mysql.RowDataPacket[])[0] ?? null);
      },
    );
    if (table.searchColumns?.length) {
      const searchColumns = table.searchColumns;
      const where = table.searchColumns
        .map((column) => `\`${column}\` LIKE ?`)
        .join(" OR ");
      toolkit.tool(
        `search_${table.name}`,
        {
          description: `Search ${table.name} safely with parameterized queries`,
          inputSchema: {
            query: z.string().min(1).max(100),
            limit: z.number().int().min(1).max(100).default(20),
          },
          annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async ({ query, limit }) => {
          const [rows] = await options.pool.query(
            `SELECT ${columns} FROM \`${table.name}\` WHERE ${where} LIMIT ?`,
            [...searchColumns.map(() => `%${query}%`), String(limit)],
          );
          return jsonResult(rows);
        },
      );
    }
  }
}
