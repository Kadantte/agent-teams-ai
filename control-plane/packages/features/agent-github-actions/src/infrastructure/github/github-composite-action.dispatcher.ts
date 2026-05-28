import type {
  GitHubActionDispatchResult,
  GitHubActionDispatcher,
} from "../../application/ports/github-action-dispatcher.port.js";

export class GitHubCompositeActionDispatcher implements GitHubActionDispatcher {
  public constructor(
    private readonly graphqlDispatcher: GitHubActionDispatcher,
    private readonly restDispatcher: GitHubActionDispatcher,
  ) {}

  public dispatch(
    input: Parameters<GitHubActionDispatcher["dispatch"]>[0],
  ): Promise<GitHubActionDispatchResult> {
    if (input.actionType === "github.check_run.create_or_update") {
      return this.restDispatcher.dispatch(input);
    }
    return this.graphqlDispatcher.dispatch(input);
  }
}
