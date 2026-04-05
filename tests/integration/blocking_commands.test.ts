import { runProcess } from "../../src/run_process.js";

describe("blocking commands", () => {
    test("blocks recursive ls command", async () => {
        const result = await runProcess({ argv: ["ls", "-R"] });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("Command blocked: recursive ls is disallowed"),
            },
        ]);
    });

    test("blocks recursive ls in shell mode", async () => {
        const result = await runProcess({ command_line: "ls -R" });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("Command blocked: recursive ls is disallowed"),
            },
        ]);
    });
});
