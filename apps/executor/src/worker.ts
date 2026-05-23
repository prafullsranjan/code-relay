import 'dotenv/config';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { buildRunnerJobSpec, getBatchClient, NON_EXECUTABLE_LANGS } from './k8s.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const namespace = process.env.RUNNER_NAMESPACE ?? 'code-relay-runners';
const runtimeClassName = process.env.RUNNER_RUNTIME_CLASS ?? 'kata-fc';

const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
redis.on('error', (err) => {
  console.warn(`executor redis unavailable at ${redisUrl}: ${err.message}`);
});
const prisma = new PrismaClient();

async function emitRunEvent(workspaceId: string, runId: string, stream: 'stdout' | 'stderr' | 'system', chunk: string) {
  const row = await prisma.runEvent.create({
    data: { runId, stream, chunk }
  });
  await redis.publish(
    `workspace:${workspaceId}:runs`,
    JSON.stringify({ type: 'run.event', workspaceId, runId, event: row })
  );
}

// ---------------------------------------------------------------------------
// Utility: find the first available binary from a list of candidates
// ---------------------------------------------------------------------------
/** Hard cap for compile steps — keeps the Run button responsive. */
const COMPILE_TIMEOUT_MS = 30_000;
/**
 * Grace period (ms) after the first stderr output before the run process is
 * force-killed. Handles programs that print an error then hang indefinitely.
 * Programs that exit naturally within this window are NOT affected.
 */
const RUN_ERROR_GRACE_MS = 3_000;

function findCmd(candidates: string[]): string {
  for (const c of candidates) {
    try {
      execFileSync('which', [c], { stdio: 'pipe' });
      return c;
    } catch { /* not found, try next */ }
  }
  return candidates[0]; // fallback — will fail with a clear ENOENT message
}

/**
 * Like findCmd but returns null when no candidate is found in PATH, instead
 * of falling back to the first candidate.  Use this for pre-flight checks
 * that want to emit a helpful "not installed" message before spawning.
 */
