import { describe, expect, it } from "vitest";

import { FetchGitHubGraphQLClient } from "./github-graphql.client.js";

describe("FetchGitHubGraphQLClient", () => {
  it("posts GraphQL requests with bearer auth and variables", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new FetchGitHubGraphQLClient(
      "https://github.example/graphql",
      async (url, init) => {
        calls.push({ init: init ?? {}, url: String(url) });
        return new Response(JSON.stringify({ data: { viewer: { login: "agent" } } }), {
          headers: { "x-github-request-id": "request-1" },
          status: 200,
        });
      },
    );

    await expect(
      client.request<{ viewer: { login: string } }>({
        operationName: "Viewer",
        query: "query Viewer($login: String!) { viewer { login } }",
        token: "secret-token",
        variables: { login: "agent" },
      }),
    ).resolves.toMatchObject({
      data: { viewer: { login: "agent" } },
      githubRequestId: "request-1",
      githubStatusCode: 200,
      kind: "success",
    });
    expect(calls[0]?.url).toBe("https://github.example/graphql");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer secret-token",
      "Content-Type": "application/json",
      "User-Agent": "agent-teams-control-plane",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      operationName: "Viewer",
      query: "query Viewer($login: String!) { viewer { login } }",
      variables: { login: "agent" },
    });
  });

  it("maps GraphQL error arrays to safe permission failures without leaking provider text", async () => {
    const client = new FetchGitHubGraphQLClient(undefined, async () => {
      return new Response(
        JSON.stringify({
          errors: [
            {
              message: "Resource not accessible by integration: secret repo detail",
              type: "FORBIDDEN",
            },
          ],
        }),
        {
          headers: { "x-github-request-id": "request-2" },
          status: 200,
        },
      );
    });

    const result = await client.request({
      query: "query Secret { viewer { login } }",
      token: "secret-token",
    });

    expect(result).toMatchObject({
      githubRequestId: "request-2",
      githubStatusCode: 200,
      kind: "failure",
      safeError: {
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_PERMISSION_DENIED",
        message: "GitHub GraphQL request was denied by GitHub permissions.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret repo detail");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("maps secondary rate limits to retryable failures", async () => {
    const client = new FetchGitHubGraphQLClient(undefined, async () => {
      return new Response(JSON.stringify({ message: "secondary rate limit" }), {
        headers: {
          "retry-after": "90",
          "x-github-request-id": "request-3",
        },
        status: 403,
      });
    });

    await expect(
      client.request({
        query: "query Viewer { viewer { login } }",
        token: "secret-token",
      }),
    ).resolves.toMatchObject({
      githubRequestId: "request-3",
      kind: "failure",
      retryAfterMs: 90_000,
      safeError: {
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_RATE_LIMITED",
        retryable: true,
      },
    });
  });

  it("returns retryable safe failures for transport errors", async () => {
    const client = new FetchGitHubGraphQLClient(undefined, async () => {
      throw new Error("network reset with secret-token");
    });

    const result = await client.request({
      query: "query Viewer { viewer { login } }",
      token: "secret-token",
    });

    expect(result).toMatchObject({
      kind: "failure",
      safeError: {
        code: "CONTROL_PLANE_GITHUB_GRAPHQL_TRANSPORT_FAILED",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
