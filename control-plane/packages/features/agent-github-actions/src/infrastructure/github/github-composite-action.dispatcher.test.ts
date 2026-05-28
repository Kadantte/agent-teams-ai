import { describe, expect, it } from "vitest";

import type {
  GitHubActionDispatchResult,
  GitHubActionDispatcher,
} from "../../application/ports/github-action-dispatcher.port.js";
import { GitHubCompositeActionDispatcher } from "./github-composite-action.dispatcher.js";

describe("GitHubCompositeActionDispatcher", () => {
  it("routes check runs to REST and body actions to GraphQL", async () => {
    const graphql = new RecordingDispatcher({
      githubDeliveryId: "graphql",
      kind: "success",
    });
    const rest = new RecordingDispatcher({ githubDeliveryId: "rest", kind: "success" });
    const dispatcher = new GitHubCompositeActionDispatcher(graphql, rest);

    await expect(
      dispatcher.dispatch(dispatchInput("github.issue_comment.create")),
    ).resolves.toMatchObject({
      githubDeliveryId: "graphql",
      kind: "success",
    });
    await expect(
      dispatcher.dispatch(dispatchInput("github.check_run.create_or_update")),
    ).resolves.toMatchObject({
      githubDeliveryId: "rest",
      kind: "success",
    });

    expect(graphql.actionTypes).toEqual(["github.issue_comment.create"]);
    expect(rest.actionTypes).toEqual(["github.check_run.create_or_update"]);
  });
});

class RecordingDispatcher implements GitHubActionDispatcher {
  public readonly actionTypes: string[] = [];

  public constructor(private readonly result: GitHubActionDispatchResult) {}

  public dispatch(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
  ): Promise<GitHubActionDispatchResult> {
    this.actionTypes.push(input.actionType);
    return Promise.resolve(this.result);
  }
}

function dispatchInput(
  actionType: Parameters<GitHubActionDispatcher["dispatch"]>[0]["actionType"],
): Parameters<GitHubActionDispatcher["dispatch"]>[0] {
  return {
    actionRequestId: "action-1",
    actionType,
    payload:
      actionType === "github.check_run.create_or_update"
        ? {
            headSha: "a".repeat(40),
            name: "Agent Teams / review",
            status: "queued",
          }
        : {
            body: "body",
            issueNumber: 1,
          },
    renderedBody: "rendered",
    target: { owner: "octo", repo: "repo" },
    tokenLease: {
      expiresAtMs: 1000,
      githubInstallationId: "installation-1",
      token: "secret-token",
    },
  };
}
