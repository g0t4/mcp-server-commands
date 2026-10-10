import { ChildProcess } from "node:child_process";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ProcessStatus = "running" | "exited" | "error";

/**
 * Live handle for a background process, kept in the registry after the
 * original `run_process` tool call returns so `process_status` can poll it.
 */
export type ProcessHandle = {
    pid: number;
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

// Single in-memory registry for the lifetime of the server session.
const registry = new Map<number, ProcessHandle>();

export function registerProcess(pid: number, child: ChildProcess): ProcessHandle {
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
        resolveSettled = resolve;
    });

    const handle: ProcessHandle = {
        pid,
        status: "running",
        stdout: "",
        stderr: "",
        startTime: Date.now(),
        child,
        finalResult: undefined,
        settled,
        resolveSettled,
    };
    registry.set(pid, handle);
    return handle;
}

export function getProcess(pid: number): ProcessHandle | undefined {
    return registry.get(pid);
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
