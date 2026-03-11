import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  SkillDeleteRequest,
  SkillDetail,
  SkillImportRequest,
  SkillReviewPreview,
  SkillUpsertRequest,
} from '@shared/types/extensions';
import { shell } from 'electron';

import { isPathWithinRoot, validateFileName } from '@main/utils/pathValidation';

import { SkillImportService } from './SkillImportService';
import { SkillReviewService } from './SkillReviewService';
import { SkillScaffoldService } from './SkillScaffoldService';
import { SkillRootsResolver } from './SkillRootsResolver';
import { SkillsCatalogService } from './SkillsCatalogService';

export class SkillsMutationService {
  constructor(
    private readonly rootsResolver = new SkillRootsResolver(),
    private readonly catalogService = new SkillsCatalogService(),
    private readonly scaffoldService = new SkillScaffoldService(rootsResolver),
    private readonly importService = new SkillImportService(),
    private readonly reviewService = new SkillReviewService()
  ) {}

  async previewUpsert(request: SkillUpsertRequest): Promise<SkillReviewPreview> {
    const targetSkillDir = await this.scaffoldService.resolveUpsertTarget(
      request.scope,
      request.rootKind,
      request.projectPath,
      request.folderName,
      request.existingSkillId
    );
    const files = this.scaffoldService.normalizeDraftFiles(request.files);
    const changes = await this.reviewService.buildTextChanges(targetSkillDir, files);
    return {
      targetSkillDir,
      changes,
      warnings: [],
    };
  }

  async applyUpsert(request: SkillUpsertRequest): Promise<SkillDetail | null> {
    const targetSkillDir = await this.scaffoldService.resolveUpsertTarget(
      request.scope,
      request.rootKind,
      request.projectPath,
      request.folderName,
      request.existingSkillId
    );
    const files = this.scaffoldService.normalizeDraftFiles(request.files);
    await this.scaffoldService.writeTextFiles(targetSkillDir, files);

    return this.catalogService.getDetail(targetSkillDir, request.projectPath);
  }

  async previewImport(request: SkillImportRequest): Promise<SkillReviewPreview> {
    const { sourceDir, targetSkillDir } = await this.resolveImportTarget(request);
    const sourceFiles = await this.importService.readSourceFiles(sourceDir);
    const changes = await this.reviewService.buildImportChanges(targetSkillDir, sourceFiles);
    const warnings = changes.some((change) => change.isBinary)
      ? ['This import includes binary files. Binary files will be copied as-is.']
      : [];

    return {
      targetSkillDir,
      changes,
      warnings,
    };
  }

  async applyImport(request: SkillImportRequest): Promise<SkillDetail | null> {
    const { sourceDir, targetSkillDir } = await this.resolveImportTarget(request);
    const sourceFiles = await this.importService.readSourceFiles(sourceDir);
    await this.importService.writeImportedFiles(targetSkillDir, sourceFiles);

    return this.catalogService.getDetail(targetSkillDir, request.projectPath);
  }

  async deleteSkill(request: SkillDeleteRequest): Promise<void> {
    const skillDir = this.resolveExistingSkill(request.skillId, request.projectPath);
    await shell.trashItem(skillDir);
  }

  private async resolveImportTarget(
    request: SkillImportRequest
  ): Promise<{ sourceDir: string; targetSkillDir: string }> {
    const sourceDir = await this.importService.validateSourceDir(request.sourceDir);

    const root = this.resolveWritableRoot(request.scope, request.rootKind, request.projectPath);
    await fs.mkdir(root.rootPath, { recursive: true });

    const folderName = request.folderName?.trim() || path.basename(sourceDir);
    const folderValidation = validateFileName(folderName);
    if (!folderValidation.valid) {
      throw new Error(folderValidation.error ?? 'Invalid folder name');
    }

    const targetSkillDir = path.join(root.rootPath, folderName);
    if (!isPathWithinRoot(targetSkillDir, root.rootPath)) {
      throw new Error('Import destination is outside the allowed root');
    }

    return { sourceDir, targetSkillDir };
  }

  private resolveWritableRoot(
    scope: SkillUpsertRequest['scope'],
    rootKind: SkillUpsertRequest['rootKind'],
    projectPath?: string
  ) {
    const roots = this.rootsResolver.resolve(projectPath);
    const match = roots.find((root) => root.scope === scope && root.rootKind === rootKind);
    if (!match) {
      throw new Error('Requested skill root is unavailable');
    }
    if (scope === 'project' && !projectPath) {
      throw new Error('projectPath is required for project-scoped skills');
    }
    return match;
  }

  private resolveExistingSkill(skillId: string, projectPath?: string): string {
    const normalizedSkillDir = path.resolve(skillId);
    const roots = this.rootsResolver.resolve(projectPath);
    const owningRoot = roots.find((root) => isPathWithinRoot(normalizedSkillDir, root.rootPath));
    if (!owningRoot) {
      throw new Error('Skill is outside the allowed roots');
    }
    return normalizedSkillDir;
  }
}
