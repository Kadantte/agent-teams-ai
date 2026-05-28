import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/features/outbox/src/infrastructure/prisma/prisma-outbox.repository.db.test.ts",
      "packages/platform/database/src/prisma/prisma-database.db.test.ts",
    ],
    restoreMocks: true,
  },
});
