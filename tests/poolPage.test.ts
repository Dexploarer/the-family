import { describe, expect, it } from "bun:test";
import { renderPoolPage } from "../src/http/poolPage.js";

describe("renderPoolPage", () => {
  it("renders a Telegram mini app that fetches pool analytics", () => {
    const html = renderPoolPage("-100123");

    expect(html).toContain("telegram-web-app.js");
    expect(html).toContain("/api/pools/");
    expect(html).toContain("Pool analytics");
    expect(html).toContain("Telegram Web App identity is required");
    expect(html).toContain("data-chat-id=\"-100123\"");
  });
});
