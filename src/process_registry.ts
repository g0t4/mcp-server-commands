import { ChildProcess } from "node:child_process";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ProcessStatus = "running" | "exited" | "error";

/**
 * Synthesize a compact session token (64-bit hex) when the client doesn't
 * supply a progressToken. Unique enough for an in-memory registry key.
 */
export function generateToken(): string {
    return randomBytes(8).toString("hex");
}

/**
 * Live handle for a background process, kept in the registry after the
 * original `run_bash` tool call returns so `process_status` can poll it.
 */
export type ProcessHandle = {
    token: string;
    status: ProcessStatus;
    stdout: string;
    stderr: string;
    startTime: number;
    /** Reference to the child so it is not garbage-collected while running. */
    child: ChildProcess | undefined;
    /** The full result once the process settles; undefined while running. */
    finalResult: CallToolResult | undefined;
    /** Resolves when the process settles (used to implement `wait`). */
    settled: Promise<void>;
    resolveSettled: () => void;
};

/**
 * Drain the accumulated stdout buffer, returning its current contents and
 * resetting it so subsequent calls only see NEW output.
 */
export function drainStdout(handle: ProcessHandle): string {
    const output = handle.stdout;
    handle.stdout = "";
    return output;
}

/**
 * Drain the accumulated stderr buffer, returning its current contents and
 * resetting it so subsequent calls only see NEW output.
 */
export function drainStderr(handle: ProcessHandle): string {
    const output = handle.stderr;
    handle.stderr = "";
    return output;
}

// Single in-memory registry for the lifetime of the server session.
const registry = new Map<string, ProcessHandle>();

export function registerProcess(token: string, child: ChildProcess): ProcessHandle {
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
        resolveSettled = resolve;
    });

    const handle: ProcessHandle = {
        token,
        status: "running",
        stdout: "",
        stderr: "",
        startTime: Date.now(),
        child,
        finalResult: undefined,
        settled,
        resolveSettled,
    };
    registry.set(token, handle);
    return handle;
}

export function getProcess(token: string): ProcessHandle | undefined {
    return registry.get(token);
}

/**
 * Kill a background process (the whole group on non-Windows). Returns false if
 * the child is gone. Used by the `process_stop` tool.
 */
export function killProcess(handle: ProcessHandle, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const child = handle.child;
    if (!child || !child.pid) return false;
    if (process.platform !== "win32") {
        try { process.kill(-child.pid, signal); } catch { }
    } else {
        child.kill(signal);
    }
    return true;
}

/**
 * Wait for a background process to settle, optionally bounding the wait.
 * Returns immediately if the process is already done.
 */
export function waitForProcess(
    handle: ProcessHandle,
    waitTimeoutMs?: number,
): Promise<void> {
    if (handle.status !== "running") {
        return Promise.resolve();
    }
    if (waitTimeoutMs === undefined || waitTimeoutMs === null) {
        return handle.settled;
    }
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitTimeoutMs);
        handle.settled.then(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}
