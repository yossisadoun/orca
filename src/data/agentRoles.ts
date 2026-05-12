import type { AgentRoleId } from "../types";

export const agentRoleMeta: Record<AgentRoleId, { label: string }> = {
  ui_ux_designer: { label: "UI/UX designer" },
  engineer: { label: "Engineer" },
  product: { label: "Product" },
  qa: { label: "QA" },
  writer: { label: "Technical writer" },
};
