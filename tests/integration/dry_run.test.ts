import { runProcess } from "../../src/run_process.js";

describe("runProcess dry_run flag", () => {
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
    });
});

