import { Module } from "@nestjs/common";

import { ExternalActionContentModule } from "@agent-teams-control-plane/features-external-action-content/interface/nest";
import {
  LoadExternalActionContentUseCase,
  ShredExternalActionContentUseCase,
  StoreExternalActionContentUseCase,
} from "@agent-teams-control-plane/features-external-action-content";
import { GitHubTokenBrokerModule } from "@agent-teams-control-plane/features-github-token-broker/interface/nest";
import { IssueGitHubInstallationTokenUseCase } from "@agent-teams-control-plane/features-github-token-broker";
import { IntegrationTargetsModule } from "@agent-teams-control-plane/features-integration-targets/interface/nest";
import { EvaluateTargetPolicyUseCase } from "@agent-teams-control-plane/features-integration-targets";
import { OutboxModule } from "@agent-teams-control-plane/features-outbox/interface/nest";
import { AppendOutboxEventUseCase } from "@agent-teams-control-plane/features-outbox";
import { WorkspaceIdentityModule } from "@agent-teams-control-plane/features-workspace-identity/interface/nest";
import {
  ControlPlaneConfigService,
  PlatformConfigModule,
} from "@agent-teams-control-plane/platform-config";
import {
  TRANSACTION_RUNNER,
  type TransactionRunner as PlatformTransactionRunner,
} from "@agent-teams-control-plane/platform-database";
import { PlatformDatabaseModule } from "@agent-teams-control-plane/platform-database/nest";

import type { GitHubActionContentStore } from "../../application/ports/github-action-content-store.port.js";
import type { GitHubActionDispatcher } from "../../application/ports/github-action-dispatcher.port.js";
import type { GitHubActionIdGenerator } from "../../application/ports/entropy.js";
import type { GitHubActionOutbox } from "../../application/ports/github-action-outbox.port.js";
import type { GitHubActionRepository } from "../../application/ports/github-action.repository.js";
import type { GitHubInstallationTokenBrokerPort } from "../../application/ports/github-installation-token-broker.port.js";
import type {
  AgentGitHubActionsAuditLog,
  AgentGitHubActionsFeatureGatePolicy,
  AgentGitHubActionsSettings,
} from "../../application/ports/policies.js";
import type { TargetPolicyEvaluatorPort } from "../../application/ports/target-policy-evaluator.port.js";
import type { TransactionRunner } from "../../application/ports/transaction-runner.js";
import { DispatchGitHubActionUseCase } from "../../application/use-cases/dispatch-github-action.use-case.js";
import { GetGitHubActionStatusUseCase } from "../../application/use-cases/get-github-action-status.use-case.js";
import { RequestGitHubActionUseCase } from "../../application/use-cases/request-github-action.use-case.js";
import {
  ConfigAgentGitHubActionsFeatureGatePolicy,
  ConfigAgentGitHubActionsSettings,
} from "../../infrastructure/config/config-agent-github-actions.policy.js";
import { ExternalActionContentStoreAdapter } from "../../infrastructure/crypto/external-action-content-store.adapter.js";
import { NodeGitHubActionIdGenerator } from "../../infrastructure/crypto/node-github-action-id-generator.js";
import { GitHubCompositeActionDispatcher } from "../../infrastructure/github/github-composite-action.dispatcher.js";
import { GitHubGraphQLActionDispatcher } from "../../infrastructure/github/github-graphql-action.dispatcher.js";
import { FetchGitHubGraphQLClient } from "../../infrastructure/github/github-graphql.client.js";
import { GitHubRestActionDispatcher } from "../../infrastructure/github/github-rest-action.dispatcher.js";
import { GitHubActionDispatchHandler } from "../../infrastructure/outbox/github-action-dispatch.handler.js";
import { GitHubActionOutboxAdapter } from "../../infrastructure/outbox/github-action-outbox.adapter.js";
import { IntegrationTargetPolicyEvaluatorAdapter } from "../../infrastructure/policy/integration-target-policy-evaluator.adapter.js";
import { PrismaGitHubActionAuditLog } from "../../infrastructure/prisma/prisma-github-action-audit-log.js";
import { PrismaGitHubActionRepository } from "../../infrastructure/prisma/prisma-github-action.repository.js";
import { GitHubTokenBrokerAdapter } from "../../infrastructure/token-broker/github-token-broker.adapter.js";
import { GitHubActionOutboxRegistrar } from "./github-action-outbox-registrar.js";
import { GitHubActionsController } from "./github-actions.controller.js";
import {
  AGENT_GITHUB_ACTIONS_AUDIT_LOG,
  AGENT_GITHUB_ACTIONS_FEATURE_GATE_POLICY,
  AGENT_GITHUB_ACTIONS_SETTINGS,
  GITHUB_ACTION_CONTENT_STORE,
  GITHUB_ACTION_DISPATCHER,
  GITHUB_ACTION_ID_GENERATOR,
  GITHUB_ACTION_OUTBOX,
  GITHUB_ACTION_REPOSITORY,
  GITHUB_ACTION_TARGET_POLICY_EVALUATOR,
  GITHUB_ACTION_TOKEN_BROKER,
} from "./tokens.js";

