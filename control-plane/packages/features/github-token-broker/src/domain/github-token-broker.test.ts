import { describe, expect, it } from "vitest";

import {
  mapCapabilityToGitHubPermissions,
  toGitHubRepositoryJsonId,
  validateIssuedTokenScope,
} from "./github-token-broker.js";

describe("github token broker domain", () => {
  it("maps product capabilities to minimum GitHub permissions", () => {
    expect(mapCapabilityToGitHubPermissions("github.issue_comment.request")).toEqual({
      issues: "write",
    });
    expect(mapCapabilityToGitHubPermissions("github.pr_comment.request")).toEqual({
      pull_requests: "write",
    });
    expect(mapCapabilityToGitHubPermissions("github.pr_review.request")).toEqual({
      pull_requests: "write",
    });
    expect(mapCapabilityToGitHubPermissions("github.check_run.request")).toEqual({
      checks: "write",
    });
  });

  it("denies unknown capabilities", () => {
    expect(() =>
      mapCapabilityToGitHubPermissions("github.contents_write.request"),
    ).toThrowError(
      expect.objectContaining({
        code: "CONTROL_PLANE_GITHUB_TOKEN_CAPABILITY_DENIED",
      }),
    );
  });

  it("converts decimal repository ids to safe JSON integers", () => {
    expect(toGitHubRepositoryJsonId("1234567890")).toBe(1_234_567_890);
  });

  it("rejects non-decimal and unsafe repository ids", () => {
    expect(() => toGitHubRepositoryJsonId("repo-name")).toThrowError(
      expect.objectContaining({
        code: "CONTROL_PLANE_GITHUB_REPOSITORY_ID_UNSUPPORTED",
      }),
    );
    expect(() =>
      toGitHubRepositoryJsonId(String(Number.MAX_SAFE_INTEGER + 1)),
    ).toThrowError(
      expect.objectContaining({
        code: "CONTROL_PLANE_GITHUB_REPOSITORY_ID_UNSUPPORTED",
      }),
    );
  });

  it("rejects broader token scopes returned by GitHub", () => {
    expect(
      validateIssuedTokenScope({
        grantedPermissions: { contents: "write" },
        grantedRepositoryIds: [123, 456],
        requestedPermissions: { issues: "write" },
        requestedRepositoryIds: [123],
      }),
    ).toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_SCOPE_MISMATCH",
    });
    expect(
      validateIssuedTokenScope({
        grantedPermissions: { issues: "admin" },
        grantedRepositoryIds: [123],
        requestedPermissions: { issues: "write" },
        requestedRepositoryIds: [123],
      }),
    ).toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_SCOPE_MISMATCH",
    });
  });

  it("allows GitHub metadata read as an implicit permission in returned scope", () => {
    expect(
      validateIssuedTokenScope({
        grantedPermissions: { issues: "write", metadata: "read" },
        grantedRepositoryIds: [123],
        requestedPermissions: { issues: "write" },
        requestedRepositoryIds: [123],
      }),
    ).toBeUndefined();
  });
});
