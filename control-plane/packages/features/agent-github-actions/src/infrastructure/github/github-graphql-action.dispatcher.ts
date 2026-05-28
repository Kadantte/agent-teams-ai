import {
  createSafeError,
  isSafeError,
  type SafeError,
} from "@agent-teams-control-plane/shared";

import type {
  GitHubIssueCommentCreatePayload,
  GitHubPullRequestReviewCreatePayload,
  GitHubPullRequestTopLevelCommentCreatePayload,
} from "../../domain/index.js";
import type {
  GitHubActionDispatchFailure,
  GitHubActionDispatchResult,
  GitHubActionDispatcher,
} from "../../application/ports/github-action-dispatcher.port.js";
import type {
  GitHubGraphQLClient,
  GitHubGraphQLFailure,
} from "./github-graphql.client.js";

type IssueCommentTargetResponse = Readonly<{
  repository?: {
    issue?: {
      id: string;
    } | null;
  } | null;
}>;

type PullRequestTargetResponse = Readonly<{
  repository?: {
    pullRequest?: {
      id: string;
    } | null;
  } | null;
}>;

type AddCommentResponse = Readonly<{
  addComment?: {
    commentEdge?: {
      node?: {
        id: string;
        url?: string | null;
      } | null;
    } | null;
  } | null;
}>;

type AddPullRequestReviewResponse = Readonly<{
  addPullRequestReview?: {
    pullRequestReview?: {
      id: string;
      url?: string | null;
    } | null;
  } | null;
}>;

const issueCommentTargetQuery = `
  query AgentTeamsIssueCommentTarget($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
      }
    }
  }
`;

const pullRequestTargetQuery = `
  query AgentTeamsPullRequestTarget($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
      }
    }
  }
`;

const addCommentMutation = `
  mutation AgentTeamsAddComment($subjectId: ID!, $body: String!, $clientMutationId: String!) {
    addComment(input: { subjectId: $subjectId, body: $body, clientMutationId: $clientMutationId }) {
      commentEdge {
        node {
          id
          url
        }
      }
    }
  }
`;

const addPullRequestReviewMutation = `
  mutation AgentTeamsAddPullRequestReview($pullRequestId: ID!, $body: String!, $clientMutationId: String!) {
    addPullRequestReview(input: { pullRequestId: $pullRequestId, body: $body, event: COMMENT, clientMutationId: $clientMutationId }) {
      pullRequestReview {
        id
        url
      }
    }
  }
`;

export class GitHubGraphQLActionDispatcher implements GitHubActionDispatcher {
  public constructor(private readonly client: GitHubGraphQLClient) {}

  public async dispatch(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
  ): Promise<GitHubActionDispatchResult> {
    try {
      if (input.actionType === "github.issue_comment.create") {
        const payload = input.payload as GitHubIssueCommentCreatePayload;
        return this.createIssueComment(input, payload);
      }
      if (input.actionType === "github.pull_request_comment.create_top_level") {
        const payload = input.payload as GitHubPullRequestTopLevelCommentCreatePayload;
        return this.createPullRequestTopLevelComment(input, payload);
      }
      if (input.actionType === "github.pull_request_review.create") {
        const payload = input.payload as GitHubPullRequestReviewCreatePayload;
        return this.createPullRequestReview(input, payload);
      }
      return actionFailure({
        code: "CONTROL_PLANE_GITHUB_ACTION_TYPE_UNSUPPORTED_BY_GRAPHQL",
        message: "GitHub action type is not supported by the GraphQL dispatcher.",
      });
    } catch (error) {
      if (isSafeError(error)) {
        return {
          kind: "failure",
          safeError: error,
        };
      }
      return actionFailure({
        code: "CONTROL_PLANE_GITHUB_ACTION_TRANSPORT_FAILED",
        message: "GitHub action transport failed.",
        retryable: true,
      });
    }
  }

