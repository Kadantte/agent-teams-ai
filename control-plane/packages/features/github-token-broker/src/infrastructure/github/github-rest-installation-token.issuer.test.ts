import { describe, expect, it } from "vitest";

import { toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import type { GitHubAppJwtSigner } from "../../application/ports/github-app-jwt-signer.port.js";
import type { GitHubTokenBrokerSettings } from "../../application/ports/policies.js";
import { GitHubRestInstallationTokenIssuer } from "./github-rest-installation-token.issuer.js";

describe("GitHubRestInstallationTokenIssuer", () => {
  it("requests repository-narrowed installation tokens with minimum permissions", async () => {
    const calls: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const issuer = new GitHubRestInstallationTokenIssuer(settings(), signer(), (async (
      url,
      init,
    ) => {
      calls.push({ init, url: String(url) });
      return new Response(
        JSON.stringify({
          expires_at: "2026-05-27T10:00:00.000Z",
          permissions: { metadata: "read", pull_requests: "write" },
          repositories: [{ id: 123456 }],
          token: "installation-token",
        }),
        { status: 201 },
      );
    }) as typeof fetch);

    await expect(
      issuer.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { pull_requests: "write" },
        repositoryIds: [123456],
      }),
    ).resolves.toEqual({
      expiresAtMs: toUnixMilliseconds(Date.parse("2026-05-27T10:00:00.000Z")),
      grantedPermissions: { metadata: "read", pull_requests: "write" },
      grantedRepositoryIds: [123456],
      token: "installation-token",
    });

    expect(calls).toEqual([
      expect.objectContaining({
        url: "https://api.github.com/app/installations/installation-1/access_tokens",
      }),
    ]);
    expect(calls[0]?.init).toMatchObject({
      body: JSON.stringify({
        permissions: { pull_requests: "write" },
        repository_ids: [123456],
      }),
      headers: expect.objectContaining({
        accept: "application/vnd.github+json",
        authorization: "Bearer app-jwt",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      }),
      method: "POST",
    });
  });

  it("maps GitHub token endpoint failures to safe retryable errors", async () => {
    const issuer = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
    );

    await expect(
      issuer.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { checks: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_API_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps transport failures to retryable safe errors", async () => {
    const issuer = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () => {
        throw new TypeError("fetch failed with raw socket details");
      }) as typeof fetch,
    );

    await expect(
      issuer.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { checks: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_API_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps GitHub 403 rate-limit responses to retryable safe errors", async () => {
    const issuer = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () =>
        new Response("rate limited", {
          headers: {
            "retry-after": "30",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1780000000",
          },
          status: 403,
        })) as typeof fetch,
    );

    await expect(
      issuer.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { checks: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      category: "external",
      code: "CONTROL_PLANE_GITHUB_TOKEN_RATE_LIMITED",
      retryable: true,
      safeDetails: {
        providerStatus: 403,
        rateLimitRemaining: 0,
        rateLimitResetSeconds: 1_780_000_000,
        retryAfterSeconds: 30,
      },
    });
  });

  it("rejects invalid token responses without leaking response bodies", async () => {
    const issuer = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () =>
        new Response(JSON.stringify({ token: "secret-token" }), {
          status: 201,
        })) as typeof fetch,
    );

    await expect(
      issuer.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { issues: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_RESPONSE_INVALID",
    });
  });

  it("rejects unsupported permission and repository metadata in token responses", async () => {
    const issuerWithUnsupportedPermission = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () =>
        new Response(
          JSON.stringify({
            expires_at: "2026-05-27T10:00:00.000Z",
            permissions: { issues: "super-admin" },
            repositories: [{ id: 123456 }],
            token: "installation-token",
          }),
          { status: 201 },
        )) as typeof fetch,
    );
    await expect(
      issuerWithUnsupportedPermission.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { issues: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_RESPONSE_INVALID",
    });

    const issuerWithInvalidRepository = new GitHubRestInstallationTokenIssuer(
      settings(),
      signer(),
      (async () =>
        new Response(
          JSON.stringify({
            expires_at: "2026-05-27T10:00:00.000Z",
            permissions: { issues: "write" },
            repositories: [{ id: "123456" }],
            token: "installation-token",
          }),
          { status: 201 },
        )) as typeof fetch,
    );
    await expect(
      issuerWithInvalidRepository.issue({
        githubInstallationId: "installation-1",
        nowMs: toUnixMilliseconds(1_700_000_000_000),
        permissions: { issues: "write" },
        repositoryIds: [123456],
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_RESPONSE_INVALID",
    });
  });
});

function signer(): GitHubAppJwtSigner {
  return {
    checkReadiness: async () => ({
      privateKeyConfigured: true,
      privateKeyParseable: true,
    }),
    sign: async () => ({
      expiresAtMs: toUnixMilliseconds(1_700_000_540_000),
      issuedAtMs: toUnixMilliseconds(1_699_999_940_000),
      value: "app-jwt",
    }),
  };
}

function settings(): GitHubTokenBrokerSettings {
  return {
    appJwtIssuer: () => "app-client-id",
    privateKey: () => "private-key",
    readinessSnapshot: () => ({
      appClientIdConfigured: true,
      appIdConfigured: true,
      appSlugConfigured: true,
      mode: "hosted-official-app",
      privateKeyConfigured: true,
      publicBaseUrlConfigured: true,
      restApiVersionConfigured: true,
    }),
    restApiVersion: () => "2022-11-28",
  };
}
