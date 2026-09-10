import { describe, expect, it } from "vitest";
import { parseInspectArguments } from "@mcp-starter/cli";

describe("CLI inspect arguments", () => {
  it("parses a URL and API key", () => {
    expect(
      parseInspectArguments(["https://example.com/mcp", "--api-key", "secret"]),
    ).toEqual({ url: "https://example.com/mcp", apiKey: "secret" });
  });

  it("parses an inline API key", () => {
    expect(parseInspectArguments(["--api-key=secret"])).toEqual({
      apiKey: "secret",
    });
  });

  it("rejects an API key without a value", () => {
    expect(() => parseInspectArguments(["--api-key"])).toThrow(
      /--api-key requires a value/,
    );
  });
});
