import {
  createSafeError,
  isSafeError,
  type SafeError,
} from "@agent-teams-control-plane/shared";

type FetchLike = typeof fetch;

export type GitHubGraphQLVariables = Readonly<Record<string, unknown>>;

export type GitHubGraphQLSuccess<TData> = Readonly<{
  kind: "success";
  data: TData;
  githubStatusCode: number;
  githubRequestId?: string;
}>;

export type GitHubGraphQLFailure = Readonly<{
  kind: "failure";
  safeError: SafeError;
  retryAfterMs?: number;
  githubStatusCode?: number;
  githubRequestId?: string;
}>;

export type GitHubGraphQLResult<TData> =
  | GitHubGraphQLSuccess<TData>
  | GitHubGraphQLFailure;

export interface GitHubGraphQLClient {
  request<TData>(input: {
    token: string;
    query: string;
    variables?: GitHubGraphQLVariables;
    operationName?: string;
  }): Promise<GitHubGraphQLResult<TData>>;
}

type GitHubGraphQLResponseBody = Readonly<{
  data: unknown | undefined;
  errors: readonly GitHubGraphQLErrorBody[];
}>;

type GitHubGraphQLErrorBody = Readonly<{
  message?: unknown;
  type?: unknown;
}> &
  Readonly<Record<string, unknown>>;

const defaultEndpoint = "https://api.github.com/graphql";
const defaultRateLimitBackoffMs = 60_000;
const minimumPositiveBackoffMs = 1_000;

export class FetchGitHubGraphQLClient implements GitHubGraphQLClient {
  public constructor(
    private readonly endpoint: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  public async request<TData>(input: {
    token: string;
    query: string;
    variables?: GitHubGraphQLVariables;
    operationName?: string;
  }): Promise<GitHubGraphQLResult<TData>> {
    try {
      const response = await this.fetchImpl(this.endpoint ?? defaultEndpoint, {
        body: JSON.stringify({
          operationName: input.operationName,
          query: input.query,
          variables: input.variables ?? {},
        }),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          "User-Agent": "agent-teams-control-plane",
        },
        method: "POST",
      });
      const requestId = response.headers.get("x-github-request-id") ?? undefined;
      const body = await readJsonResponse(response);
      if (!response.ok) {
        return mapGraphQLFailure({
          body,
          requestId,
          response,
        });
      }

      const parsed = parseGraphQLBody(body);
      if (parsed.errors.length > 0) {
        return mapGraphQLErrorBody({
          errors: parsed.errors,
          requestId,
          status: response.status,
        });
      }
      if (parsed.data === undefined) {
        return failure({
          code: "CONTROL_PLANE_GITHUB_GRAPHQL_EMPTY_RESPONSE",
          message: "GitHub GraphQL response did not include data.",
          requestId,
          status: response.status,
        });
      }

      return {
        data: parsed.data as TData,
        githubStatusCode: response.status,
        kind: "success",
        ...(requestId === undefined ? {} : { githubRequestId: requestId }),
      };
    } catch (error) {
      if (isSafeError(error)) {
        return {
          kind: "failure",
          safeError: error,
        };
      }
      return failure({
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_TRANSPORT_FAILED",
        message: "GitHub GraphQL transport failed.",
        retryable: true,
      });
    }
  }
}

