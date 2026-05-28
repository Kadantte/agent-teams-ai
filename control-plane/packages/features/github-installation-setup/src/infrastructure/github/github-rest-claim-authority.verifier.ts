import { createSafeError, toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import type { GitHubClaimAuthorityVerifier } from "../../application/ports/github-claim-authority-verifier.port.js";
import type { GitHubInstallationClaimVerification } from "../../application/ports/github-claim-authority-verifier.port.js";
import type { GitHubAppSetupSettings } from "../../application/ports/github-app-settings.js";

type GitHubUserResponse = {
  id?: number;
  login?: string;
};

type GitHubInstallationResponse = {
  id?: number;
  account?: {
    id?: number;
    login?: string;
    type?: string;
    avatar_url?: string;
  };
};

type GitHubInstallationsResponse = {
  installations?: GitHubInstallationResponse[];
};

type GitHubRepositoriesResponse = {
  repositories?: Array<{
    id?: number;
    node_id?: string;
    name?: string;
    full_name?: string;
    private?: boolean;
    archived?: boolean;
    owner?: {
      login?: string;
    };
  }>;
};

export class GitHubRestClaimAuthorityVerifier implements GitHubClaimAuthorityVerifier {
  public constructor(private readonly settings: GitHubAppSetupSettings) {}

  public async verifyInstallationClaim(input: {
    userAccessToken: string;
    githubInstallationId: string;
  }): Promise<GitHubInstallationClaimVerification> {
    const [user, installation] = await Promise.all([
      this.getJson<GitHubUserResponse>("/user", input.userAccessToken),
      this.findInstallation(input.githubInstallationId, input.userAccessToken),
    ]);
    if (installation === undefined || installation.account === undefined) {
      return {
        kind: "rejected" as const,
        safeError: createSafeError({
          category: "authorization",
          code: "CONTROL_PLANE_GITHUB_INSTALLATION_NOT_ACCESSIBLE",
          message: "GitHub installation is not accessible to this user.",
        }),
      };
    }
    const repositories = await this.listInstallationRepositories(
      input.githubInstallationId,
      input.userAccessToken,
    );
    const nowMs = toUnixMilliseconds(Date.now());
    const accountId = installation.account.id;
    const accountLogin = installation.account.login;
    const accountType = parseAccountType(installation.account.type);
    if (
      accountId === undefined ||
      accountLogin === undefined ||
      accountType === undefined
    ) {
      return {
        kind: "rejected" as const,
        safeError: createSafeError({
          category: "external",
          code: "CONTROL_PLANE_GITHUB_INSTALLATION_ACCOUNT_INVALID",
          message: "GitHub installation account metadata is invalid.",
        }),
      };
    }
    return {
      account: {
        displayLogin: accountLogin,
        lastVerifiedAtMs: nowMs,
        providerAccountId: String(accountId),
        providerAccountKind: accountType,
        ...(typeof installation.account.avatar_url === "string"
          ? { avatarUrl: installation.account.avatar_url }
          : {}),
      },
      githubInstallationId: input.githubInstallationId,
      githubUser: {
        id: String(user.id ?? ""),
        login: user.login ?? "",
      },
      kind: "verified" as const,
      repositories: repositories.flatMap((repository) => {
        if (
          repository.id === undefined ||
          repository.name === undefined ||
          repository.full_name === undefined ||
          repository.owner?.login === undefined
        ) {
          return [];
        }
        return [
          {
            archived: repository.archived ?? false,
            available: true,
            displayFullName: repository.full_name,
            displayName: repository.name,
            displayOwner: repository.owner.login,
            lastVerifiedAtMs: nowMs,
            private: repository.private ?? false,
            providerRepositoryId: String(repository.id),
          },
        ];
      }),
      repositorySync: {
        complete: true,
      },
    };
  }

  private async findInstallation(
    githubInstallationId: string,
    token: string,
  ): Promise<GitHubInstallationResponse | undefined> {
    let nextPath: string | undefined = "/user/installations?per_page=100";
    let pageCount = 0;
    while (nextPath !== undefined) {
      pageCount += 1;
      if (pageCount > 50) {
        throw createSafeError({
          category: "external",
          code: "CONTROL_PLANE_GITHUB_INSTALLATION_PAGINATION_LIMIT",
          message: "GitHub installation pagination could not be completed.",
          retryable: true,
        });
      }
      const page: { body: GitHubInstallationsResponse; nextPath?: string } =
        await this.getJsonPage<GitHubInstallationsResponse>(nextPath, token);
      const installation = (page.body.installations ?? []).find(
        (item: GitHubInstallationResponse) => String(item.id) === githubInstallationId,
      );
      if (installation !== undefined) {
        return installation;
      }
      nextPath = page.nextPath;
    }
    return undefined;
  }

  private async listInstallationRepositories(
    githubInstallationId: string,
    token: string,
  ): Promise<NonNullable<GitHubRepositoriesResponse["repositories"]>> {
    let nextPath: string | undefined =
      `/user/installations/${encodeURIComponent(githubInstallationId)}/repositories?per_page=100`;
    let pageCount = 0;
    const repositories: NonNullable<GitHubRepositoriesResponse["repositories"]> = [];
    while (nextPath !== undefined) {
      pageCount += 1;
      if (pageCount > 50) {
        throw createSafeError({
          category: "external",
          code: "CONTROL_PLANE_GITHUB_REPOSITORY_PAGINATION_LIMIT",
          message: "GitHub repository pagination could not be completed.",
          retryable: true,
        });
      }
      const page: { body: GitHubRepositoriesResponse; nextPath?: string } =
        await this.getJsonPage<GitHubRepositoriesResponse>(nextPath, token);
      repositories.push(...(page.body.repositories ?? []));
      nextPath = page.nextPath;
    }
    return repositories;
  }

  private async getJson<T>(path: string, token: string): Promise<T> {
    return (await this.getJsonPage<T>(path, token)).body;
  }

  private async getJsonPage<T>(
    path: string,
    token: string,
  ): Promise<{ body: T; nextPath?: string }> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        ...(this.settings.restApiVersion() === undefined
          ? {}
          : { "x-github-api-version": this.settings.restApiVersion() }),
      },
    });
    if (!response.ok) {
      throw createSafeError({
        category: "external",
        code: "CONTROL_PLANE_GITHUB_API_UNAVAILABLE",
        message: "GitHub API request failed.",
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const body = (await response.json()) as T;
    const nextPath = parseNextLinkPath(response.headers.get("link"));
    return {
      body,
      ...(nextPath === undefined ? {} : { nextPath }),
    };
  }
}

function parseAccountType(value: unknown): "Organization" | "User" | undefined {
  return value === "Organization" || value === "User" ? value : undefined;
}

function parseNextLinkPath(linkHeader: string | null): string | undefined {
  if (linkHeader === null) {
    return undefined;
  }
  for (const part of linkHeader.split(",")) {
    const [rawUrl, rawRel] = part.trim().split(";");
    if (rawUrl === undefined || rawRel === undefined || !rawRel.includes('rel="next"')) {
      continue;
    }
    const match = rawUrl.trim().match(/^<(.+)>$/);
    const href = match?.[1];
    if (href === undefined) {
      continue;
    }
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
  }
  return undefined;
}
