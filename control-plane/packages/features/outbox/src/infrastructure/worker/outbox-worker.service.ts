import { Inject, Injectable } from "@nestjs/common";

import { ControlPlaneConfigService } from "@agent-teams-control-plane/platform-config";
import {
  CONTROL_PLANE_LOGGER,
  type ControlPlaneLogger,
} from "@agent-teams-control-plane/platform-logger";

import type { OutboxRepository } from "../../application/ports/outbox.repository.js";
import { OUTBOX_REPOSITORY } from "../../application/ports/outbox.tokens.js";
import { ProcessOutboxBatchUseCase } from "../../application/use-cases/process-outbox-batch.use-case.js";

export type OutboxWorkerRunResult = Readonly<{
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  staleClaims: number;
  skipped: boolean;
}>;

@Injectable()
export class OutboxWorkerService {
  private readonly logger: ControlPlaneLogger;
  private readonly workerId = `worker-${process.pid}`;

  public constructor(
    @Inject(ControlPlaneConfigService)
    private readonly configService: ControlPlaneConfigService,
    @Inject(OUTBOX_REPOSITORY)
    private readonly repository: OutboxRepository,
    @Inject(ProcessOutboxBatchUseCase)
    private readonly processBatch: ProcessOutboxBatchUseCase,
    @Inject(CONTROL_PLANE_LOGGER) logger: ControlPlaneLogger,
  ) {
    this.logger = logger.child("outbox-worker");
  }

  public async runOnce(): Promise<OutboxWorkerRunResult> {
    const config = this.configService.getConfig();
    if (!config.persistence.enabled || !config.outbox.workerEnabled) {
      this.logger.debug("Outbox worker skipped", {
        outboxWorkerEnabled: config.outbox.workerEnabled,
        persistenceEnabled: config.persistence.enabled,
      });
      return {
        claimed: 0,
        completed: 0,
        deadLettered: 0,
        retried: 0,
        skipped: true,
        staleClaims: 0,
      };
    }

    const recovered = await this.repository.recoverStaleProcessing({
      workerId: this.workerId,
    });
    const batch = await this.repository.claimNextBatch({
      batchSize: config.outbox.batchSize,
      leaseSeconds: config.outbox.leaseSeconds,
      workerId: this.workerId,
    });
    const result = await this.processBatch.execute({ batch });

    const metadata = {
      claimed: batch.length,
      completed: result.completed,
      deadLettered: result.deadLettered,
      recovered,
      retried: result.retried,
      staleClaims: result.staleClaims,
    };
    if (
      batch.length === 0 &&
      recovered === 0 &&
      result.completed === 0 &&
      result.deadLettered === 0 &&
      result.retried === 0 &&
      result.staleClaims === 0
    ) {
      this.logger.debug("Outbox worker idle", metadata);
    } else {
      this.logger.info("Outbox worker batch processed", metadata);
    }

    return {
      claimed: batch.length,
      completed: result.completed,
      deadLettered: result.deadLettered,
      retried: result.retried,
      skipped: false,
      staleClaims: result.staleClaims,
    };
  }
}
