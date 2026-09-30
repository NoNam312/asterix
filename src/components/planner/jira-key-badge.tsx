import { JIRA_COLOR } from "@/lib/jira-issues";

/** "KAN-39" as a small filled purple pill: marks quests made from Jira issues. */
export function JiraKeyBadge({ issueKey }: { issueKey: string }) {
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-semibold leading-4 text-white"
      style={{ background: JIRA_COLOR }}
      title={`From Jira: ${issueKey}`}
      aria-label={`From Jira: ${issueKey}`}
    >
      {issueKey}
    </span>
  );
}
