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

    // This test currently fails because the blocking logic only checks the first token.
    // The expectation is that a recursive ls invoked via "bash -lc" should also be blocked.
    test("blocks recursive ls invoked via bash -lc", async () => {
        const result = await runProcess({ command_line: "bash -lc ls -R" });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("Command blocked: recursive ls is disallowed"),
            },
        ]);
    });

    // Same scenario using executable mode (argv) – currently not blocked.
    test("blocks recursive ls invoked via bash -lc in argv mode", async () => {
        const result = await runProcess({ argv: ["bash", "-lc", "ls", "-R"] });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("Command blocked: recursive ls is disallowed"),
            },
        ]);
    });

    // Ensure that commands containing "ls -R" as arguments are not blocked.
    test("allows non-recursive ls in arguments", async () => {
        const result = await runProcess({
            command_line: "echo foo the ls -R bar",
        });
        expect(result.isError).toBeUndefined();
    });
});
