import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  getPrismaTransactionClient,
  PRISMA_DATABASE_CLIENT,
  type PrismaDatabaseClient,
} from "@agent-teams-control-plane/platform-database";
import {
  createSafeError,
  isSafeError,
  parseAgentActionId,
  parseDesktopClientId,
  parseExternalActionContentId,
  parseWorkspaceId,
  toSafeError,
  toUnixMilliseconds,
  type SafeError,
} from "@agent-teams-control-plane/shared";

import type {
  GitHubActionAttribution,
  GitHubActionAttemptStatus,
  GitHubActionRequest,
  GitHubActionStatus,
  GitHubActionType,
  TrustedRequestSubjectKind,
} from "../../domain/index.js";
import type {
  CreateGitHubActionRequestInput,
  CreateGitHubActionRequestResult,
  GitHubActionDispatchView,
  GitHubActionRepository,
} from "../../application/ports/github-action.repository.js";
import type { TransactionContext } from "../../application/ports/transaction-runner.js";

type GitHubActionRequestRow = {
  id: string;
  workspaceId: string;
  integrationTargetId: string;
  actionType: string;
  requestedBySubjectKind: string;
  requestedBySubjectId: string;
  assertedByDesktopClientId: string;
  agentId: string | null;
  agentDisplayName: string;
  agentAvatarUrl: string | null;
  teamId: string | null;
  teamDisplayName: string | null;
  idempotencyKey: string;
  status: string;
  externalContentRefId: string;
  externalContentIntegrityHash: string;
  githubDeliveryId: string | null;
  githubCheckRunId: string | null;
  githubUrl: string | null;
  contentShreddedAt: Date | null;
  safeErrorJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    attempts: number;
  };
};

type DispatchRow = GitHubActionRequestRow & {
  integrationTarget: {
    status: string;
    githubRepositoryBinding: {
      displayOwner: string;
      displayName: string;
      displayFullName: string;
    } | null;
  };
};

@Injectable()
export class PrismaGitHubActionRepository implements GitHubActionRepository {
  public constructor(
    @Inject(PRISMA_DATABASE_CLIENT)
    private readonly databaseClient: PrismaDatabaseClient,
  ) {}