async function mapGraphQLFailure(input: {
  response: Response;
  requestId: string | undefined;
  body: unknown;
}): Promise<GitHubGraphQLFailure> {
  const retryAfterMs = parseRetryAfterMs(input.response.headers);
  const rateLimitResetMs = parseRateLimitResetMs(input.response.headers);
  const backoffMs = normalizeProviderBackoffMs(retryAfterMs ?? rateLimitResetMs);
  const status = input.response.status;
  const message = readProviderMessage(input.body);
  const secondaryRateLimit =
    status === 429 ||
    (status === 403 && backoffMs !== undefined) ||
    /secondary rate limit|rate limit/i.test(message);

  if (secondaryRateLimit) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_RATE_LIMITED",
      message: "GitHub GraphQL request was rate limited.",
      requestId: input.requestId,
      retryAfterMs: backoffMs ?? defaultRateLimitBackoffMs,
      retryable: true,
      status,
    });
  }
  if (status >= 500) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_PROVIDER_UNAVAILABLE",
      message: "GitHub GraphQL provider failed.",
      requestId: input.requestId,
      retryable: true,
      status,
    });
  }
  if (status === 401 || status === 403) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_PERMISSION_DENIED",
      message: "GitHub GraphQL request was denied by GitHub permissions.",
      requestId: input.requestId,
      status,
    });
  }
  if (status === 404) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_RESOURCE_NOT_FOUND",
      message: "GitHub GraphQL resource was not found.",
      requestId: input.requestId,
      status,
    });
  }
  if (status === 422) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_VALIDATION_FAILED",
      message: "GitHub rejected the GraphQL payload.",
      requestId: input.requestId,
      status,
    });
  }
  return failure({
    code: "CONTROL_PLANE_GITHUB_GRAPHQL_PROVIDER_REJECTED",
    message: "GitHub rejected the GraphQL request.",
    requestId: input.requestId,
    status,
  });
}

function mapGraphQLErrorBody(input: {
  errors: readonly GitHubGraphQLErrorBody[];
  requestId: string | undefined;
  status: number;
}): GitHubGraphQLFailure {
  const message = input.errors.map((error) => readErrorMessage(error)).join("\n");
  const type = input.errors.map((error) => readErrorType(error)).join("\n");
  if (/rate limit|RATE_LIMITED/i.test(`${type}\n${message}`)) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_RATE_LIMITED",
      message: "GitHub GraphQL request was rate limited.",
      requestId: input.requestId,
      retryAfterMs: defaultRateLimitBackoffMs,
      retryable: true,
      status: input.status,
    });
  }
  if (
    /resource not accessible|forbidden|insufficient|permission|FORBIDDEN/i.test(
      `${type}\n${message}`,
    )
  ) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_PERMISSION_DENIED",
      message: "GitHub GraphQL request was denied by GitHub permissions.",
      requestId: input.requestId,
      status: input.status,
    });
  }
  if (
    /could not resolve|not found|does not exist|NOT_FOUND/i.test(`${type}\n${message}`)
  ) {
    return failure({
      code: "CONTROL_PLANE_GITHUB_GRAPHQL_RESOURCE_NOT_FOUND",
      message: "GitHub GraphQL target resource was not found.",
      requestId: input.requestId,
      status: input.status,
    });
  }
  return failure({
    code: "CONTROL_PLANE_GITHUB_GRAPHQL_PROVIDER_REJECTED",
    message: "GitHub rejected the GraphQL request.",
    requestId: input.requestId,
    status: input.status,
  });
}

function parseGraphQLBody(body: unknown): GitHubGraphQLResponseBody {
  if (typeof body !== "object" || body === null) {
    return { data: undefined, errors: [] };
  }
  const candidate = body as Record<string, unknown>;
  const errors = Array.isArray(candidate.errors) ? candidate.errors.filter(isRecord) : [];
  return {
    data: candidate.data,
    errors,
  };
}

function failure(input: {
  code: string;
  message: string;
  status?: number | undefined;
  requestId?: string | undefined;
  retryable?: boolean | undefined;
  retryAfterMs?: number | undefined;
}): GitHubGraphQLFailure {
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

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function readProviderMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }
  return "";
}

function readErrorMessage(error: GitHubGraphQLErrorBody): string {
  return typeof error.message === "string" ? error.message : "";
}

function readErrorType(error: GitHubGraphQLErrorBody): string {
  return typeof error.type === "string" ? error.type : "";
}

function parseRetryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds * 1000;
}

function parseRateLimitResetMs(headers: Headers): number | undefined {
  const value = headers.get("x-ratelimit-reset");
  if (value === null) {
    return undefined;
  }
  const resetSeconds = Number(value);
  if (!Number.isFinite(resetSeconds) || resetSeconds < 0) {
    return undefined;
  }
  return Math.max(0, resetSeconds * 1000 - Date.now());
}

function normalizeProviderBackoffMs(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value < minimumPositiveBackoffMs) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
