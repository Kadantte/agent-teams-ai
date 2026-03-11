import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { validateOpenPathUserSelected } from '@main/utils/pathValidation';
import { isBinaryFile } from 'isbinaryfile';

import { SkillScanner } from './SkillScanner';

export interface ImportedSkillSourceFile {
  relativePath: string;
  absolutePath: string;
  content: string | null;
  isBinary: boolean;
}

export class SkillImportService {
  constructor(private readonly scanner = new SkillScanner()) {}

  async validateSourceDir(sourceDir: string): Promise<string> {
    const validatedSource = validateOpenPathUserSelected(sourceDir);
    if (!validatedSource.valid || !validatedSource.normalizedPath) {
      throw new Error(validatedSource.error ?? 'Invalid import source');
    }

    const normalizedSourceDir = validatedSource.normalizedPath;
    const sourceStat = await fs.stat(normalizedSourceDir);
    if (!sourceStat.isDirectory()) {
      throw new Error('Import source must be a directory');
    }

    const detectedSkillFile = await this.scanner.detectSkillFile(normalizedSourceDir);
    if (!detectedSkillFile) {
      throw new Error('Import source does not contain a valid skill file');
    }

    return normalizedSourceDir;
  }

  async readSourceFiles(sourceDir: string): Promise<ImportedSkillSourceFile[]> {
    const entries = await this.walkDirectory(sourceDir);
    return Promise.all(
      entries.map(async (absolutePath) => {
        const relativePath = path.relative(sourceDir, absolutePath).replace(/\\/g, '/');
        const binary = await isBinaryFile(absolutePath);
        return {
          relativePath,
          absolutePath,
          content: binary ? null : await fs.readFile(absolutePath, 'utf8'),
          isBinary: binary,
        };
      })
    );
  }

  async writeImportedFiles(
    targetSkillDir: string,
    files: ImportedSkillSourceFile[]
  ): Promise<void> {
    for (const file of files) {
      const destPath = path.join(targetSkillDir, file.relativePath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      if (file.isBinary) {
        await fs.copyFile(file.absolutePath, destPath);
      } else {
        await fs.writeFile(destPath, file.content ?? '', 'utf8');
      }
    }
  }

  private async walkDirectory(rootDir: string): Promise<string[]> {
    const dirEntries = await fs.readdir(rootDir, { withFileTypes: true });
    const results = await Promise.all(
      dirEntries.map(async (entry) => {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
          return this.walkDirectory(fullPath);
        }
        return [fullPath];
      })
    );
    return results.flat().sort((a, b) => a.localeCompare(b));
  }
}
