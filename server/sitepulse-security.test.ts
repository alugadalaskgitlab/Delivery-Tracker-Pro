import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { limitSitePulseRequests, requireSitePulseKey } from "./sitepulse-security";

const originalSecret = process.env.SITEPULSE_SHARED_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SITEPULSE_SHARED_SECRET;
  else process.env.SITEPULSE_SHARED_SECRET = originalSecret;
});

function invokeMiddleware(
  middleware: (req: any, res: any, next: () => void) => unknown,
  req: Record<string, any>,
) {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  middleware(req, response, () => { nextCalled = true; });
  return { response, nextCalled };
}

describe("SitePulse integration security", () => {
  it("returns 401 when the key is missing", () => {
    process.env.SITEPULSE_SHARED_SECRET = "configured-value";
    const { response, nextCalled } = invokeMiddleware(requireSitePulseKey, {
      get: () => undefined,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it("returns 401 when the key is incorrect", () => {
    process.env.SITEPULSE_SHARED_SECRET = "configured-value";
    const { response, nextCalled } = invokeMiddleware(requireSitePulseKey, {
      get: () => "wrong-value",
    });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it("accepts the configured key", () => {
    process.env.SITEPULSE_SHARED_SECRET = "configured-value";
    const { response, nextCalled } = invokeMiddleware(requireSitePulseKey, {
      get: () => "configured-value",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  });

  it("rate-limits a client after the configured window budget", () => {
    const req = { ip: `test-${Date.now()}-${Math.random()}` };
    let lastResult: ReturnType<typeof invokeMiddleware> | undefined;
    for (let i = 0; i < 121; i++) {
      lastResult = invokeMiddleware(limitSitePulseRequests, req);
    }
    assert.equal(lastResult?.response.statusCode, 429);
    assert.ok(Number(lastResult?.response.headers["Retry-After"]) > 0);
  });
});
