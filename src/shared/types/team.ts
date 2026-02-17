export interface TeamMember {
  name: string;
}

export interface TeamConfig {
  name: string;
  description?: string;
  members?: TeamMember[];
}

export interface TeamSummary {
  name: string;
  description: string;
  memberCount: number;
  taskCount: number;
  lastActivity: string | null;
}
