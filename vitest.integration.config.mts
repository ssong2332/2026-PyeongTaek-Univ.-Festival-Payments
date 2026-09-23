import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: {
        environment: "node",
        include: ["tests/integration/**/*.test.ts"],
        setupFiles: ["./tests/integration/setup.ts"],
        fileParallelism: false,
        maxWorkers: 1,
        testTimeout: 15_000,
    },
});
