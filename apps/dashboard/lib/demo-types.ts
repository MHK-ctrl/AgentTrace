export interface DemoSession {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  runCount: number;
  maxRuns: number;
  runsRemaining: number;
  retentionHours: number;
}
