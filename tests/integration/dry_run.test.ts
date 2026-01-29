import { runProcess } from "../../src/run_process.js";

describe("runProcess dry_run flag", () => {
    // TODO is this really needed? this sounds more like a one-off helper that would then be distilled into system message instruction updates ... not like every time an agent thread uses this tool, not like it should be asking to explain... and only way to explain otherwise is in instructions
    test("shell mode returns PLAN with command line", async () => {
        const result = await runProcess({
            mode: "shell",
            command_line: "echo hello",
            dry_run: true,
        } as any);
        expect(result.content).toBeDefined();
        const plan = result.content?.find((c) => c.name === "PLAN");
        expect(plan).toBeDefined();
        expect(plan?.type).toBe("text");
        expect((plan as any).text).toContain("Shell mode");
        expect((plan as any).text).toContain("echo hello");
        // PRN mention how is called via child_process
    });

    test("executable mode returns PLAN with argv", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["node", "-v"],
            dry_run: true,
        } as any);
        expect(result.content).toBeDefined();
        const plan = result.content?.find((c) => c.name === "PLAN");
        expect(plan).toBeDefined();
        expect(plan?.type).toBe("text");
        expect((plan as any).text).toContain("Executable mode");
        expect((plan as any).text).toContain("node");
        // PRN mention how is called via child_process
    });

});

