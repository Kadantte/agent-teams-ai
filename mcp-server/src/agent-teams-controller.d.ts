declare module 'agent-teams-controller' {
  export interface ControllerContextOptions {
    teamName: string;
    claudeDir?: string;
  }

  export interface ControllerTaskApi {
    createTask(flags: Record<string, unknown>): unknown;
    getTask(taskId: string): unknown;
    listTasks(): unknown[];
    setTaskStatus(taskId: string, status: string, actor?: string): unknown;
    startTask(taskId: string, actor?: string): unknown;
    completeTask(taskId: string, actor?: string): unknown;
    setTaskOwner(taskId: string, owner: string | null): unknown;
    addTaskComment(taskId: string, flags: Record<string, unknown>): unknown;
    attachTaskFile(taskId: string, flags: Record<string, unknown>): unknown;
    attachCommentFile(taskId: string, commentId: string, flags: Record<string, unknown>): unknown;
    setNeedsClarification(taskId: string, value: string | null): unknown;
    linkTask(taskId: string, targetId: string, linkType: string): unknown;
    unlinkTask(taskId: string, targetId: string, linkType: string): unknown;
    taskBriefing(memberName: string): Promise<string>;
  }

  export interface ControllerKanbanApi {
    getKanbanState(): unknown;
    setKanbanColumn(taskId: string, column: string): unknown;
    clearKanban(taskId: string): unknown;
    listReviewers(): string[];
    addReviewer(reviewer: string): string[];
    removeReviewer(reviewer: string): string[];
  }

  export interface ControllerReviewApi {
    approveReview(taskId: string, flags?: Record<string, unknown>): unknown;
    requestChanges(taskId: string, flags?: Record<string, unknown>): unknown;
  }

  export interface ControllerMessageApi {
    sendMessage(flags: Record<string, unknown>): unknown;
  }

  export interface ControllerProcessApi {
    registerProcess(flags: Record<string, unknown>): unknown;
    unregisterProcess(flags: Record<string, unknown>): unknown;
    listProcesses(): unknown[];
  }

  export interface AgentTeamsController {
    tasks: ControllerTaskApi;
    kanban: ControllerKanbanApi;
    review: ControllerReviewApi;
    messages: ControllerMessageApi;
    processes: ControllerProcessApi;
  }

  export function createController(options: ControllerContextOptions): AgentTeamsController;
}
