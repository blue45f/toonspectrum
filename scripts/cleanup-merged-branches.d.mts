export type GitHubCompareSummary = Readonly<{
  status?: string;
  ahead_by?: number;
  behind_by?: number;
}>;

export type BranchDeletionCandidate = Readonly<{
  branch: string;
  defaultBranch: string;
  workflowBranch?: string | null;
  protectedBranch: boolean;
  sameRepository: boolean;
  currentSha: string;
  compare: GitHubCompareSummary | null;
}>;

export type BranchDeletionDecision = Readonly<{
  allowed: boolean;
  reason:
    | "merged"
    | "fork"
    | "default-branch"
    | "active-workflow-branch"
    | "protected-branch"
    | "invalid-sha"
    | "unique-commits";
}>;

export function encodeGitRef(branch: string): string;
export function compareProvesMerged(compare: GitHubCompareSummary | null | undefined): boolean;
export function classifyBranchDeletion(candidate: BranchDeletionCandidate): BranchDeletionDecision;
export function main(argv?: string[], env?: NodeJS.ProcessEnv): Promise<void>;
