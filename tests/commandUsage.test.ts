import { describe, expect, it } from "bun:test";
import { InvalidInputError } from "../src/domain/errors.js";
import { COMMAND_USAGE, renderUsage } from "../src/bot/commandUsage.js";
import { requiredPart, splitCommand } from "../src/bot/commandUtils.js";

describe("argument validation", () => {
  it("throws InvalidInputError with no message when arguments are missing", () => {
    expect(() => splitCommand("/proposal", 2)).toThrow(InvalidInputError);
    try {
      splitCommand("/proposal", 2);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      expect((error as InvalidInputError).message).toBe("");
    }
  });

  it("throws InvalidInputError when a required field is empty", () => {
    expect(() => requiredPart(["/proposal"], 1)).toThrow(InvalidInputError);
  });
});

describe("renderUsage", () => {
  it("shows the summary, usage, example, and next step when no reason is given", () => {
    const text = renderUsage("proposal");
    expect(text).toContain(COMMAND_USAGE["proposal"]!.summary);
    expect(text).toContain("Usage: /proposal <proposalId>");
    expect(text).toContain("Example:");
    expect(text).toContain("/buy");
  });

  it("uses a specific reason as the lead line instead of the summary", () => {
    const text = renderUsage("buy", "That is not a valid EVM address.");
    expect(text.startsWith("That is not a valid EVM address.")).toBe(true);
    expect(text).toContain("Usage: /buy <tokenAddress> <bnbAmount> [slippageBps]");
  });

  it("falls back to the reason when the command has no usage entry", () => {
    expect(renderUsage("unknown_command", "boom")).toBe("boom");
  });

  it("defines a usage entry for every command that takes arguments", () => {
    for (const command of ["proposal", "pool_role", "safe_group", "safe_execute", "flap_metadata", "flap_launch", "safe_prepare"]) {
      expect(COMMAND_USAGE[command]).toBeDefined();
    }
  });

  it("keeps Flap examples generic instead of using the product brand as a token", () => {
    expect(COMMAND_USAGE["flap_metadata"]!.example).toContain("Family Coin|FAM");
    expect(COMMAND_USAGE["flap_launch"]!.example).toContain("Family Coin|FAM");
  });
});
