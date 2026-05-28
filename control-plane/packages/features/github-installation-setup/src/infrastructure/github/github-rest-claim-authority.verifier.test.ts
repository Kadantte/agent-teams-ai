import { afterEach, describe, expect, it, vi } from "vitest";

import { GitHubRestClaimAuthorityVerifier } from "./github-rest-claim-authority.verifier.js";

describe("GitHubRestClaimAuthorityVerifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows installation and repository pagination before completing snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/user")) {
          return jsonResponse({ id: 7, login: "octo-user" });
        }
        if (url.endsWith("/user/installations?per_page=100")) {
          return jsonResponse(
            { installations: [{ id: 111 }] },
            '<https://api.github.com/user/installations?per_page=100&page=2>; rel="next"',
          );
        }
        if (url.endsWith("/user/installations?per_page=100&page=2")) {
          return jsonResponse({
            installations: [
              {
                account: {
                  avatar_url: "https://avatars.example/octo-org",
                  id: 42,
                  login: "octo-org",
                  type: "Organization",
                },
                id: 123,
              },
            ],
          });
        }
        if (url.endsWith("/user/installations/123/repositories?per_page=100")) {
          return jsonResponse(
            {
              repositories: [
                {
                  archived: false,
                  full_name: "octo-org/repo",
                  id: 999,
                  name: "repo",
                  owner: { login: "octo-org" },
                  private: true,
                },
              ],
            },
            '<https://api.github.com/user/installations/123/repositories?per_page=100&page=2>; rel="next"',
          );
        }
        if (url.endsWith("/user/installations/123/repositories?per_page=100&page=2")) {
          return jsonResponse({
            repositories: [
              {
                archived: false,
                full_name: "octo-org/second",
                id: 1000,
                name: "second",
                owner: { login: "octo-org" },
                private: false,
              },
            ],
          });
        }
        throw new Error(`Unexpected GitHub URL ${url}`);
      }),
    );
    const verifier = new GitHubRestClaimAuthorityVerifier({
      requireSetupSettings: () => {
        throw new Error("not used");
      },
      requireOAuthSettings: () => {
        throw new Error("not used");
      },
      restApiVersion: () => "2022-11-28",
    });

    const result = await verifier.verifyInstallationClaim({
      githubInstallationId: "123",
      userAccessToken: "user-token",
    });

    expect(result.kind).toBe("verified");
    if (result.kind !== "verified") {
      return;
    }
    expect(result.account.displayLogin).toBe("octo-org");
    expect(result.repositories).toHaveLength(2);
    expect(result.repositorySync).toEqual({
      complete: true,
    });
  });
});

function jsonResponse(body: unknown, link?: string) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "link" ? (link ?? null) : null),
    },
    json: async () => body,
    ok: true,
  } as Response;
}
