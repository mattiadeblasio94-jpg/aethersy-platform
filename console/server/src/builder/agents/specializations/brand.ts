// builder/agents/specializations/brand.ts — Brand Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const brandAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'create_brand_kit': {
        // 1. Generate color palette (3 primary + 2 secondary + 3 neutrals)
        const palette = generateColorPalette();
        await writeFile(workspacePath, 'packages/shared/brand/color-palette.json', palette, artifacts);

        // 2. Generate typography scale
        const typography = generateTypography();
        await writeFile(workspacePath, 'packages/shared/brand/typography.json', typography, artifacts);

        // 3. Generate logo (placeholder - Venice image generation could be integrated here)
        // For now, create a logo SVG placeholder
        const logoSvg = generatePlaceholderLogo();
        await writeFile(workspacePath, 'packages/shared/brand/logo.svg', logoSvg, artifacts);

        // 4. Generate UI component library skeleton
        const uiComponents = generateUiSkeleton();
        await writeFile(workspacePath, 'packages/shared/ui/components/index.ts', uiComponents, artifacts);

        // 5. Generate Tailwind base config with custom colors
        const tailwindBase = generateTailwindBase(palette);
        await writeFile(workspacePath, 'tailwind.base.ts', tailwindBase, artifacts);

        costCredits = 15;
        break;
      }

      case 'create_placeholder_logo': {
        const logoSvg = generatePlaceholderLogo();
        await writeFile(workspacePath, 'packages/shared/brand/logo.svg', logoSvg, artifacts);
        costCredits = 5;
        break;
      }

      default:
        throw new Error(`Unknown brand action: ${action}`);
    }

    return {
      output: { brand: 'completed' },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};

function writeFile(workspacePath: string, filePath: string, content: string, artifacts: AgentArtifact[]): Promise<void> {
  return sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > ${filePath} << 'EOF'\n${content}\nEOF`],
    workdir: workspacePath,
  }).then(() => {
    artifacts.push({
      kind: 'design',
      name: filePath,
      content,
      metadata: { path: filePath },
    });
  });
}

function generateColorPalette(): string {
  const palette = {
    primary: {
      main: '#1A1A2E',
      light: '#16213E',
      dark: '#0F0F23',
    },
    secondary: {
      main: '#F5F5F5',
      light: '#FFFFFF',
      dark: '#F0F0F0',
    },
    neutral: {
      main: '#6B7280',
      light: '#D1D5DB',
      dark: '#4B5563',
    },
  };
  return JSON.stringify(palette, null, 2);
}

function generateTypography(): string {
  const typography = {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    fontSizes: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    },
    fontWeights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeights: {
      none: '1',
      shorter: '1.25',
      tight: '1.35',
      normal: '1.5',
      relaxed: '1.625',
      height: '1.75',
    },
  };
  return JSON.stringify(typography, null, 2);
}

function generatePlaceholderLogo(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#1A1A2E"/>
  <text x="100" y="100" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-size="48" font-weight="700" fill="#F5F5F5">
    AETHER
  </text>
  <text x="100" y="130" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-size="24" fill="#6B7280">
    SY
  </text>
</svg>`};
