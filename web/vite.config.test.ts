import { describe, expect, it } from "vitest";

import config from "./vite.config";

describe("Vite dev proxy", () => {
  it("encaminha somente /api para o servidor local esperado", () => {
    expect(config).toMatchObject({
      server: {
        proxy: {
          "/api": {
            target: "http://127.0.0.1:8000",
            changeOrigin: false,
          },
        },
      },
    });
  });
});
