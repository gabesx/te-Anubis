import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd: string;
  timeoutMs?: number;
  /** Explicit env allow-list — never inherits secrets by default. */
  env?: Record<string, string>;
}

/**
 * The only sanctioned way to shell out in this codebase. Always takes an
 * argv array, never a shell string — repo-controlled input (file paths,
 * branch names, commit messages) is passed as literal argv entries and is
 * never interpreted by a shell, which closes off shell-injection via crafted
 * filenames/branch names.
 */
export async function run(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 60_000,
      env: options.env,
      shell: false,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
}