@Module({
  controllers: [GitHubActionsController],
  exports: [DispatchGitHubActionUseCase, RequestGitHubActionUseCase],
  imports: [
    PlatformConfigModule,
    PlatformDatabaseModule,
    ExternalActionContentModule,
    OutboxModule,
    WorkspaceIdentityModule,
    IntegrationTargetsModule,
    GitHubTokenBrokerModule,
  ],
  providers: [
    PrismaGitHubActionRepository,
    PrismaGitHubActionAuditLog,
    NodeGitHubActionIdGenerator,
    {
      provide: AGENT_GITHUB_ACTIONS_FEATURE_GATE_POLICY,
      inject: [ControlPlaneConfigService],
      useFactory: (configService: ControlPlaneConfigService) =>
        new ConfigAgentGitHubActionsFeatureGatePolicy(configService),
    },
    {
      provide: AGENT_GITHUB_ACTIONS_SETTINGS,
      inject: [ControlPlaneConfigService],
      useFactory: (configService: ControlPlaneConfigService) =>
        new ConfigAgentGitHubActionsSettings(configService),
    },
    {
      provide: GITHUB_ACTION_REPOSITORY,
      useExisting: PrismaGitHubActionRepository,
    },
    {
      provide: AGENT_GITHUB_ACTIONS_AUDIT_LOG,
      useExisting: PrismaGitHubActionAuditLog,
    },
    {
      provide: GITHUB_ACTION_ID_GENERATOR,
      useExisting: NodeGitHubActionIdGenerator,
    },
    {
      provide: GITHUB_ACTION_CONTENT_STORE,
      inject: [
        StoreExternalActionContentUseCase,
        LoadExternalActionContentUseCase,
        ShredExternalActionContentUseCase,
      ],
      useFactory: (
        store: StoreExternalActionContentUseCase,
        load: LoadExternalActionContentUseCase,
        shred: ShredExternalActionContentUseCase,
      ) => new ExternalActionContentStoreAdapter(store, load, shred),
    },
    {
      provide: GITHUB_ACTION_OUTBOX,
      inject: [AppendOutboxEventUseCase, GITHUB_ACTION_ID_GENERATOR],
      useFactory: (
        appendOutboxEvent: AppendOutboxEventUseCase,
        ids: GitHubActionIdGenerator,
      ) => new GitHubActionOutboxAdapter(appendOutboxEvent, ids),
    },
    {
      provide: GITHUB_ACTION_TARGET_POLICY_EVALUATOR,
      inject: [EvaluateTargetPolicyUseCase],
      useFactory: (evaluatePolicy: EvaluateTargetPolicyUseCase) =>
        new IntegrationTargetPolicyEvaluatorAdapter(evaluatePolicy),
    },
    {
      provide: GITHUB_ACTION_TOKEN_BROKER,
      inject: [IssueGitHubInstallationTokenUseCase],
      useFactory: (tokenBroker: IssueGitHubInstallationTokenUseCase) =>
        new GitHubTokenBrokerAdapter(tokenBroker),
    },
    {
      provide: GITHUB_ACTION_DISPATCHER,
      inject: [AGENT_GITHUB_ACTIONS_SETTINGS],
      useFactory: (settings: AgentGitHubActionsSettings) =>
        new GitHubCompositeActionDispatcher(
          new GitHubGraphQLActionDispatcher(
            new FetchGitHubGraphQLClient(settings.githubGraphqlEndpoint()),
          ),
          new GitHubRestActionDispatcher(settings),
        ),
    },
    {
      provide: RequestGitHubActionUseCase,
      inject: [
        AGENT_GITHUB_ACTIONS_FEATURE_GATE_POLICY,
        AGENT_GITHUB_ACTIONS_SETTINGS,
        GITHUB_ACTION_TARGET_POLICY_EVALUATOR,
        GITHUB_ACTION_CONTENT_STORE,
        GITHUB_ACTION_REPOSITORY,
        GITHUB_ACTION_OUTBOX,
        TRANSACTION_RUNNER,
        GITHUB_ACTION_ID_GENERATOR,
        AGENT_GITHUB_ACTIONS_AUDIT_LOG,
      ],
      useFactory: (
        featureGate: AgentGitHubActionsFeatureGatePolicy,
        settings: AgentGitHubActionsSettings,
        targetPolicy: TargetPolicyEvaluatorPort,
        contentStore: GitHubActionContentStore,
        repository: GitHubActionRepository,
        outbox: GitHubActionOutbox,
        transactions: PlatformTransactionRunner,
        ids: GitHubActionIdGenerator,
        auditLog: AgentGitHubActionsAuditLog,
      ) =>
        new RequestGitHubActionUseCase(
          featureGate,
          settings,
          targetPolicy,
          contentStore,
          repository,
          outbox,
          transactions satisfies TransactionRunner,
          ids,
          auditLog,
        ),
    },
    {
      provide: DispatchGitHubActionUseCase,
      inject: [
        AGENT_GITHUB_ACTIONS_FEATURE_GATE_POLICY,
        AGENT_GITHUB_ACTIONS_SETTINGS,
        GITHUB_ACTION_REPOSITORY,
        GITHUB_ACTION_CONTENT_STORE,
        GITHUB_ACTION_TARGET_POLICY_EVALUATOR,
        GITHUB_ACTION_TOKEN_BROKER,
        GITHUB_ACTION_DISPATCHER,
        TRANSACTION_RUNNER,
        AGENT_GITHUB_ACTIONS_AUDIT_LOG,
      ],
      useFactory: (
        featureGate: AgentGitHubActionsFeatureGatePolicy,
        settings: AgentGitHubActionsSettings,
        repository: GitHubActionRepository,
        contentStore: GitHubActionContentStore,
        targetPolicy: TargetPolicyEvaluatorPort,
        tokenBroker: GitHubInstallationTokenBrokerPort,
        dispatcher: GitHubActionDispatcher,
        transactions: PlatformTransactionRunner,
        auditLog: AgentGitHubActionsAuditLog,
      ) =>
        new DispatchGitHubActionUseCase(
          featureGate,
          settings,
          repository,
          contentStore,
          targetPolicy,
          tokenBroker,
          dispatcher,
          transactions satisfies TransactionRunner,
          auditLog,
        ),
    },
    {
      provide: GetGitHubActionStatusUseCase,
      inject: [GITHUB_ACTION_REPOSITORY],
      useFactory: (repository: GitHubActionRepository) =>
        new GetGitHubActionStatusUseCase(repository),
    },
    {
      provide: GitHubActionDispatchHandler,
      inject: [DispatchGitHubActionUseCase],
      useFactory: (dispatchGitHubAction: DispatchGitHubActionUseCase) =>
        new GitHubActionDispatchHandler(dispatchGitHubAction),
    },
    GitHubActionOutboxRegistrar,
  ],
})
export class AgentGitHubActionsModule {}
