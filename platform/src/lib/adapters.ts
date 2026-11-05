// =============================================================================
// Adapter: convergono le risposte BFF reali nei tipi del frontend.
// =============================================================================

import type {
  Platform,
  PlatformId,
  Post,
  SocialSummary,
  ScheduledPost,
  Task,
  TaskStatus,
  Agent,
  DashboardStat,
  PostKind,
} from "./types";
import type {
  PlatformConnection,
  SocialPost,
  SocialScheduledPost,
  SocialSummaryResponse,
  PlatformTask,
  RosterEntry,
  BusinessPulse,
} from "./platform-api";

const PLATFORM_IDS: PlatformId[] = [
  "instagram",
  "linkedin",
  "tiktok",
  "x",
  "facebook",
  "youtube",
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  linkedin: "#0A66C2",
  tiktok: "#FE2C55",
  x: "#000000",
  facebook: "#1877F2",
  youtube: "#FF0000",
};

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "/icons/instagram.svg",
  linkedin: "/icons/linkedin.svg",
  tiktok: "/icons/tiktok.svg",
  x: "/icons/x.svg",
  facebook: "/icons/facebook.svg",
  youtube: "/icons/youtube.svg",
};

export function adaptPlatforms(conns: PlatformConnection[]): Platform[] {
  return conns.map((c) => {
    const pid = PLATFORM_IDS.find(
      (p) => p === c.provider || c.label.toLowerCase().includes(p),
    ) ?? "instagram";
    return {
      id: pid,
      name: c.label,
      status: c.connected ? "connected" : "disconnected",
      accountName: undefined,
      avatar: undefined,
      stats: { posts: 0, followers: 0 },
      icon: PLATFORM_ICONS[pid] ?? "/icons/default.svg",
      color: PLATFORM_COLORS[pid] ?? "#94A3B8",
    };
  });
}

export function adaptSocialPosts(posts: SocialPost[]): Post[] {
  return posts.map((p) => ({
    id: p.id,
    platform: "instagram" as PlatformId,
    text: p.name,
    kind: "post" as PostKind,
    status: (p.status === "published"
      ? "published"
      : p.status === "scheduled"
        ? "scheduled"
        : "draft") as Post["status"],
    date: p.createdAt,
    engagement: { likes: 0, comments: 0, shares: 0 },
  }));
}

export function adaptSocialScheduledPosts(
  posts: SocialScheduledPost[],
): ScheduledPost[] {
  return posts.map((p) => ({
    id: p.id,
    platform: "instagram" as PlatformId,
    title: p.title,
    date: p.runAt ?? p.createdAt,
  }));
}

export function adaptSocialSummary(
  s?: SocialSummaryResponse,
): SocialSummary {
  if (!s) return { totalFollowers: 0, engagementRate: 0, postsThisWeek: 0, reach: 0 };
  return {
    totalFollowers: 0,
    engagementRate: 0,
    postsThisWeek: s.totalPosts,
    reach: s.totalPosts,
  };
}

const STATUS_MAP: Record<string, TaskStatus> = {
  pending: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  scheduled: "scheduled",
};

export function adaptTasks(tasks: PlatformTask[]): Task[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    agentId: t.runId,
    agentName: t.droid,
    platform: "instagram",
    status: STATUS_MAP[t.status] ?? "pending",
    date: t.startedAt ?? t.finishedAt ?? new Date().toISOString(),
    priority: "medium",
    type: undefined,
    durationMs:
      t.startedAt && t.finishedAt
        ? new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()
        : undefined,
  }));
}

export function adaptRoster(roster: RosterEntry[]): Agent[] {
  return roster.map((r) => ({
    id: r.id,
    name: r.name,
    type: "content" as Agent["type"],
    status: (r.tasks > 0 && r.running > 0 ? "active" : r.failed > 0 ? "error" : "paused") as Agent["status"],
    description: `${r.role} · ${r.department}`,
    lastRun: r.lastTaskAt,
    tasksCompleted: r.done,
    targetPlatforms: [],
  }));
}

export function adaptDashboardStats(pulse?: BusinessPulse): DashboardStat[] {
  if (!pulse) return [];
  const { runs, tasks, assets } = pulse.counters;
  return [
    {
      id: "tasks",
      label: "Task attivi",
      value: String(runs.total),
      delta: String(tasks.running),
      trend: tasks.running > 0 ? "up" : "flat",
      icon: "tasks",
    },
    {
      id: "agents",
      label: "Agenti",
      value: String(pulse.areaTiles.length),
      delta: undefined,
      trend: "flat",
      icon: "agents",
    },
    {
      id: "assets",
      label: "Deliverable",
      value: String(assets.delivered),
      delta: String(assets.inReview),
      trend: assets.inReview > 0 ? "up" : "flat",
      icon: "platforms",
    },
    {
      id: "credits",
      label: "Crediti disponibili",
      value: String(pulse.credits.available),
      delta: undefined,
      trend: "flat",
      icon: "credits",
    },
  ];
}
