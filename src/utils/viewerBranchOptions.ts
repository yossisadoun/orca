import type { Issue } from "../types";

export type ViewerBranchOption = {
  value: string;
  label: string;
};

function slugifyForBranch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}

/** Git-style branch value for a Human Review issue. */
export function humanReviewBranchValue(issue: Issue): string {
  const slug = slugifyForBranch(issue.title);
  const tail = slug ? `-${slug}` : "";
  return `feature/${issue.id.toLowerCase()}${tail}`;
}

/** Options for the Viewer branch selector: production, main, then feature/* for Human Review issues. */
export function viewerBranchOptionsFromIssues(issues: Issue[]): {
  release: ViewerBranchOption[];
  humanReview: ViewerBranchOption[];
} {
  const release: ViewerBranchOption[] = [
    { value: "production", label: "production" },
    { value: "main", label: "main" },
  ];
  const humanReview = issues
    .filter((i) => i.status === "human_review")
    .map((i) => {
      const value = humanReviewBranchValue(i);
      return {
        value,
        label: `${value} (${i.id})`,
      };
    });
  return { release, humanReview };
}

/** Resolves the Human Review board row for a viewer branch `value`, if any. */
export function findHumanReviewIssueForBranch(
  issues: Issue[],
  branchValue: string,
): Issue | undefined {
  return issues.find(
    (i) => i.status === "human_review" && humanReviewBranchValue(i) === branchValue,
  );
}
