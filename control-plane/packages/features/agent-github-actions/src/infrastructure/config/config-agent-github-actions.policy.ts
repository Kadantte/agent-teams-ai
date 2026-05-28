import type { ControlPlaneConfigService } from "@agent-teams-control-plane/platform-config";

import {
  agentGitHubActionsFeatureDisabledError,
  type AgentGitHubActionsFeature,
  type AgentGitHubActionsFeatureGatePolicy,
  type AgentGitHubActionsSettings,
} from "../../application/ports/policies.js";

export class ConfigAgentGitHubActionsFeatureGatePolicy implements AgentGitHubActionsFeatureGatePolicy {
  public constructor(private readonly configService: ControlPlaneConfigService) {}

  public assertEnabled(feature: AgentGitHubActionsFeature): Promise<void> {
    if (!this.isEnabled(feature)) {
      throw agentGitHubActionsFeatureDisabledError(feature);
    }
    return Promise.resolve();
  }

  public isEnabled(feature: AgentGitHubActionsFeature): boolean {
    void feature;
    return this.configService.getConfig().featureGates.githubActionsEnabled;
  }
}

export class ConfigAgentGitHubActionsSettings implements AgentGitHubActionsSettings {
  public constructor(private readonly configService: ControlPlaneConfigService) {}

  public defaultAgentAvatarUrl(): string | undefined {
    return this.configService.getConfig().githubActions.defaultAgentAvatarUrl;
  }

  public agentAvatarAllowedOrigins(): readonly string[] {
    return this.configService.getConfig().githubActions.agentAvatarAllowedOrigins;
  }

  public externalContentRetentionDays(): number | undefined {
    return this.configService.getConfig().retention.externalContentDays;
  }

  public githubGraphqlEndpoint(): string | undefined {
    return this.configService.getConfig().github.graphqlEndpoint;
  }

  public githubRestApiVersion(): string | undefined {
    return this.configService.getConfig().github.restApiVersion;
  }
}