function findBinary(candidates: string[]): string | null {
  for (const c of candidates) {
    try {
      execFileSync('which', [c], { stdio: 'pipe' });
      return c;
    } catch { /* not found */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Local execution configurations
// ---------------------------------------------------------------------------
interface LocalExecStep {
  cmd: string;
  args: string[];
}

interface LocalExecConfig {
  fileName: string;
  /** Optional compile step before running */
  compile?: (dir: string) => LocalExecStep;
  /** Run step */
  run: (dir: string) => LocalExecStep;
  /** Optional per-line stderr filter — return true to keep the line, false to suppress */
  stderrFilter?: (line: string) => boolean;
}

function getLocalExecConfig(language: string, entryFile?: string): LocalExecConfig | null {
  switch (language) {
    case 'node':
    case 'javascript':
    case 'nodejs':
    case 'react': {
      const f = entryFile ?? 'index.js';
      return { fileName: f, run: (dir) => ({ cmd: 'node', args: [join(dir, f)] }) };
    }
    case 'python': {
      const f = entryFile ?? 'main.py';
      return { fileName: f, run: (dir) => ({ cmd: 'python3', args: [join(dir, f)] }) };
    }
    case 'ruby': {
      const f = entryFile ?? 'main.rb';
      return {
        fileName: f,
        run: (dir) => ({ cmd: 'ruby', args: [join(dir, f)] }),
        // macOS system Ruby emits "warning: Insecure world writable dir …" to stderr
        // when PATH contains world-writable directories.  Filter it so it does not
        // appear as a build error in the UI.
        stderrFilter: (line) =>
          !line.includes('Insecure world writable dir') &&
          !line.includes('rbconfig.rb'),
      };
    }
    case 'php': {
      const f      = entryFile ?? 'main.php';
      const phpBin = findBinary(['php', 'php8', 'php8.3', 'php8.2', 'php8.1', 'php7.4']);
      if (!phpBin) throw new Error(
        '[CodeRelay] PHP is not installed on this runner.\n' +
        '  → macOS: brew install php  |  Linux: apt-get install php'
      );
      return { fileName: f, run: (dir) => ({ cmd: phpBin, args: [join(dir, f)] }) };
    }
    case 'lua': {
      const f      = entryFile ?? 'main.lua';
      const luaBin = findBinary(['lua', 'lua5.4', 'lua5.3', 'lua54', 'lua53']);
      if (!luaBin) throw new Error(
        '[CodeRelay] Lua is not installed on this runner.\n' +
        '  → macOS: brew install lua  |  Linux: apt-get install lua5.4'
      );
      return { fileName: f, run: (dir) => ({ cmd: luaBin, args: [join(dir, f)] }) };
    }
    case 'groovy': {
      const f         = entryFile ?? 'main.groovy';
      const groovyBin = findBinary(['groovy', 'groovy4', 'groovy3']);
      if (!groovyBin) throw new Error(
        '[CodeRelay] Groovy is not installed on this runner.\n' +
        '  → macOS: brew install groovy  |  SDKMan: sdk install groovy'
      );
      return { fileName: f, run: (dir) => ({ cmd: groovyBin, args: [join(dir, f)] }) };
    }
    case 'c': {
      const f = entryFile ?? 'main.c';
      return {
        fileName: f,
        compile: (dir) => ({ cmd: 'gcc', args: ['-O2', join(dir, f), '-o', join(dir, 'a.out')] }),
        run: (dir) => ({ cmd: join(dir, 'a.out'), args: [] })
      };
    }
    case 'cpp': {
      const f = entryFile ?? 'main.cpp';
      return {
        fileName: f,
        compile: (dir) => ({ cmd: 'g++', args: ['-O2', join(dir, f), '-o', join(dir, 'a.out')] }),
        run: (dir) => ({ cmd: join(dir, 'a.out'), args: [] })
      };
    }
    case 'java': {
      const f = entryFile ?? 'Main.java';
      return {
        fileName: f,
        compile: (dir) => ({ cmd: 'javac', args: [join(dir, f), '-d', dir] }),
        run: (dir) => ({ cmd: 'java', args: ['-cp', dir, 'Main'] })
      };
    }
    case 'csharp': {
      const f = entryFile ?? 'Program.cs';
      if (!findBinary(['dotnet'])) throw new Error(
        '[CodeRelay] .NET SDK is not installed on this runner.\n' +
        '  → Download from: https://dotnet.microsoft.com/download'
      );
      return {
        fileName: f,
        compile: (dir) => ({
          cmd: 'sh',
          args: ['-c', `printf '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>' > ${join(dir, 'app.csproj')}`]
        }),
        run: (dir) => ({ cmd: 'dotnet', args: ['run', '--project', dir] })
      };
    }
    case 'assembly': {
      const f = entryFile ?? 'main.asm';
      if (!findBinary(['nasm'])) throw new Error(
        '[CodeRelay] NASM assembler is not installed on this runner.\n' +
        '  → macOS: brew install nasm  |  Linux: apt-get install nasm'
      );
      return {
        fileName: f,
        compile: (dir) => ({
          cmd: 'sh',
          args: ['-c', `nasm -f elf64 ${join(dir, f)} -o ${join(dir, 'm.o')} && ld ${join(dir, 'm.o')} -o ${join(dir, 'm')}`]
        }),
        run: (dir) => ({ cmd: join(dir, 'm'), args: [] })
      };
    }
    default:
      return null;
  }
}

async function runProcess(
  step: LocalExecStep,
  timeoutMs: number,
  onStdout: (s: string) => void,
  onStderr: (s: string) => void,
  stdinData?: string,
  /**
   * If > 0, the process is force-killed this many ms after the first stderr
   * output.  Only takes effect when the process is still alive at that point;
   * processes that exit naturally before the timer fires are unaffected.
   */
  errorGraceMs = 0,
  /**
   * Optional per-line stderr filter.  Return true to keep a line, false to
   * suppress it.  Filtered lines are not emitted AND do not start the
   * error-grace timer — useful for suppressing benign VM/runtime noise
   * (e.g. the macOS system-Ruby rbconfig.rb PATH warning).
   */
  stderrFilter?: (line: string) => boolean
): Promise<{ exitCode: number; killedReason: 'timeout' | 'error_grace' | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(step.cmd, step.args, {
      timeout: timeoutMs,
      // SIGTERM (the default) can be caught/ignored; SIGKILL cannot.
      killSignal: 'SIGKILL',
    });

    let errorGraceTimer: ReturnType<typeof setTimeout> | null = null;
    let killedByErrorGrace = false;

    proc.stdout.on('data', (d: Buffer) => onStdout(d.toString()));
    proc.stderr.on('data', (d: Buffer) => {
      let text = d.toString();
      if (stderrFilter) {
        text = text.split('\n').filter(stderrFilter).join('\n');
      }
      if (!text.trim()) return; // nothing left after filtering — skip grace timer too
      onStderr(text);
      // Start the grace timer on first stderr so hanging error states are
      // cleaned up promptly without cutting off multi-line tracebacks.
      if (errorGraceMs > 0 && errorGraceTimer === null) {
        errorGraceTimer = setTimeout(() => {
          killedByErrorGrace = true;
          proc.kill('SIGKILL');
        }, errorGraceMs);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      if (errorGraceTimer) clearTimeout(errorGraceTimer);
      const exitCode = code ?? (signal ? 1 : 0);
      // Distinguish between: killed by our error-grace timer, killed by the
      // spawn timeout, and a natural exit.
      const killedReason: 'timeout' | 'error_grace' | null =
        killedByErrorGrace           ? 'error_grace' :
        (signal !== null && !code)   ? 'timeout'     :
        null;
      resolve({ exitCode, killedReason });
    });
    if (stdinData) proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const worker = new Worker(
  'code-relay-runs',
  async (job) => {
    const { runId, workspaceId, language, version, entryFile, content, stdin, timeoutMs } = job.data as {
      runId: string;
      workspaceId: string;
      language: string;
      version?: string;
      entryFile?: string;
      content?: string;
      stdin?: string;
      timeoutMs: number;
    };

    await prisma.run.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: new Date() } });
    await emitRunEvent(workspaceId, runId, 'system', `run_started language=${language} version=${version ?? 'default'}`);

    try {
      // Non-executable languages: return a friendly message immediately
      if (NON_EXECUTABLE_LANGS.has(language)) {
        await emitRunEvent(workspaceId, runId, 'stdout', `[CodeRelay] ${language} is a query/markup language and cannot be executed directly in this environment.\nYour code is saved and visible to collaborators.`);
        await prisma.run.update({ where: { id: runId }, data: { status: 'SUCCEEDED', finishedAt: new Date(), exitCode: 0 } });
        await emitRunEvent(workspaceId, runId, 'system', 'run_finished exitCode=0');
        return;
      }

      const spec = buildRunnerJobSpec({
        runId, workspaceId, language, version, entryFile, content,
        runtimeClassName, timeoutMs, namespace
      });

      let k8sAvailable = false;
      try {
        const batchApi = getBatchClient();
        await batchApi.createNamespacedJob({ namespace, body: spec });
        await emitRunEvent(workspaceId, runId, 'system', 'k8s_job_created');
        k8sAvailable = true;
      } catch {
        // K8s not reachable — fall through to local execution
      }

      if (k8sAvailable) {
        await emitRunEvent(workspaceId, runId, 'stdout', 'Execution accepted and queued on runner.');
        await prisma.run.update({ where: { id: runId }, data: { status: 'SUCCEEDED', finishedAt: new Date(), exitCode: 0 } });
        await emitRunEvent(workspaceId, runId, 'system', 'run_finished exitCode=0');
        return;
      }

      if (!content) {
        await emitRunEvent(workspaceId, runId, 'stderr', 'k8s unavailable and no code content received');
        await prisma.run.update({ where: { id: runId }, data: { status: 'FAILED', finishedAt: new Date(), exitCode: 1 } });
        await emitRunEvent(workspaceId, runId, 'system', 'run_finished exitCode=1');
        return;
      }

      // ── Local execution ────────────────────────────────────────────────────
      await emitRunEvent(workspaceId, runId, 'system', 'k8s_unavailable_using_local_runner');

      const execConfig = getLocalExecConfig(language, entryFile);
      if (!execConfig) {
        await emitRunEvent(workspaceId, runId, 'stderr', `[CodeRelay] Local execution not supported for language: ${language}`);
        await prisma.run.update({ where: { id: runId }, data: { status: 'FAILED', finishedAt: new Date(), exitCode: 1 } });
        await emitRunEvent(workspaceId, runId, 'system', 'run_finished exitCode=1');
        return;
      }

      const tmpDir = await mkdtemp(join(tmpdir(), 'cr-run-'));
      let exitCode = 0;
      try {
        const filePath = join(tmpDir, execConfig.fileName);
        await writeFile(filePath, content, 'utf-8');

        const out = (s: string) => void emitRunEvent(workspaceId, runId, 'stdout', s);
        const err = (s: string) => void emitRunEvent(workspaceId, runId, 'stderr', s);

        // Optional compile step — capped at COMPILE_TIMEOUT_MS so a hanging
        // compiler does not block the Run button for the full run timeout.
        if (execConfig.compile) {
          const compileStep   = execConfig.compile(tmpDir);
          const compileTimeout = Math.min(timeoutMs, COMPILE_TIMEOUT_MS);
          const { exitCode: compileExit, killedReason: compileKilled } =
            await runProcess(compileStep, compileTimeout, out, err);
          if (compileExit !== 0) {
            if (compileKilled === 'timeout') {
              await emitRunEvent(workspaceId, runId, 'stderr',
                `[CodeRelay] Compilation timed out (limit: ${compileTimeout / 1000}s)`);
            }
            exitCode = compileExit;
            await prisma.run.update({ where: { id: runId }, data: { status: 'FAILED', finishedAt: new Date(), exitCode } });
            await emitRunEvent(workspaceId, runId, 'system', `run_finished exitCode=${exitCode}`);
            return;
          }
        }

        // Run step — pass errorGraceMs so programs that print an error and
        // then hang are killed promptly instead of waiting for the full timeout.
        // Also pass any language-specific stderr filter (e.g. Ruby PATH warning).
        const { exitCode: runExit, killedReason: runKilled } =
          await runProcess(execConfig.run(tmpDir), timeoutMs, out, err, stdin, RUN_ERROR_GRACE_MS, execConfig.stderrFilter);
        exitCode = runExit;
        if (runKilled === 'timeout') {
          await emitRunEvent(workspaceId, runId, 'stderr',
            `[CodeRelay] Process killed: time limit exceeded (${timeoutMs / 1000}s)`);
        } else if (runKilled === 'error_grace') {
          await emitRunEvent(workspaceId, runId, 'stderr',
            `[CodeRelay] Process stopped after producing error output`);
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }

      const finalStatus = exitCode === 0 ? 'SUCCEEDED' as const : 'FAILED' as const;
      await prisma.run.update({ where: { id: runId }, data: { status: finalStatus, finishedAt: new Date(), exitCode } });
      await emitRunEvent(workspaceId, runId, 'system', `run_finished exitCode=${exitCode}`);

    } catch (err) {
      const errCode = (err as NodeJS.ErrnoException).code;
      const message = (err as Error).message;
      // Pass [CodeRelay]-prefixed messages (our pre-flight checks) through as-is.
      // For unexpected ENOENT errors, emit the standard "not installed" message.
      const errMsg = message.startsWith('[CodeRelay]')
        ? message
        : errCode === 'ENOENT'
          ? `[CodeRelay] Runtime not found: '${(err as NodeJS.ErrnoException).path ?? 'binary'}' is not installed on this runner.`
          : `run_failed: ${message}`;
      await prisma.run.update({ where: { id: runId }, data: { status: 'FAILED', finishedAt: new Date(), exitCode: 1 } });
      await emitRunEvent(workspaceId, runId, 'stderr', errMsg);
      // Always emit run_finished so the client Run button resets
      await emitRunEvent(workspaceId, runId, 'system', 'run_finished exitCode=1');
    }
  },
  { connection: redis }
);

worker.on('ready', () => {
  console.log('executor worker ready');
});
