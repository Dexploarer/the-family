import { describe, expect, it } from "bun:test";
import { buildPgPoolConfig } from "../src/storage/pgPoolConfig.js";

type VerifiedSsl = { ca: string[]; rejectUnauthorized: boolean };

// Remote hosts get verified TLS with the Supabase root CA pinned alongside the
// public roots — verification stays ON, and the pinned CA is present.
function expectVerifiedSslWithPinnedCa(ssl: unknown): void {
  const verified = ssl as VerifiedSsl;
  expect(verified.rejectUnauthorized).toBe(true);
  expect(Array.isArray(verified.ca)).toBe(true);
  expect(verified.ca.some((cert) => cert.includes("Supabase Root 2021 CA") || cert.includes("BEGIN CERTIFICATE"))).toBe(
    true
  );
}

describe("buildPgPoolConfig", () => {
  it("does not enable SSL for a local host", () => {
    const config = buildPgPoolConfig("postgresql://postgres:pw@localhost:5432/bnancy");
    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe("postgresql://postgres:pw@localhost:5432/bnancy");
  });

  it("enables verified SSL with the Supabase CA pinned for a remote host", () => {
    const config = buildPgPoolConfig(
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    expectVerifiedSslWithPinnedCa(config.ssl);
  });

  it("strips sslmode from the connection string so it cannot override the ssl object", () => {
    const config = buildPgPoolConfig(
      "postgresql://postgres:pw@db.ref.supabase.co:5432/postgres?sslmode=require"
    );
    expectVerifiedSslWithPinnedCa(config.ssl);
    expect(config.connectionString).not.toContain("sslmode");
  });

  it("respects an explicit sslmode=disable even on a remote host", () => {
    const config = buildPgPoolConfig("postgresql://u:p@remote.example.com:5432/db?sslmode=disable");
    expect(config.ssl).toBeUndefined();
  });

  it("respects an explicit sslmode=require even on localhost", () => {
    const config = buildPgPoolConfig("postgresql://u:p@localhost:5432/db?sslmode=require");
    expectVerifiedSslWithPinnedCa(config.ssl);
  });
});
