import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";

class MemoryStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: () => void,
  ): void {
    this.chunks.push(chunk.toString("utf8"));
    callback();
  }
  toString(): string {
    return this.chunks.join("");
  }
}

describe("runCli", () => {
  it("writes a config from init and refuses to overwrite it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pnpm-deny-"));
    const cwd = process.cwd();
    process.chdir(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "tmp", private: true }),
    );
    try {
      const stdout = new MemoryStream();
      const stderr = new MemoryStream();
      const first = await runCli(["init"], { stdout, stderr });
      expect(first).toBe(0);
      expect(readFileSync(join(dir, "pnpm-deny.yaml"), "utf8")).toContain(
        "licenses:",
      );
      const second = await runCli(["init"], { stdout, stderr });
      expect(second).toBe(1);
      expect(stderr.toString()).toMatch(/Refusing to overwrite/);
    } finally {
      process.chdir(cwd);
    }
  });

  it("prints help", async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const code = await runCli(["help"], { stdout, stderr });
    expect(code).toBe(0);
    expect(stdout.toString()).toContain("pnpm deny check");
    expect(stdout.toString()).toContain("--color WHEN");
    expect(stdout.toString()).toContain("auto (default)");
  });

  it("rejects invalid --color values", async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const code = await runCli(["check", "--color", "rainbow"], {
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/Invalid --color value 'rainbow'/);
  });
});