  public async findByIdempotency(input: {
    workspaceId: GitHubActionRequest["workspaceId"];
    idempotencyKey: string;
  }): Promise<GitHubActionRequest | undefined> {
    const row = await this.databaseClient.getClient().gitHubActionRequest.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
        workspaceId: input.workspaceId,
      },
    });
    return row === null ? undefined : mapRequest(row as GitHubActionRequestRow);
  }

  public async createQueued(
    input: CreateGitHubActionRequestInput,
    context: TransactionContext,
  ): Promise<CreateGitHubActionRequestResult> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionRequest.createMany({
      data: {
        actionType: input.actionType,
        agentDisplayName: input.attribution.agentDisplayName.trim(),
        assertedByDesktopClientId: input.assertedByDesktopClientId,
        externalContentIntegrityHash: input.externalContentIntegrityHash,
        externalContentRefId: input.externalContentRefId,
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        integrationTargetId: input.integrationTargetId,
        requestedBySubjectId: input.requestedBySubjectId,
        requestedBySubjectKind: input.requestedBySubjectKind,
        status: "queued",
        workspaceId: input.workspaceId,
        ...(input.attribution.agentAvatarUrl === undefined
          ? {}
          : { agentAvatarUrl: input.attribution.agentAvatarUrl }),
        ...(input.attribution.agentId === undefined
          ? {}
          : { agentId: input.attribution.agentId }),
        ...(input.attribution.teamDisplayName === undefined
          ? {}
          : { teamDisplayName: input.attribution.teamDisplayName.trim() }),
        ...(input.attribution.teamId === undefined
          ? {}
          : { teamId: input.attribution.teamId }),
      },
      skipDuplicates: true,
    });
    const row = await client.gitHubActionRequest.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
        workspaceId: input.workspaceId,
      },
    });
    if (row === null) {
      throw createSafeError({
        category: "internal",
        code: "CONTROL_PLANE_GITHUB_ACTION_CREATE_FAILED",
        message: "GitHub action request could not be created.",
      });
    }
    return {
      created: row.id === input.id,
      request: mapRequest(row as GitHubActionRequestRow),
    };
  }

  public async findStatus(input: {
    workspaceId: GitHubActionRequest["workspaceId"];
    actionRequestId: GitHubActionRequest["id"];
  }): Promise<GitHubActionRequest | undefined> {
    const row = await this.databaseClient.getClient().gitHubActionRequest.findFirst({
      include: {
        _count: {
          select: {
            attempts: true,
          },
        },
      },
      where: {
        id: input.actionRequestId,
        workspaceId: input.workspaceId,
      },
    });
    return row === null ? undefined : mapRequest(row as GitHubActionRequestRow);
  }

  public async findForDispatch(input: {
    actionRequestId: GitHubActionRequest["id"];
  }): Promise<GitHubActionDispatchView | undefined> {
    const row = await this.databaseClient.getClient().gitHubActionRequest.findUnique({
      include: {
        integrationTarget: {
          include: {
            githubRepositoryBinding: true,
          },
        },
      },
      where: { id: input.actionRequestId },
    });
    if (row === null) {
      return undefined;
    }
    const dispatchRow = row as DispatchRow;
    const binding = dispatchRow.integrationTarget.githubRepositoryBinding;
    if (binding === null) {
      throw createSafeError({
        category: "internal",
        code: "CONTROL_PLANE_GITHUB_ACTION_TARGET_BINDING_MISSING",
        message: "GitHub action target binding is missing.",
      });
    }
    return {
      request: mapRequest(dispatchRow),
      target: {
        displayFullName: binding.displayFullName,
        owner: binding.displayOwner,
        repo: binding.displayName,
        status: dispatchRow.integrationTarget.status,
      },
    };
  }

  public async recordAttemptStarted(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      attemptNumber: number;
      startedAtMs: number;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionAttempt.createMany({
      data: {
        attemptNumber: input.attemptNumber,
        githubActionRequestId: input.actionRequestId,
        id: randomUUID(),
        startedAt: new Date(input.startedAtMs),
        status: "started",
      },
      skipDuplicates: true,
    });
  }

  public async finishAttempt(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      attemptNumber: number;
      status: GitHubActionAttemptStatus;
      finishedAtMs: number;
      safeError?: SafeError;
      githubStatusCode?: number;
      githubRequestId?: string;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionAttempt.updateMany({
      data: {
        finishedAt: new Date(input.finishedAtMs),
        status: input.status,
        ...(input.githubRequestId === undefined
          ? {}
          : { githubRequestId: input.githubRequestId }),
        ...(input.githubStatusCode === undefined
          ? {}
          : { githubStatusCode: input.githubStatusCode }),
        ...(input.safeError === undefined
          ? {}
          : { safeErrorJson: safeErrorJson(input.safeError) }),
      },
      where: {
        attemptNumber: input.attemptNumber,
        githubActionRequestId: input.actionRequestId,
      },
    });
  }

  public async markDispatching(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      nowMs: number;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionRequest.updateMany({
      data: {
        status: "dispatching",
        updatedAt: new Date(input.nowMs),
      },
      where: {
        id: input.actionRequestId,
        status: { in: ["queued", "dispatching"] },
      },
    });
  }

  public async markSucceeded(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      nowMs: number;
      githubDeliveryId?: string;
      githubCheckRunId?: string;
      githubUrl?: string;
      contentShredded: boolean;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionRequest.update({
      data: {
        ...(input.contentShredded ? { contentShreddedAt: new Date(input.nowMs) } : {}),
        ...(input.githubCheckRunId === undefined
          ? {}
          : { githubCheckRunId: input.githubCheckRunId }),
        ...(input.githubDeliveryId === undefined
          ? {}
          : { githubDeliveryId: input.githubDeliveryId }),
        ...(input.githubUrl === undefined ? {} : { githubUrl: input.githubUrl }),
        status: "succeeded",
        updatedAt: new Date(input.nowMs),
      },
      where: { id: input.actionRequestId },
    });
    await client.$executeRaw`
      UPDATE github_action_requests
      SET safe_error_json = NULL
      WHERE id = ${input.actionRequestId}::uuid
    `;
  }

  public async markRetryableFailure(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      nowMs: number;
      safeError: SafeError;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionRequest.update({
      data: {
        safeErrorJson: safeErrorJson(input.safeError),
        status: "queued",
        updatedAt: new Date(input.nowMs),
      },
      where: { id: input.actionRequestId },
    });
  }

  public async markTerminalFailure(
    input: {
      actionRequestId: GitHubActionRequest["id"];
      nowMs: number;
      status: "failed" | "dead_lettered";
      safeError: SafeError;
      contentShredded: boolean;
    },
    context: TransactionContext,
  ): Promise<void> {
    const client = getPrismaTransactionClient(context);
    await client.gitHubActionRequest.update({
      data: {
        ...(input.contentShredded ? { contentShreddedAt: new Date(input.nowMs) } : {}),
        safeErrorJson: safeErrorJson(input.safeError),
        status: input.status,
        updatedAt: new Date(input.nowMs),
      },
      where: { id: input.actionRequestId },
    });
  }
}

