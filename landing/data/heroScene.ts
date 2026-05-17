import robotAvatarCyan from "~/assets/images/hero/robots/robot-avatar-cyan-cat-v1.webp";
import robotAvatarReviewerTeal from "~/assets/images/hero/robots/robot-avatar-reviewer-teal-v1.webp";
import robotAvatarSeatedMagenta from "~/assets/images/hero/robots/robot-avatar-seated-magenta-v1.webp";
import robotAvatarYellow from "~/assets/images/hero/robots/robot-avatar-yellow-star-v1.webp";
import robotRedPurpleHandshake from "~/assets/images/hero/robots/robot-red-purple-handshake-v1.webp";

export const HERO_SCENE_BREAKPOINTS = {
  desktop: 1200,
  tablet: 768,
} as const;

export type HeroAgentRole =
  | "planner"
  | "lead"
  | "reviewer"
  | "developer"
  | "tester"
  | "researcher"
  | "docs"
  | "ops"
  | "security"
  | "fixer";

export type HeroAccent = "cyan" | "magenta" | "violet" | "amber" | "red";
export type HeroMessagePhase = "sender" | "packet" | "receiver" | "cooldown";

export type HeroCardSide = "left" | "right" | "bottom";

export type HeroAgentPosition = {
  x: number;
  y: number;
  scale: number;
  depth: number;
  card: HeroCardSide;
};

export type HeroAgent = {
  id: HeroAgentRole;
  label: string;
  asset: string;
  accent: HeroAccent;
  facing?: -1 | 1;
  lean?: number;
  priority?: boolean;
  desktop: HeroAgentPosition;
  tablet: HeroAgentPosition;
  mobile: {
    visible: boolean;
    order?: number;
    compactLabel?: string;
  };
  status: string;
  tasks: string[];
};

export type HeroMessage = {
  id: string;
  from: HeroAgentRole;
  to: HeroAgentRole | "video";
  text: string;
  response: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export const heroAgents: readonly HeroAgent[] = [
  {
    id: "planner",
    label: "Planner",
    asset: robotAvatarSeatedMagenta,
    accent: "magenta",
    facing: 1,
    lean: -2,
    priority: true,
    desktop: { x: 32.65, y: 19.45, scale: 0.44, depth: 0.35, card: "right" },
    tablet: { x: 20, y: 31, scale: 0.44, depth: 0.22, card: "bottom" },
    mobile: { visible: true, order: 1, compactLabel: "Plan" },
    status: "Planning",
    tasks: ["Analyze requirements", "Break down tasks", "Create plan"],
  },
  {
    id: "lead",
    label: "Lead",
    asset: robotAvatarCyan,
    accent: "cyan",
    facing: -1,
    lean: 2,
    priority: true,
    desktop: { x: 58.9, y: 32.76, scale: 0.48, depth: 0.32, card: "right" },
    tablet: { x: 50, y: 31, scale: 0.42, depth: 0.2, card: "bottom" },
    mobile: { visible: true, order: 2, compactLabel: "Lead" },
    status: "Leading",
    tasks: ["Define architecture", "Set priorities", "Coordinate team"],
  },
  {
    id: "developer",
    label: "Developer",
    asset: robotAvatarYellow,
    accent: "amber",
    facing: 1,
    lean: -1,
    priority: true,
    desktop: { x: 72, y: 32.4, scale: 0.48, depth: 0.34, card: "right" },
    tablet: { x: 80, y: 31, scale: 0.4, depth: 0.22, card: "bottom" },
    mobile: { visible: true, order: 3, compactLabel: "Code" },
    status: "Coding",
    tasks: ["Implement feature", "Update code", "Run checks"],
  },
] as const;

export const heroReviewerFeatureCard = {
  label: "Reviewer",
  asset: robotAvatarReviewerTeal,
  accent: "cyan",
  status: "Reviewing",
  tasks: ["Review code", "Check quality", "Request changes"],
} as const;

export const heroCollaborationFeature = {
  asset: robotRedPurpleHandshake,
} as const;

export const heroMessages: readonly HeroMessage[] = [
  {
    id: "plan-ready",
    from: "planner",
    to: "lead",
    text: "Plan ready.",
    response: "Priority set.",
    fromX: 29.2,
    fromY: 13,
    toX: 58.8,
    toY: 8.6,
  },
  {
    id: "build-ready",
    from: "lead",
    to: "developer",
    text: "Build scope set.",
    response: "Coding started.",
    fromX: 58.8,
    fromY: 8.6,
    toX: 72,
    toY: 7,
  },
  {
    id: "review-build",
    from: "developer",
    to: "reviewer",
    text: "Review build.",
    response: "Checking quality.",
    fromX: 72,
    fromY: 7,
    toX: 84,
    toY: 82,
  },
  {
    id: "review-pass",
    from: "reviewer",
    to: "developer",
    text: "Review passed.",
    response: "Ready to ship.",
    fromX: 84,
    fromY: 82,
    toX: 72,
    toY: 7,
  },
] as const;

export const heroFeatureRail = [
  {
    id: "autonomous",
    title: "Give the Team a Goal",
    text: "Agents break it into tasks and start moving without babysitting.",
  },
  {
    id: "kanban",
    title: "Kanban That Updates Itself",
    text: "Cards shift as agents build, test, review, and unblock each other.",
  },
  {
    id: "developers",
    title: "Bring Your AI Stack",
    text: "Claude, Codex, and OpenCode teammates in one desktop cockpit.",
  },
  {
    id: "secure",
    title: "Stay in the Loop",
    text: "Jump in with comments, approvals, direct messages, or quick actions.",
  },
  {
    id: "local",
    title: "Your Machine, Your Code",
    text: "Local-first workflow with task logs, process control, and Git visibility.",
  },
] as const;
