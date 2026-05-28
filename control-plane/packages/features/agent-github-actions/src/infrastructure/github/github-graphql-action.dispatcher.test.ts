import { createSafeError } from "@agent-teams-control-plane/shared";
import { describe, expect, it } from "vitest";

import type { GitHubActionDispatcher } from "../../application/ports/github-action-dispatcher.port.js";
import { GitHubGraphQLActionDispatcher } from "./github-graphql-action.dispatcher.js";
import type {
  GitHubGraphQLClient,
  GitHubGraphQLResult,
} from "./github-graphql.client.js";

describe("GitHubGraphQLActionDispatcher", () => {
  it("creates issue comments through GraphQL with resolved issue node ids", async () => {
    const client = new FakeGraphQLClient([
      success({
        repository: {
          issue: {
            id: "I_issue_1",
          },
        },
      }),
      success({
        addComment: {
          commentEdge: {
            node: {
              id: "IC_comment_1",
              url: "https://github.com/octo/repo/issues/7#issuecomment-1",
            },
          },
        },
      }),
    ]);
    const dispatcher = new GitHubGraphQLActionDispatcher(client);

    await expect(
      dispatcher.dispatch(
        dispatchInput({
          actionType: "github.issue_comment.create",
          payload: { body: "raw", issueNumber: 7 },
          renderedBody: "rendered body",
        }),
      ),
    ).resolves.toMatchObject({
      githubDeliveryId: "IC_comment_1",
      githubRequestId: "request-2",
      githubStatusCode: 200,
      githubUrl: "https://github.com/octo/repo/issues/7#issuecomment-1",
      kind: "success",
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]).toMatchObject({
      operationName: "AgentTeamsIssueCommentTarget",
      variables: {
        number: 7,
        owner: "octo",
        repo: "repo",
      },
    });
    expect(client.calls[1]).toMatchObject({
      operationName: "AgentTeamsAddComment",
      variables: {
        body: "rendered body",
        clientMutationId: "action-1",
        subjectId: "I_issue_1",
      },
    });
  });

  it("creates pull request reviews through GraphQL with COMMENT events", async () => {
    const client = new FakeGraphQLClient([
      success({
        repository: {
          pullRequest: {
            id: "PR_pull_1",
          },
        },
      }),
      success({
        addPullRequestReview: {
          pullRequestReview: {
            id: "PRR_review_1",
            url: "https://github.com/octo/repo/pull/9#pullrequestreview-1",
          },
        },
      }),
    ]);
    const dispatcher = new GitHubGraphQLActionDispatcher(client);

    await expect(
      dispatcher.dispatch(
        dispatchInput({
          actionType: "github.pull_request_review.create",
          payload: {
            body: "raw",
            event: "COMMENT",
            pullRequestNumber: 9,
          },
          renderedBody: "rendered review",
        }),
      ),
    ).resolves.toMatchObject({
      githubDeliveryId: "PRR_review_1",
      githubUrl: "https://github.com/octo/repo/pull/9#pullrequestreview-1",
      kind: "success",
    });

    expect(client.calls[1]?.query).toContain("addPullRequestReview");
    expect(client.calls[1]?.query).toContain("event: COMMENT");
    expect(client.calls[1]).toMatchObject({
      variables: {
        body: "rendered review",
        clientMutationId: "action-1",
        pullRequestId: "PR_pull_1",
      },
    });
  });

  it("does not retry unknown mutation transport results", async () => {
    const client = new FakeGraphQLClient([
      success({
        repository: {
          issue: {
            id: "I_issue_1",
          },
        },
      }),
      failure({
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_TRANSPORT_FAILED",
        message: "GitHub GraphQL transport failed.",
        retryable: true,
      }),
    ]);
    const dispatcher = new GitHubGraphQLActionDispatcher(client);

    await expect(
      dispatcher.dispatch(
        dispatchInput({
          actionType: "github.issue_comment.create",
          payload: { body: "raw", issueNumber: 7 },
          renderedBody: "rendered body",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failure",
      safeError: {
        code: "CONTROL_PLANE_GITHUB_ACTION_UNKNOWN_RESULT",
        retryable: false,
      },
    });
  });

  it("keeps query rate limits retryable at action level", async () => {
    const client = new FakeGraphQLClient([
      failure({
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_RATE_LIMITED",
        message: "GitHub GraphQL request was rate limited.",
        retryable: true,
        retryAfterMs: 80_000,
      }),
    ]);
    const dispatcher = new GitHubGraphQLActionDispatcher(client);

    await expect(
      dispatcher.dispatch(
        dispatchInput({
          actionType: "github.issue_comment.create",
          payload: { body: "raw", issueNumber: 7 },
          renderedBody: "rendered body",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failure",
      retryAfterMs: 80_000,
      safeError: {
        code: "CONTROL_PLANE_GITHUB_ACTION_RATE_LIMITED",
        retryable: true,
      },
    });
  });

  it("fails closed when the target node cannot be resolved", async () => {
    const client = new FakeGraphQLClient([
      success({
        repository: {
          issue: null,
        },
      }),
    ]);
    const dispatcher = new GitHubGraphQLActionDispatcher(client);

    await expect(
      dispatcher.dispatch(
        dispatchInput({
          actionType: "github.issue_comment.create",
          payload: { body: "raw", issueNumber: 7 },
          renderedBody: "rendered body",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failure",
      safeError: {
        code: "CONTROL_PLANE_GITHUB_ACTION_RESOURCE_NOT_FOUND",
      },
    });
  });
});

class FakeGraphQLClient implements GitHubGraphQLClient {
  public readonly calls: Array<Parameters<GitHubGraphQLClient["request"]>[0]> = [];

  public constructor(private readonly results: Array<GitHubGraphQLResult<unknown>>) {}

  public request<TData>(
    input: Parameters<GitHubGraphQLClient["request"]>[0],
  ): Promise<GitHubGraphQLResult<TData>> {
    this.calls.push(input);
    const result = this.results.shift();
    if (result === undefined) {
      throw new Error("Unexpected GraphQL request.");
    }
    return Promise.resolve(result as GitHubGraphQLResult<TData>);
  }
}

function dispatchInput(
  overrides: Pick<
    Parameters<GitHubActionDispatcher["dispatch"]>[0],
    "actionType" | "payload" | "renderedBody"
  >,
): Parameters<GitHubActionDispatcher["dispatch"]>[0] {
  return {
    actionRequestId: "action-1",
    target: { owner: "octo", repo: "repo" },
    tokenLease: {
      expiresAtMs: 1000,
      githubInstallationId: "installation-1",
      token: "secret-token",
    },
    ...overrides,
  };
}

function success<TData>(data: TData): GitHubGraphQLResult<TData> {
  return {
    data,
    githubRequestId: `request-${successRequestCounter.next()}`,
    githubStatusCode: 200,
    kind: "success",
  };
}

function failure(input: {
  code: string;
  message: string;
  retryable?: boolean;
  retryAfterMs?: number;
}): GitHubGraphQLResult<unknown> {
  return {
    githubRequestId: "request-failure",
    githubStatusCode: 403,
    kind: "failure",
    ...(input.retryAfterMs === undefined ? {} : { retryAfterMs: input.retryAfterMs }),
    safeError: createSafeError({
      category: "external",
      code: input.code,
      message: input.message,
      retryable: input.retryable ?? false,
    }),
  };
}

const successRequestCounter = {
  value: 0,
  next() {
    this.value += 1;
    return this.value;
  },
};
