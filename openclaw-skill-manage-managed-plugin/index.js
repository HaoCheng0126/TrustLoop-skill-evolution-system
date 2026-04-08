import { createSkillManageManagedTool } from "./src/skill-manage-managed.js";

export default {
  id: "skill-manage-managed",
  name: "TrustLoop Managed Skill Tool",
  register(api) {
    api.registerTool(createSkillManageManagedTool());
  },
};
