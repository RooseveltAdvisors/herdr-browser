import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reapStaleChrome } from "./staleChrome";

async function withStateFile(
  state: unknown,
  run: (path: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "stale-chrome-"));
  const path = join(dir, "daemon.json");
  try {
    await writeFile(path, JSON.stringify(state));
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function processCommand(pid: number): Promise<string> {
  try {
    if (process.platform === "darwin") {
      return new TextDecoder()
        .decode(Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]).stdout)
        .trim();
    }
    return (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0")[0] ?? "";
  } catch {
    return "";
  }
}

async function waitForChromeLikeCommand(pid: number, timeoutMs = 1_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let command = "";
  while (Date.now() < deadline) {
    command = await processCommand(pid);
    if (/chrom(e|ium)/i.test(command)) return command;
    await Bun.sleep(10);
  }
  throw new Error(`decoy did not become Chrome-like before timeout: ${JSON.stringify(command)}`);
}

test("missing state file is a no-op", async () => {
  await reapStaleChrome(join(tmpdir(), "stale-chrome-does-not-exist.json"));
});

test("live daemon pid is left alone", async () => {
  // Our own pid is alive, so the reap must not touch the chrome pid.
  await withStateFile({ pid: process.pid, chromePid: process.pid }, async (path) => {
    await reapStaleChrome(path);
  });
});

test("dead daemon with dead chrome is a no-op", async () => {
  const deadPid = 2 ** 22 - 7;
  await withStateFile({ pid: deadPid, chromePid: deadPid }, async (path) => {
    await reapStaleChrome(path);
  });
});

test("dead daemon with a live non-chrome process does not kill it", async () => {
  // A dead daemon pid alongside a live pid that is NOT Chrome exercises the
  // pid-reuse guard. Not process.pid: the runner's own command line contains
  // this test file's name, and "staleChrome.test.ts" matches /chrom(e|ium)/i.
  const decoy = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
  const deadPid = 2 ** 22 - 7;
  try {
    await withStateFile({ pid: deadPid, chromePid: decoy.pid }, async (path) => {
      await reapStaleChrome(path);
    });
    const exited = await Promise.race([
      decoy.exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    expect(exited).toBe(false);
  } finally {
    decoy.kill("SIGKILL");
  }
});

test("dead daemon with a live chrome-named process reaps it", async () => {
  const decoy = Bun.spawn(["bash", "-c", "exec -a fake-chromium-decoy sleep 30"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadPid = 2 ** 22 - 7;
  try {
    // Bun.spawn can return while bash is still the process image. Wait for the
    // synthetic Chrome identity before exercising the production PID guard.
    await expect(waitForChromeLikeCommand(decoy.pid)).resolves.toMatch(/chrom(e|ium)/i);
    await withStateFile({ pid: deadPid, chromePid: decoy.pid }, async (path) => {
      await reapStaleChrome(path);
    });
    const exited = await Promise.race([
      decoy.exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
    ]);
    expect(exited).toBe(true);
  } finally {
    decoy.kill("SIGKILL");
  }
});
