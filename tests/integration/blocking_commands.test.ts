import { runBash } from "../../src/run_bash.js";


describe("blocking commands", () => {
    test("blocks recursive ls in shell mode", async () => {
        const result = await runBash({ command_line: "ls -R" });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("Command blocked: recursive ls is disallowed"),
            },
        ]);
    });

    test("blocks recursive ls in shell mode with extra whitespace", async () => {
        // TODO parameterize a base test so I can just list runBash arg object variants and either block or not... two tests for allow vs block basically
        const result = await runBash({ command_line: "ls    -R" });
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
        const result = await runBash({ command_line: "bash -lc ls -R" });
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
        const result = await runBash({
            command_line: "echo foo the ls -R bar",
        });
        expect(result.isError).toBeUndefined();
    });
});
