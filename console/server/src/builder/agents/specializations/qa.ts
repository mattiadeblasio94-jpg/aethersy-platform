// builder/agents/specializations/qa.ts — QA/Testing Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

interface CheckOutcome {
  skipped: boolean;
  exitCode: number;
  output: string;
}

/** Verifica se il workspace espone davvero lo script richiesto. */
async function scriptDefined(
  workspacePath: string,
  script: string,
): Promise<{ runnable: boolean; reason: string }> {
  const probe = await sandboxProvider.exec({
    command: 'sh',
    args: [
      '-c',
      `if [ ! -f package.json ]; then exit 3; fi
if ! node -e "const s=require('./package.json').scripts||{};process.exit(s['${script}']?0:1)"; then exit 4; fi
if [ ! -d node_modules ]; then exit 5; fi
exit 0`,
    ],
    workdir: workspacePath,
    timeout_ms: 15000,
  });

  if (probe.exit_code === 0) return { runnable: true, reason: "" };
  if (probe.exit_code === 3) {
    return { runnable: false, reason: "il workspace non contiene un package.json" };
  }
  if (probe.exit_code === 4) {
    return { runnable: false, reason: `package.json non definisce lo script "${script}"` };
  }
  return {
    runnable: false,
    reason: "le dipendenze non sono installate nel sandbox (node_modules assente)",
  };
}

/**
 * Esegue un controllo nel workspace. Se il controllo non e' eseguibile (nessun
 * package.json, nessuno script, dipendenze non installate) viene saltato e
 * referenziato: un controllo non eseguibile non e' un fallimento del task.
 */
async function runCheck(
  workspacePath: string,
  script: string,
  timeout_ms: number,
): Promise<CheckOutcome> {
  const probe = await scriptDefined(workspacePath, script);
  if (!probe.runnable) {
    return {
      skipped: true,
      exitCode: 0,
      output: `SKIPPED: ${probe.reason}`,
    };
  }

  const result = await sandboxProvider.exec({
    command: 'pnpm',
    args: [script],
    workdir: workspacePath,
    timeout_ms,
  });

  return {
    skipped: false,
    exitCode: result.exit_code,
    output: `STDOUT: ${result.stdout}
STDERR: ${result.stderr}
Exit code: ${result.exit_code}`,
  };
}

function failureLines(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.includes('error') || line.includes('Error'))
    .slice(0, 5);
}

export const qaAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { step, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;
    let passed = true;

    const record = (name: string, command: string, outcome: CheckOutcome, durationMs?: number) => {
      artifacts.push({
        kind: 'log',
        name,
        content: outcome.output,
        metadata: {
          command,
          status: outcome.skipped ? 'skipped' : outcome.exitCode === 0 ? 'passed' : 'failed',
          ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
        },
      });
    };

    switch (action) {
      case 'run_lint': {
        const outcome = await runCheck(workspacePath, 'lint', 60000);
        record('lint-result.txt', 'pnpm lint', outcome);
        if (!outcome.skipped && outcome.exitCode !== 0) {
          throw new Error(`Lint failed: ${failureLines(outcome.output).join('\n')}`);
        }
        costCredits = outcome.skipped ? 0 : 3;
        passed = !outcome.skipped;
        break;
      }

      case 'run_typecheck': {
        const outcome = await runCheck(workspacePath, 'typecheck', 120000);
        record('typecheck-result.txt', 'pnpm typecheck', outcome);
        if (!outcome.skipped && outcome.exitCode !== 0) {
          throw new Error(`Typecheck failed: ${failureLines(outcome.output).join('\n')}`);
        }
        costCredits = outcome.skipped ? 0 : 5;
        passed = !outcome.skipped;
        break;
      }

      case 'run_tests': {
        const outcome = await runCheck(workspacePath, 'test', 120000);
        record('test-result.txt', 'pnpm test', outcome);
        if (!outcome.skipped && outcome.exitCode !== 0 && outcome.output.includes('FAIL')) {
          throw new Error('Tests failed');
        }
        costCredits = outcome.skipped ? 0 : 7;
        passed = !outcome.skipped;
        break;
      }

      case 'run_security_scan': {
        const outcome = await runCheck(workspacePath, 'security:scan', 60000);
        record('security-result.txt', 'pnpm security:scan', outcome);
        if (!outcome.skipped && outcome.exitCode !== 0) {
          throw new Error(`Security scan found issues: ${failureLines(outcome.output).join('\n')}`);
        }
        costCredits = outcome.skipped ? 0 : 5;
        passed = !outcome.skipped;
        break;
      }

      case 'run_full_qa': {
        const checks: { script: string; timeout: number }[] = [
          { script: 'lint', timeout: 60000 },
          { script: 'typecheck', timeout: 120000 },
          { script: 'test', timeout: 120000 },
          { script: 'security:scan', timeout: 60000 },
        ];

        const report: string[] = [];
        for (const check of checks) {
          const outcome = await runCheck(workspacePath, check.script, check.timeout);
          record(`${check.script.replace(':', '-')}-result.txt`, `pnpm ${check.script}`, outcome);
          if (outcome.skipped) {
            report.push(`${check.script.toUpperCase()}: SKIP (${outcome.output})`);
            continue;
          }
          if (outcome.exitCode === 0) {
            report.push(`${check.script.toUpperCase()}: PASS`);
            costCredits += check.script === 'test' ? 7 : 3;
          } else {
            report.push(`${check.script.toUpperCase()}: FAIL`);
            passed = false;
          }
        }

        artifacts.push({
          kind: 'log',
          name: 'qa-report.txt',
          content: report.join('\n'),
          metadata: { command: 'pnpm lint + typecheck + test + security:scan' },
        });

        if (!passed) {
          throw new Error(`QA checks failed. ${report.join(' | ')}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown QA action: ${action}`);
    }

    return {
      output: { qa: 'completed', passed, skipped: costCredits === 0 },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};
