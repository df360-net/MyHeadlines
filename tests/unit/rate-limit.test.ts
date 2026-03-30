import { describe, it, expect, vi, beforeEach } from "vitest";

// We test rate-limit by importing the factory and calling the middleware directly
vi.mock("hono", () => ({
  Hono: vi.fn(),
}));

import { rateLimit } from "../../src/middleware/rate-limit.js";

function mockContext(ip?: string) {
  return {
    req: {
      header: (name: string) => {
        if (name === "x-forwarded-for") return ip || null;
        return null;
      },
    },
    json: vi.fn().mockReturnValue("response"),
  } as any;
}

describe("rateLimit", () => {
  it("allows requests within the limit", async () => {
    const middleware = rateLimit({ windowMs: 60000, max: 3 });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const c = mockContext("1.2.3.4");
      await middleware(c, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks requests exceeding the limit with 429", async () => {
    const middleware = rateLimit({ windowMs: 60000, max: 2 });
    const next = vi.fn();

    // First 2 should pass
    await middleware(mockContext("5.6.7.8"), next);
    await middleware(mockContext("5.6.7.8"), next);

    // 3rd should be blocked
    const c = mockContext("5.6.7.8");
    const result = await middleware(c, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(c.json).toHaveBeenCalledWith(
      { error: "Too many requests. Please try again later." },
      429
    );
  });

  it("tracks different IPs independently", async () => {
    const middleware = rateLimit({ windowMs: 60000, max: 1 });
    const next = vi.fn();

    await middleware(mockContext("10.0.0.1"), next);
    await middleware(mockContext("10.0.0.2"), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("uses 'local' key when no IP headers present", async () => {
    const middleware = rateLimit({ windowMs: 60000, max: 1 });
    const next = vi.fn();

    await middleware(mockContext(), next);
    expect(next).toHaveBeenCalledTimes(1);

    const c = mockContext();
    await middleware(c, next);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }), 429);
  });
});