  private async createIssueComment(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
    payload: GitHubIssueCommentCreatePayload,
  ): Promise<GitHubActionDispatchResult> {
    const renderedBody = requireRenderedBody(input.renderedBody);
    const target = await this.client.request<IssueCommentTargetResponse>({
      operationName: "AgentTeamsIssueCommentTarget",
      query: issueCommentTargetQuery,
      token: input.tokenLease.token,
      variables: {
        number: payload.issueNumber,
        owner: input.target.owner,
        repo: input.target.repo,
      },
    });
    if (target.kind === "failure") {
      return mapGraphQLFailureToActionFailure({
        failure: target,
        mutationAttempted: false,
      });
    }

    const subjectId = target.data.repository?.issue?.id;
    if (subjectId === undefined) {
      return targetResourceNotFoundFailure({
        requestId: target.githubRequestId,
        status: target.githubStatusCode,
      });
    }

    const result = await this.client.request<AddCommentResponse>({
      operationName: "AgentTeamsAddComment",
      query: addCommentMutation,
      token: input.tokenLease.token,
      variables: {
        body: renderedBody,
        clientMutationId: input.actionRequestId,
        subjectId,
      },
    });
    if (result.kind === "failure") {
      return mapGraphQLFailureToActionFailure({
        failure: result,
        mutationAttempted: true,
      });
    }

    const comment = result.data.addComment?.commentEdge?.node;
    if (comment?.id === undefined) {
      return providerRejectedFailure({
        requestId: result.githubRequestId,
        status: result.githubStatusCode,
      });
    }
    return actionSuccess({
      id: comment.id,
      requestId: result.githubRequestId,
      status: result.githubStatusCode,
      url: comment.url ?? undefined,
    });
  }

  private async createPullRequestTopLevelComment(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
    payload: GitHubPullRequestTopLevelCommentCreatePayload,
  ): Promise<GitHubActionDispatchResult> {
    const renderedBody = requireRenderedBody(input.renderedBody);
    const target = await this.resolvePullRequest(input, payload.pullRequestNumber);
    if (target.kind === "failure") {
      return target;
    }
    const result = await this.client.request<AddCommentResponse>({
      operationName: "AgentTeamsAddComment",
      query: addCommentMutation,
      token: input.tokenLease.token,
      variables: {
        body: renderedBody,
        clientMutationId: input.actionRequestId,
        subjectId: target.pullRequestId,
      },
    });
    if (result.kind === "failure") {
      return mapGraphQLFailureToActionFailure({
        failure: result,
        mutationAttempted: true,
      });
    }

    const comment = result.data.addComment?.commentEdge?.node;
    if (comment?.id === undefined) {
      return providerRejectedFailure({
        requestId: result.githubRequestId,
        status: result.githubStatusCode,
      });
    }
    return actionSuccess({
      id: comment.id,
      requestId: result.githubRequestId,
      status: result.githubStatusCode,
      url: comment.url ?? undefined,
    });
  }

  private async createPullRequestReview(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
    payload: GitHubPullRequestReviewCreatePayload,
  ): Promise<GitHubActionDispatchResult> {
    const renderedBody = requireRenderedBody(input.renderedBody);
    const target = await this.resolvePullRequest(input, payload.pullRequestNumber);
    if (target.kind === "failure") {
      return target;
    }
    const result = await this.client.request<AddPullRequestReviewResponse>({
      operationName: "AgentTeamsAddPullRequestReview",
      query: addPullRequestReviewMutation,
      token: input.tokenLease.token,
      variables: {
        body: renderedBody,
        clientMutationId: input.actionRequestId,
        pullRequestId: target.pullRequestId,
      },
    });
    if (result.kind === "failure") {
      return mapGraphQLFailureToActionFailure({
        failure: result,
        mutationAttempted: true,
      });
    }

    const review = result.data.addPullRequestReview?.pullRequestReview;
    if (review?.id === undefined) {
      return providerRejectedFailure({
        requestId: result.githubRequestId,
        status: result.githubStatusCode,
      });
    }
    return actionSuccess({
      id: review.id,
      requestId: result.githubRequestId,
      status: result.githubStatusCode,
      url: review.url ?? undefined,
    });
  }

  private async resolvePullRequest(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
    pullRequestNumber: number,
  ): Promise<
    | Readonly<{
        kind: "success";
        pullRequestId: string;
      }>
    | GitHubActionDispatchFailure
  > {
    const target = await this.client.request<PullRequestTargetResponse>({
      operationName: "AgentTeamsPullRequestTarget",
      query: pullRequestTargetQuery,
      token: input.tokenLease.token,
      variables: {
        number: pullRequestNumber,
        owner: input.target.owner,
        repo: input.target.repo,
      },
    });
    if (target.kind === "failure") {
      return mapGraphQLFailureToActionFailure({
        failure: target,
        mutationAttempted: false,
      });
    }

    const pullRequestId = target.data.repository?.pullRequest?.id;
    if (pullRequestId === undefined) {
      return targetResourceNotFoundFailure({
        requestId: target.githubRequestId,
        status: target.githubStatusCode,
      });
    }
    return { kind: "success", pullRequestId };
  }
}

