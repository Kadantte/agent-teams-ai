import type { UnixMilliseconds } from "@agent-teams-control-plane/shared";

import type {
  GitHubGrantedPermissionSet,
  GitHubPermissionSet,
  GitHubRepositoryJsonId,
} from "../../domain/index.js";

export type GitHubInstallationTokenIssuerInput = Readonly<{
  githubInstallationId: string;
  repositoryIds: readonly GitHubRepositoryJsonId[];
  permissions: GitHubPermissionSet;
  nowMs: UnixMilliseconds;
  correlationId?: string;
}>;

export type GitHubInstallationTokenIssuerResult = Readonly<{
  token: string;
  expiresAtMs: UnixMilliseconds;
  grantedRepositoryIds?: readonly GitHubRepositoryJsonId[];
  grantedPermissions?: GitHubGrantedPermissionSet;
}>;

export interface GitHubInstallationTokenIssuer {
  issue(
    input: GitHubInstallationTokenIssuerInput,
  ): Promise<GitHubInstallationTokenIssuerResult>;
}
