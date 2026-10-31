// builder/agents/specializations/qa.ts — QA/Testing Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const qaAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'run_lint': {
        // Run ESLint
        const result = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['lint'],
          workdir: workspacePath,
          timeout_ms: 60000,
        });
        artifacts.push({
          kind: 'log',
          name: 'lint-result.txt',
          content: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nExit code: ${result.exit_code}`,
          metadata: { command: 'pnpm lint', duration_ms: result.duration_ms },
        });

        if (result.exit_code !== 0) {
          // Extract error lines
          const errors = result.stderr.split('\n').filter((l: string) => l.includes('error') || l.includes('Error'));
          throw new Error(`Lint failed: ${errors.slice(0, 5).join('\n')}`);
        }

        costCredits = 3;
        break;
      }

      case 'run_typecheck': {
        // Run TypeScript type check
        const result = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['typecheck'],
          workdir: workspacePath,
          timeout_ms: 120000,
        });
        artifacts.push({
          kind: 'log',
          name: 'typecheck-result.txt',
          content: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nExit code: ${result.exit_code}`,
          metadata: { command: 'pnpm typecheck', duration_ms: result.duration_ms },
        });

        if (result.exit_code !== 0) {
          const errors = result.stderr.split('\n').filter((l: string) => l.includes('error') || l.includes('Error')).slice(0, 10);
          throw new Error(`Typecheck failed: ${errors.join('\n')}`);
        }

        costCredits = 5;
        break;
      }

      case 'run_tests': {
        // Run vitest
        const result = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['test'],
          workdir: workspacePath,
          timeout_ms: 120000,
        });
        artifacts.push({
          kind: 'log',
          name: 'test-result.txt',
          content: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nExit code: ${result.exit_code}\n${result.stdout.includes('FAIL') ? 'Some tests failed!' : 'All tests passed!'}`,
          metadata: { command: 'pnpm test', duration_ms: result.duration_ms },
        });

        if (result.exit_code !== 0 && result.stdout.includes('FAIL')) {
          throw new Error(`Tests failed`);
        }

        costCredits = 7;
        break;
      }

      case 'run_security_scan': {
        // Run semgrep security scan
        const result = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['security:scan'],
          workdir: workspacePath,
          timeout_ms: 60000,
        });
        artifacts.push({
          kind: 'log',
          name: 'security-result.txt',
          content: `STDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nExit code: ${result.exit_code}`,
          metadata: { command: 'pnpm security:scan', duration_ms: result.duration_ms },
        });

        if (result.exit_code !== 0) {
          const findings = result.stderr.split('\n').filter((l: string) => !l.includes('OK') && !l.includes('no issues found')).slice(0, 5);
          throw new Error(`Security scan found issues: ${findings.join('\n')}`);
        }

        costCredits = 5;
        break;
      }

      case 'run_full_qa': {
        // Run all QA checks in sequence
        let allPassed = true;
        let totalOutput = '';

        // Lint
        try {
          const lintResult = await sandboxProvider.exec({
            command: 'pnpm',
            args: ['lint'],
            workdir: workspacePath,
            timeout_ms: 60000,
          });
          totalOutput += `LINT: ${lintResult.exit_code === 0 ? 'PASS' : 'FAIL'}\n`;
          if (lintResult.exit_code !== 0) allPassed = false;
        } catch (e) {
          totalOutput += `LINT: FAIL - ${e}\n`;
          allPassed = false;
        }

        // Typecheck
        try {
          const tcResult = await sandboxProvider.exec({
            command: 'pnpm',
            args: ['typecheck'],
            workdir: workspacePath,
            timeout_ms: 120000,
          });
          totalOutput += `TYPECHECK: ${tcResult.exit_code === 0 ? 'PASS' : 'FAIL'}\n`;
          if (tcResult.exit_code !== 0) allPassed = false;
        } catch (e) {
          totalOutput += `TYPECHECK: FAIL - ${e}\n`;
          allPassed = false;
        }

        // Tests
        try {
          const testResult = await sandboxProvider.exec({
            command: 'pnpm',
            args: ['test'],
            workdir: workspacePath,
            timeout_ms: 120000,
          });
          totalOutput += `TESTS: ${testResult.exit_code === 0 ? 'PASS' : 'FAIL'}\n`;
          if (testResult.exit_code !== 0 && testResult.stdout.includes('FAIL')) allPassed = false;
        } catch (e) {
          totalOutput += `TESTS: FAIL - ${e}\n`;
          allPassed = false;
        }

        // Security scan
        try {
          const secResult = await sandboxProvider.exec({
            command: 'pnpm',
            args: ['security:scan'],
            workdir: workspacePath,
            timeout_ms: 60000,
          });
          totalOutput += `SECURITY: ${secResult.exit_code === 0 ? 'PASS' : 'FAIL'}\n`;
          if (secResult.exit_code !== 0) allPassed = false;
        } catch (e) {
          totalOutput += `SECURITY: FAIL - ${e}\n`;
          allPassed = false;
        }

        if (!allPassed) {
          throw new Error(`QA checks failed. ${totalOutput}`);
        }

        costCredits = 10;
        break;
      }

      default:
        throw new Error(`Unknown QA action: ${action}`);
    }

    return {
      output: { qa: 'completed', passed: costCredits > 0 },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};
