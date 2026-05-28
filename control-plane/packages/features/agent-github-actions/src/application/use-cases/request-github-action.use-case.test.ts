import { describe, expect, it } from "vitest";

import { FixedClock, toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import type { GitHubActionContentStore } from "../ports/github-action-content-store.port.js";
import type { GitHubActionOutbox } from "../ports/github-action-outbox.port.js";
import type { GitHubActionRepository } from "../ports/github-action.repository.js";
import type { AgentGitHubActionsAuditLog } from "../ports/policies.js";
import { RequestGitHubActionUseCase } from "./request-github-action.use-case.js";

describe("RequestGitHubActionUseCase", () => {
  it("stores encrypted content and enqueues an id-only outbox event after policy allow", async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute(validInput());

    expect(result).toEqual({
      actionRequestId: "action-1",
      idempotent: false,
      status: "queued",
    });
    expect(harness.storedPlaintexts[0]).toContain("Hello GitHub");
    expect(harness.outboxPayloads).toEqual([
      {
        actionRequestId: "action-1",
        contentIntegrityHash: "sha-1",
        contentRefId: "content-1",
        workspaceId: "workspace-1",
      },
    ]);
    expect(JSON.stringify(harness.outboxPayloads)).not.toContain("Hello GitHub");
  });

  it("returns an existing action for duplicate request ids without storing content again", async () => {
    const harness = createHarness();
    await harness.useCase.execute(validInput());
    const result = await harness.useCase.execute(validInput());

    expect(result.idempotent).toBe(true);
    expect(result.actionRequestId).toBe("action-1");
    expect(harness.storedPlaintexts).toHaveLength(1);
  });

  it("denies before content storage when target policy rejects", async () => {
    const harness = createHarness({ policyAllowed: false });

    await expect(harness.useCase.execute(validInput())).rejects.toMatchObject({
      code: "CONTROL_PLANE_TARGET_POLICY_DENIED",
    });
    expect(harness.storedPlaintexts).toHaveLength(0);
  });

  it("derives desktop-client requestedBy subject from the authenticated actor", async () => {
    const harness = createHarness();

    await harness.useCase.execute({
      ...validInput(),
      requestedBy: {
        subjectId: "desktop-client:spoofed",
        subjectKind: "desktop_client",
      },
    });

    expect(harness.policyInputs[0]).toMatchObject({
      desktopClientSubjectId: "desktop-client:desktop-1",
      subjectId: "desktop-client:desktop-1",
      subjectKind: "desktop_client",
    });
    expect(harness.createdRequests[0]).toMatchObject({
      requestedBySubjectId: "desktop-client:desktop-1",
      requestedBySubjectKind: "desktop_client",
    });
  });
});

function createHarness(input: { policyAllowed?: boolean } = {}) {
  const requests = new Map<
    string,
    Awaited<ReturnType<GitHubActionRepository["findByIdempotency"]>>
  >();
  const storedPlaintexts: string[] = [];
  const createdRequests: Array<Parameters<GitHubActionRepository["createQueued"]>[0]> =
    [];
  const policyInputs: Array<{
    desktopClientSubjectId: string | undefined;
    subjectId: string;
    subjectKind: string;
  }> = [];
  const outboxPayloads: Array<{
    actionRequestId: string;
    contentRefId: string;
    contentIntegrityHash: string;
    workspaceId: string;
  }> = [];
  const ids = ["action-1", "content-1"];
  const repository: GitHubActionRepository = {
    createQueued: async (request) => {
      createdRequests.push(request);
      const existing = requests.get(`${request.workspaceId}:${request.idempotencyKey}`);
      if (existing !== undefined) {
        return { created: false, request: existing };
      }
      const created = {
        actionType: request.actionType,
        assertedByDesktopClientId: request.assertedByDesktopClientId,
        attribution: request.attribution,
        createdAtMs: toUnixMilliseconds(0),
        externalContentIntegrityHash: request.externalContentIntegrityHash,
        externalContentRefId: request.externalContentRefId,
        id: request.id,
        idempotencyKey: request.idempotencyKey,
        integrationTargetId: request.integrationTargetId,
        requestedBySubjectId: request.requestedBySubjectId,
        requestedBySubjectKind: request.requestedBySubjectKind,
        status: "queued" as const,
        updatedAtMs: toUnixMilliseconds(0),
        workspaceId: request.workspaceId,
      };
      requests.set(`${request.workspaceId}:${request.idempotencyKey}`, created);
      return { created: true, request: created };
    },
    findByIdempotency: async ({ idempotencyKey, workspaceId }) =>
      requests.get(`${workspaceId}:${idempotencyKey}`),
    findForDispatch: async () => undefined,
    findStatus: async () => undefined,
    finishAttempt: async () => undefined,
    markDispatching: async () => undefined,
    markRetryableFailure: async () => undefined,
    markSucceeded: async () => undefined,
    markTerminalFailure: async () => undefined,
    recordAttemptStarted: async () => undefined,
  };
  const contentStore: GitHubActionContentStore = {
    load: async () => ({ plaintext: new Uint8Array() }),
    shred: async () => undefined,
    store: async (content) => {
      storedPlaintexts.push(new TextDecoder().decode(content.plaintext));
      return { ciphertextSha256: "sha-1", id: content.id };
    },
  };
  const outbox: GitHubActionOutbox = {
    enqueueDispatch: async (event) => {
      outboxPayloads.push({
        actionRequestId: event.actionRequestId,
        contentIntegrityHash: event.contentIntegrityHash,
        contentRefId: event.contentRefId,
        workspaceId: event.workspaceId,
      });
    },
  };
  const auditLog: AgentGitHubActionsAuditLog = {
    record: async () => undefined,
  };
  return {
    createdRequests,
    outboxPayloads,
    policyInputs,
    storedPlaintexts,
    useCase: new RequestGitHubActionUseCase(
      { assertEnabled: async () => undefined, isEnabled: () => true },
      {
        agentAvatarAllowedOrigins: () => ["https://cdn.example.test"],
        defaultAgentAvatarUrl: () => "https://cdn.example.test/default.png",
        externalContentRetentionDays: () => 3,
        githubGraphqlEndpoint: () => undefined,
        githubRestApiVersion: () => "2022-11-28",
      },
      {
        evaluate: async (policyInput) => {
          policyInputs.push({
            desktopClientSubjectId: policyInput.desktopClientSubjectId,
            subjectId: policyInput.subjectId,
            subjectKind: policyInput.subjectKind,
          });
          return {
            allowed: input.policyAllowed ?? true,
            policyVersion: 1,
            reasonCode: "CONTROL_PLANE_TARGET_POLICY_DENIED",
          };
        },
      },
      contentStore,
      repository,
      outbox,
      { runInTransaction: async (work) => work({ transactionId: "tx" } as never) },
      { uuid: () => ids.shift() ?? "extra-id" },
      auditLog,
      new FixedClock(0),
    ),
  };
}

function validInput() {
  return {
    actionType: "github.issue_comment.create",
    actor: {
      credentialId: "credential-1",
      desktopClientId: "desktop-1" as never,
      workspaceId: "workspace-1" as never,
    },
    attribution: {
      agentDisplayName: "Review Agent",
      teamDisplayName: "Code Team",
    },
    payload: {
      body: "Hello GitHub",
      issueNumber: 7,
    },
    requestId: "request-1",
    requestedBy: {
      agentId: "agent:reviewer",
      subjectId: "agent:reviewer",
      subjectKind: "agent",
      teamId: "team:code",
    },
    targetId: "target-1",
  } as const;
}
