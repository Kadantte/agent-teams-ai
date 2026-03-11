import YAML from 'yaml';

import type { SkillDraftFile, SkillDraftTemplateInput } from '@shared/types/extensions';

const SKILL_FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

export interface SkillDraftOptions {
  rawContent: string;
  includeScripts: boolean;
  includeReferences: boolean;
  includeAssets: boolean;
}

function trimTrailingWhitespace(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();
}

export function buildSkillTemplate(input: SkillDraftTemplateInput): string {
  const lines = [
    '---',
    `name: ${input.name || 'New Skill'}`,
    `description: ${input.description || 'Describe what this skill helps with.'}`,
    ...(input.license ? [`license: ${input.license}`] : []),
    ...(input.compatibility ? [`compatibility: ${input.compatibility}`] : []),
    ...(input.invocationMode === 'manual-only' ? ['disable-model-invocation: true'] : []),
    '---',
    '',
    `# ${input.name || 'New Skill'}`,
    '',
    input.description || 'Describe what this skill helps with.',
    '',
    '## When to use',
    '- Add the conditions where this skill should be selected.',
    '',
    '## Steps',
    '1. Describe the first step.',
    '2. Describe the second step.',
    '',
    '## Notes',
    '- Add caveats, review rules, or references.',
  ];

  return trimTrailingWhitespace(lines.join('\n'));
}

export function readSkillTemplateInput(rawContent: string): Partial<SkillDraftTemplateInput> {
  const content = rawContent.replace(/^\uFEFF/u, '');
  const match = content.match(SKILL_FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  try {
    const parsed = YAML.parse(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const data = parsed as Record<string, unknown>;
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      license: typeof data.license === 'string' ? data.license : undefined,
      compatibility: typeof data.compatibility === 'string' ? data.compatibility : undefined,
      invocationMode: data['disable-model-invocation'] === true ? 'manual-only' : 'auto',
    };
  } catch {
    return {};
  }
}

export function updateSkillTemplateFrontmatter(
  rawContent: string,
  input: SkillDraftTemplateInput
): string {
  const content = rawContent.replace(/^\uFEFF/u, '');
  const match = content.match(SKILL_FRONTMATTER_PATTERN);
  const body = match ? (match[2] ?? '') : content;

  let data: Record<string, unknown> = {};
  if (match) {
    try {
      const parsed = YAML.parse(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      data = {};
    }
  }

  data.name = input.name || 'New Skill';
  data.description = input.description || 'Describe what this skill helps with.';

  if (input.license) {
    data.license = input.license;
  } else {
    delete data.license;
  }

  if (input.compatibility) {
    data.compatibility = input.compatibility;
  } else {
    delete data.compatibility;
  }

  if (input.invocationMode === 'manual-only') {
    data['disable-model-invocation'] = true;
  } else {
    delete data['disable-model-invocation'];
  }

  const frontmatter = YAML.stringify(data).trimEnd();
  const normalizedBody = body.replace(/^\n+/u, '');
  return `---\n${frontmatter}\n---${normalizedBody ? `\n\n${normalizedBody}` : '\n'}`;
}

export function buildSkillDraftFiles(options: SkillDraftOptions): SkillDraftFile[] {
  const files: SkillDraftFile[] = [{ relativePath: 'SKILL.md', content: options.rawContent }];

  if (options.includeReferences) {
    files.push({
      relativePath: 'references/README.md',
      content: '# References\n\nAdd supporting docs, examples, or links for this skill.\n',
    });
  }

  if (options.includeScripts) {
    files.push({
      relativePath: 'scripts/README.md',
      content: '# Scripts\n\nAdd optional helper scripts used by this skill.\n',
    });
  }

  if (options.includeAssets) {
    files.push({
      relativePath: 'assets/README.md',
      content: '# Assets\n\nStore screenshots or other bundled assets here.\n',
    });
  }

  return files;
}