function actionSuccess(input: {
  id: string;
  status: number;
  requestId?: string | undefined;
  url?: string | undefined;
}): GitHubActionDispatchResult {
  return {
    githubDeliveryId: input.id,
    githubStatusCode: input.status,
    kind: "success",
    ...(input.requestId === undefined ? {} : { githubRequestId: input.requestId }),
    ...(input.url === undefined ? {} : { githubUrl: input.url }),
  };
}

function mapGraphQLFailureToActionFailure(input: {
  failure: GitHubGraphQLFailure;
  mutationAttempted: boolean;
}): GitHubActionDispatchFailure {
  if (
    input.mutationAttempted &&
    input.failure.safeError.code === "CONTROL_PLANE_GITHUB_GRAPHQL_TRANSPORT_FAILED"
  ) {
    return actionFailure({
      code: "CONTROL_PLANE_GITHUB_ACTION_UNKNOWN_RESULT",
      message:
        "GitHub action result is unknown and will not be retried without marker lookup.",
      requestId: input.failure.githubRequestId,
      status: input.failure.githubStatusCode,
    });
  }

  const mapped = mapGraphQLSafeError(input.failure.safeError);
  return actionFailure({
    code: mapped.code,
    message: mapped.message,
    requestId: input.failure.githubRequestId,
    retryAfterMs: input.failure.retryAfterMs,
    retryable: mapped.retryable,
    status: input.failure.githubStatusCode,
  });
}

function mapGraphQLSafeError(error: SafeError): {
  code: string;
  message: string;
  retryable?: boolean;
} {
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_RATE_LIMITED") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_RATE_LIMITED",
      message: "GitHub action dispatch was rate limited.",
      retryable: true,
    };
  }
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_PROVIDER_UNAVAILABLE") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_PROVIDER_UNAVAILABLE",
      message: "GitHub action dispatch provider failed.",
      retryable: true,
    };
  }
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_TRANSPORT_FAILED") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_TRANSPORT_FAILED",
      message: "GitHub action transport failed.",
      retryable: true,
    };
  }
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_PERMISSION_DENIED") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_PERMISSION_DENIED",
      message: "GitHub action dispatch was denied by GitHub permissions.",
    };
  }
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_RESOURCE_NOT_FOUND") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_RESOURCE_NOT_FOUND",
      message: "GitHub action target resource was not found.",
    };
  }
  if (error.code === "CONTROL_PLANE_GITHUB_GRAPHQL_VALIDATION_FAILED") {
    return {
      code: "CONTROL_PLANE_GITHUB_ACTION_VALIDATION_FAILED",
      message: "GitHub rejected the action payload.",
    };
  }
  return {
    code: "CONTROL_PLANE_GITHUB_ACTION_PROVIDER_REJECTED",
    message: "GitHub rejected the action request.",
  };
}

function requireRenderedBody(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw createSafeError({
      category: "validation",
      code: "CONTROL_PLANE_GITHUB_ACTION_RENDERED_BODY_REQUIRED",
      message: "Rendered GitHub action body is required.",
    });
  }
  return value;
}

function targetResourceNotFoundFailure(input: {
  status?: number | undefined;
  requestId?: string | undefined;
}): GitHubActionDispatchFailure {
  return actionFailure({
    code: "CONTROL_PLANE_GITHUB_ACTION_RESOURCE_NOT_FOUND",
    message: "GitHub action target resource was not found.",
    requestId: input.requestId,
    status: input.status,
  });
}

function providerRejectedFailure(input: {
  status?: number | undefined;
  requestId?: string | undefined;
}): GitHubActionDispatchFailure {
  return actionFailure({
    code: "CONTROL_PLANE_GITHUB_ACTION_PROVIDER_REJECTED",
    message: "GitHub rejected the action request.",
    requestId: input.requestId,
    status: input.status,
  });
}

function actionFailure(input: {
  code: string;
  message: string;
  status?: number | undefined;
  requestId?: string | undefined;
  retryable?: boolean | undefined;
  retryAfterMs?: number | undefined;
}): GitHubActionDispatchFailure {
  const safeError: SafeError = createSafeError({
    category: "external",
    code: input.code,
    message: input.message,
    retryable: input.retryable ?? false,
    safeDetails: {
      ...(input.status === undefined ? {} : { status: input.status }),
    },
  });
  return {
    kind: "failure",
    safeError,
    ...(input.requestId === undefined ? {} : { githubRequestId: input.requestId }),
    ...(input.retryAfterMs === undefined ? {} : { retryAfterMs: input.retryAfterMs }),
    ...(input.status === undefined ? {} : { githubStatusCode: input.status }),
  };
}
