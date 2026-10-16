import { runProcess } from "../../src/run_process.js";
import { getProcess, waitForProcess, drainStdout, drainStderr } from "../../src/process_registry.js";
import process from "node:process";

function pidFrom(result: any): number {
    const msg = result.content.find(
        (c: any) => c.type === "text" && c.name === "PID",
    );
    expect(msg).toBeDefined();
    return Number(msg.text);
}

describe("runProcess - background mode (fire-and-forget)", () => {

    test("returns immediately with PID and DONE:false instead of blocking", async () => {
        const result = await runProcess({
            command_line: "sleep 0.5",
            background: true,
        });

        // Background returns before the process finishes.
        expect(result.isError).toBeUndefined();
        expect(result.content).toEqual([
            expect.objectContaining({ name: "PID", type: "text" }),
            { name: "DONE", type: "text", text: "false" },
        ]);
        expect(pidFrom(result)).toBeGreaterThan(0);
    });

    test("process_status shows done:false while running, then done:true with STDOUT/exit code", async () => {
        const result = await runProcess({
            command_line: "echo hello && sleep 0.5",
            background: true,
        });
        const pid = pidFrom(result);

        // Still running right after start.
        let handle = getProcess(pid)!;
        expect(handle.status).toBe("running");
        expect(handle.finalResult).toBeUndefined();

        // Block until it settles, like process_status with wait:true.
        await waitForProcess(handle);
        handle = getProcess(pid)!;
        expect(handle.status).toBe("exited");

        // Same STDOUT/STDERR + exit code as a foreground run.
        expect(handle.finalResult!.content).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "EXIT_CODE", text: "0" }),
            expect.objectContaining({ name: "STDOUT", text: expect.stringContaining("hello") }),
        ]));
    });

    test("process_status wait_timeout_ms returns done:false when the timeout elapses", async () => {
        const result = await runProcess({
            command_line: "sleep 2",
            background: true,
        });
        const pid = pidFrom(result);
        const handle = getProcess(pid)!;

        // Only wait 200ms; the 2s sleep should still be running.
        await waitForProcess(handle, 200);
        expect(handle.status).toBe("running");

        // Clean up the lingering background process.
        process.kill(pid, "SIGKILL");
    });

    test("a background process the agent kills itself is reflected by process_status", async () => {
        const result = await runProcess({
            command_line: "sleep 30",
            background: true,
        });
        const pid = pidFrom(result);
        const handle = getProcess(pid)!;

        // The agent kills the PID via a separate command (e.g. `kill -9 <pid>`).
        process.kill(pid, "SIGKILL");

        await waitForProcess(handle);
        expect(handle.status).toBe("exited");
        expect(handle.finalResult!.content).toEqual([
            expect.objectContaining({ name: "SIGNAL", text: "SIGKILL" }),
        ]);
    });

    test("process_status drains stdout buffer so repeated polls only return new output", async () => {
        const result = await runProcess({
            command_line: "echo first && sleep 1 && echo second",
            background: true,
        });
        const pid = pidFrom(result);
        const handle = getProcess(pid)!;

        // Let the first echo land but the process still be running.
        await new Promise((r) => setTimeout(r, 300));
        expect(handle.status).toBe("running");
        expect(handle.stdout).toContain("first");
        expect(handle.stdout).not.toContain("second");

        // First poll: sees "first", then drains.
        const firstPoll = drainStdout(handle);
        expect(firstPoll).toContain("first");
        expect(handle.stdout).toBe("");

        // Second poll (before "second" arrives): no output, since drained.
        expect(handle.stdout).toBe("");

        // Clean up.
        process.kill(pid, "SIGKILL");
    });

    test("notify_on_completion requires background:true", async () => {
        const result = await runProcess({
            command_line: "echo hi",
            notify_on_completion: true,
        });

        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "ERROR",
                type: "text",
                text: expect.stringContaining("only applicable with 'background: true'"),
            },
        ]);
    });
});