function mapRequest(row: GitHubActionRequestRow): GitHubActionRequest {
  const id = parseAgentActionId(row.id);
  const workspaceId = parseWorkspaceId(row.workspaceId);
  const desktopClientId = parseDesktopClientId(row.assertedByDesktopClientId);
  const contentId = parseExternalActionContentId(row.externalContentRefId);
  if (!id.ok) {
    throw id.error;
  }
  if (!workspaceId.ok) {
    throw workspaceId.error;
  }
  if (!desktopClientId.ok) {
    throw desktopClientId.error;
  }
  if (!contentId.ok) {
    throw contentId.error;
  }
  return {
    actionType: row.actionType as GitHubActionType,
    assertedByDesktopClientId: desktopClientId.value,
    attribution: mapAttribution(row),
    createdAtMs: toUnixMilliseconds(row.createdAt.getTime()),
    externalContentIntegrityHash: row.externalContentIntegrityHash,
    externalContentRefId: contentId.value,
    id: id.value,
    idempotencyKey: row.idempotencyKey,
    integrationTargetId: row.integrationTargetId,
    requestedBySubjectId: row.requestedBySubjectId,
    requestedBySubjectKind: row.requestedBySubjectKind as TrustedRequestSubjectKind,
    status: row.status as GitHubActionStatus,
    updatedAtMs: toUnixMilliseconds(row.updatedAt.getTime()),
    workspaceId: workspaceId.value,
    ...(row.contentShreddedAt === null
      ? {}
      : { contentShreddedAtMs: toUnixMilliseconds(row.contentShreddedAt.getTime()) }),
    ...(row.githubCheckRunId === null ? {} : { githubCheckRunId: row.githubCheckRunId }),
    ...(row.githubDeliveryId === null ? {} : { githubDeliveryId: row.githubDeliveryId }),
    ...(row.githubUrl === null ? {} : { githubUrl: row.githubUrl }),
    ...(row._count === undefined ? {} : { attemptCount: row._count.attempts }),
    ...mapSafeError(row.safeErrorJson),
  };
}

function mapAttribution(row: GitHubActionRequestRow): GitHubActionAttribution {
  return {
    agentDisplayName: row.agentDisplayName,
    ...(row.agentAvatarUrl === null ? {} : { agentAvatarUrl: row.agentAvatarUrl }),
    ...(row.agentId === null ? {} : { agentId: row.agentId }),
    ...(row.teamDisplayName === null ? {} : { teamDisplayName: row.teamDisplayName }),
    ...(row.teamId === null ? {} : { teamId: row.teamId }),
  };
}

function mapSafeError(value: unknown): { safeError?: SafeError } {
  if (value === null || value === undefined) {
    return {};
  }
  if (isSafeError(value)) {
    return { safeError: value };
  }
  return { safeError: toSafeError(value) };
}

function safeErrorJson(safeError: SafeError) {
  return {
    category: safeError.category,
    code: safeError.code,
    message: safeError.message,
    retryable: safeError.retryable,
    ...(safeError.safeDetails === undefined
      ? {}
      : { safeDetails: safeError.safeDetails }),
  };
}
