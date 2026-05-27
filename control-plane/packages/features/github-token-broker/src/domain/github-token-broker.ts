import {
  createSafeError,
  type SafeError,
  type UnixMilliseconds,
} from "@agent-teams-control-plane/shared";

export type GitHubTokenBrokerCapability =
  | "github.issue_comment.request"
  | "github.pr_comment.request"
  | "github.pr_review.request"
  | "github.check_run.request";

export type GitHubPermissionLevel = "read" | "write";
export type GitHubGrantedPermissionLevel = GitHubPermissionLevel | "admin";
export type GitHubPermissionSet = Readonly<Record<string, GitHubPermissionLevel>>;
export type GitHubGrantedPermissionSet = Readonly<
  Record<string, GitHubGrantedPermissionLevel>
>;

export type GitHubRepositoryJsonId = number;

export type GitHubRepositoryScope = Readonly<{
  githubInstallationId: string;
  githubRepositoryId: string;
}>;

export type GitHubInstallationTokenLease = Readonly<{
  token: string;
  expiresAtMs: UnixMilliseconds;
  githubInstallationId: string;
  repositoryIds: readonly GitHubRepositoryJsonId[];
  permissions: GitHubPermissionSet;
}>;

export const GITHUB_TOKEN_BROKER_CAPABILITIES = [
  "github.issue_comment.request",
  "github.pr_comment.request",
  "github.pr_review.request",
  "github.check_run.request",
] as const satisfies readonly GitHubTokenBrokerCapability[];

const capabilityPermissions = {
  "github.check_run.request": { checks: "write" },
  "github.issue_comment.request": { issues: "write" },
  "github.pr_comment.request": { pull_requests: "write" },
  "github.pr_review.request": { pull_requests: "write" },
} as const satisfies Record<GitHubTokenBrokerCapability, GitHubPermissionSet>;

const MAX_GITHUB_REPOSITORY_ID = Number.MAX_SAFE_INTEGER;

export function assertGitHubTokenBrokerCapability(
  value: unknown,
): GitHubTokenBrokerCapability {
  if (isGitHubTokenBrokerCapability(value)) {
    return value;
  }
  throw createSafeError({
    category: "authorization",
    code: "CONTROL_PLANE_GITHUB_TOKEN_CAPABILITY_DENIED",
    message: "GitHub token capability is not supported.",
  });
}

export function mapCapabilityToGitHubPermissions(
  capability: string,
): GitHubPermissionSet {
  const supportedCapability = assertGitHubTokenBrokerCapability(capability);
  return capabilityPermissions[supportedCapability];
}

export function toGitHubRepositoryJsonId(value: string): GitHubRepositoryJsonId {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw unsupportedRepositoryIdError();
  }
  const numeric = Number(value);
  if (
    !Number.isSafeInteger(numeric) ||
    numeric <= 0 ||
    numeric > MAX_GITHUB_REPOSITORY_ID
  ) {
    throw unsupportedRepositoryIdError();
  }
  return numeric;
}

export function validateIssuedTokenScope(input: {
  requestedRepositoryIds: readonly GitHubRepositoryJsonId[];
  requestedPermissions: GitHubPermissionSet;
  grantedRepositoryIds?: readonly GitHubRepositoryJsonId[];
  grantedPermissions?: GitHubGrantedPermissionSet;
}): SafeError | undefined {
  if (
    input.grantedRepositoryIds !== undefined &&
    canonicalRepositoryIds(input.grantedRepositoryIds) !==
      canonicalRepositoryIds(input.requestedRepositoryIds)
  ) {
    return tokenScopeMismatchError();
  }
  if (
    input.grantedPermissions !== undefined &&
    !permissionsAreNoBroaderThanRequested(
      input.grantedPermissions,
      input.requestedPermissions,
    )
  ) {
    return tokenScopeMismatchError();
  }
  return undefined;
}

export function permissionSummary(
  permissions: GitHubPermissionSet,
): Readonly<Record<string, GitHubPermissionLevel>> {
  return Object.fromEntries(
    Object.entries(permissions).sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, GitHubPermissionLevel>>;
}

export function isGitHubTokenBrokerCapability(
  value: unknown,
): value is GitHubTokenBrokerCapability {
  return GITHUB_TOKEN_BROKER_CAPABILITIES.some((capability) => capability === value);
}

function permissionsAreNoBroaderThanRequested(
  granted: GitHubGrantedPermissionSet,
  requested: GitHubPermissionSet,
): boolean {
  for (const [name, level] of Object.entries(granted)) {
    if (name === "metadata" && level === "read") {
      continue;
    }
    if (requested[name] !== level) {
      return false;
    }
  }
  return true;
}

function canonicalRepositoryIds(ids: readonly GitHubRepositoryJsonId[]): string {
  return [...ids].sort((left, right) => left - right).join(",");
}

function unsupportedRepositoryIdError(): SafeError {
  return createSafeError({
    category: "validation",
    code: "CONTROL_PLANE_GITHUB_REPOSITORY_ID_UNSUPPORTED",
    message: "GitHub repository id cannot be safely used for token narrowing.",
  });
}

function tokenScopeMismatchError(): SafeError {
  return createSafeError({
    category: "external",
    code: "CONTROL_PLANE_GITHUB_TOKEN_SCOPE_MISMATCH",
    message: "GitHub installation token scope did not match the requested scope.",
  });
}
