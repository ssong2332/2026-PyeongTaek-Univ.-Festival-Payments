import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: {
        environment: "node",
        include: ["tests/integration/connection.test.ts"],
        setupFiles: ["./tests/integration/connection.setup.ts"],
        fileParallelism: false,
        testTimeout: 15_000,
    },
});
