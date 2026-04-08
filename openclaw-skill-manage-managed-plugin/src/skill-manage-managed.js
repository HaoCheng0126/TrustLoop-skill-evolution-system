import { promises as fs } from "node:fs";
import path from "node:path";
import { Type } from "@sinclair/typebox";

const MANAGED_BY = "skill-evolver";
const ACTIVE_STATUSES = new Set([
  "pending_review",
  "approved",
  "revision_requested",
  "published",
]);
const AUTONOMY_MODES = ["manual", "assisted", "autonomous"];

const parameters = Type.Object(
  {
    workspace_root: Type.String({ minLength: 1 }),
    operation: Type.Union([
      Type.Literal("create_candidate"),
      Type.Literal("merge_candidate"),
      Type.Literal("get_mode"),
      Type.Literal("set_mode"),
      Type.Literal("review_candidate"),
      Type.Literal("publish_candidate"),
      Type.Literal("rollback_skill"),
    ]),
    candidate_id: Type.Optional(Type.String({ minLength: 1 })),
    skill_name: Type.Optional(Type.String({ minLength: 1 })),
    reason: Type.Optional(Type.String()),
    source_summary: Type.Optional(Type.String()),
    signal_type: Type.Optional(Type.String()),
    signal_count: Type.Optional(Type.Number()),
    proposed_skill_content: Type.Optional(Type.String()),
    target_skill: Type.Optional(Type.String()),
    change_type: Type.Optional(
      Type.Union([
        Type.Literal("create_skill"),
        Type.Literal("patch_skill"),
        Type.Literal("deprecate_skill"),
      ]),
    ),
    risk_level: Type.Optional(
      Type.Union([
        Type.Literal("low"),
        Type.Literal("medium"),
        Type.Literal("high"),
      ]),
    ),
    matched_rules: Type.Optional(Type.Array(Type.String())),
    source_tools: Type.Optional(Type.Array(Type.String())),
    diff_summary: Type.Optional(Type.String()),
    dedupe_basis: Type.Optional(Type.String()),
    merge_into_candidate_id: Type.Optional(Type.String({ minLength: 1 })),
    decision: Type.Optional(
      Type.Union([
        Type.Literal("approve"),
        Type.Literal("reject"),
        Type.Literal("revise"),
      ]),
    ),
    failure_reason: Type.Optional(Type.String()),
    suggestions: Type.Optional(Type.Array(Type.String())),
    replacement_skill_content: Type.Optional(Type.String()),
    publish_as: Type.Optional(Type.String()),
    autonomy_mode: Type.Optional(
      Type.Union([
        Type.Literal("manual"),
        Type.Literal("assisted"),
        Type.Literal("autonomous"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export function createSkillManageManagedTool() {
  return {
    name: "skill_manage_managed",
    description:
      "Safely manage skill-evolver candidates, approvals, revisions, publishing, dedupe, rollback, and autonomy modes inside the current workspace.",
    parameters,
    async execute(_invocationId, input) {
      try {
        const result = await handleOperation(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const result = {
          ok: false,
          operation: input.operation ?? null,
          error_code: error.code || "INTERNAL_ERROR",
          message: error.message || "Unknown error",
          blocking_record: error.blockingRecord || null,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: true,
        };
      }
    },
  };
}

async function handleOperation(input) {
  const workspaceRoot = await resolveWorkspaceRoot(input.workspace_root);
  await ensureState(workspaceRoot);

  switch (input.operation) {
    case "create_candidate":
      return createCandidate(workspaceRoot, input);
    case "merge_candidate":
      return mergeCandidate(workspaceRoot, input);
    case "get_mode":
      return getMode(workspaceRoot);
    case "set_mode":
      return setMode(workspaceRoot, input);
    case "review_candidate":
      return reviewCandidate(workspaceRoot, input);
    case "publish_candidate":
      return publishCandidate(workspaceRoot, input);
    case "rollback_skill":
      return rollbackSkill(workspaceRoot, input);
    default:
      throw createError("UNSUPPORTED_OPERATION", `Unsupported operation: ${input.operation}`);
  }
}

async function createCandidate(workspaceRoot, input) {
  requireFields(input, [
    "source_summary",
    "signal_type",
    "signal_count",
    "proposed_skill_content",
    "target_skill",
    "change_type",
    "risk_level",
  ]);

  const registry = await loadRegistry(workspaceRoot);
  const config = await loadConfig(workspaceRoot);
  const targetSkill = normalizeSkillName(input.target_skill, input.change_type);
  const skillsDir = path.join(workspaceRoot, "skills");
  const existingSkillPath = path.join(skillsDir, targetSkill, "SKILL.md");
  const existingSkillContent = await readIfExists(existingSkillPath);

  if (input.change_type === "create_skill") {
    if (existingSkillContent && isManagedSkill(existingSkillContent)) {
      throw createError(
        "SHOULD_PATCH_EXISTING",
        `Managed skill ${targetSkill} already exists; create a patch instead.`,
      );
    }
    if (existingSkillContent && !isManagedSkill(existingSkillContent)) {
      throw createError(
        "UNMANAGED_TARGET",
        `Target ${targetSkill} already exists and is not managed by ${MANAGED_BY}.`,
      );
    }
  }

  const blockingRecord = registry.records.find(
    (record) =>
      ACTIVE_STATUSES.has(record.status) &&
      record.target_skill === targetSkill &&
      input.change_type === "create_skill",
  );

  if (blockingRecord) {
    throw createError(
      "DUPLICATE_TARGET_SKILL",
      `A candidate or managed skill for ${targetSkill} already exists; patch or merge instead.`,
      blockingRecord,
    );
  }

  const candidateId = input.candidate_id || generateCandidateId(targetSkill);
  const now = new Date().toISOString();
  const record = {
    candidate_id: candidateId,
    status: "pending_review",
    source_summary: input.source_summary,
    signal_type: input.signal_type,
    signal_count: input.signal_count,
    target_skill: targetSkill,
    change_type: input.change_type,
    risk_level: input.risk_level,
    dedupe_basis: input.dedupe_basis || "new workflow candidate",
    merged_into: null,
    matched_rules: input.matched_rules || [],
    source_tools: input.source_tools || [],
    diff_summary: input.diff_summary || "initial candidate draft",
    failure_reason: null,
    review_suggestions: input.suggestions || [],
    revision_count: 0,
    created_at: now,
    approved_at: null,
    published_version: null,
    rollback_of: null,
    publish_effect: null,
    autonomy_mode: config.autonomy_mode,
    promotion_channel: null,
  };

  const candidatePath = candidateFilePath(workspaceRoot, candidateId);
  await writeCandidateFile(candidatePath, record, input.proposed_skill_content);
  registry.records.push(record);
  await saveRegistry(workspaceRoot, registry);

  const auditPath = await writeAuditEvent(workspaceRoot, "candidate_created", {
    candidate_id: candidateId,
    target_skill: targetSkill,
    status_before: null,
    status_after: "pending_review",
    decision_reason: input.reason || "candidate created",
    matched_rules: record.matched_rules,
    dedupe_basis: record.dedupe_basis,
    diff_summary: record.diff_summary,
    failure_reason: null,
    publish_effect: null,
    autonomy_mode: config.autonomy_mode,
  });

  const autoResult = await maybeAutoPromoteCandidate(workspaceRoot, registry, record, config, input.reason);

  return {
    ok: true,
    operation: "create_candidate",
    candidate_id: candidateId,
    skill_name: targetSkill,
    status_before: null,
    status_after: autoResult.status_after,
    candidate_path: relativeTo(workspaceRoot, candidatePath),
    audit_path: relativeTo(workspaceRoot, auditPath),
    autonomy_mode: config.autonomy_mode,
    auto_actions: autoResult.auto_actions,
    publish_result: autoResult.publish_result,
    message: autoResult.message || `Created candidate ${candidateId} for ${targetSkill}`,
  };
}

async function mergeCandidate(workspaceRoot, input) {
  requireFields(input, ["candidate_id", "merge_into_candidate_id", "reason"]);

  const registry = await loadRegistry(workspaceRoot);
  const source = getRecord(registry, input.candidate_id);
  const target = getRecord(registry, input.merge_into_candidate_id);

  if (source.status === "published" || source.status === "rolled_back" || source.status === "rejected") {
    throw createError("INVALID_SOURCE_STATUS", `Candidate ${source.candidate_id} cannot be merged from status ${source.status}.`);
  }
  if (target.status === "rejected" || target.status === "rolled_back") {
    throw createError("INVALID_TARGET_STATUS", `Candidate ${target.candidate_id} cannot receive a merge from status ${target.status}.`);
  }

  const sourceFile = await readCandidateFile(candidateFilePath(workspaceRoot, source.candidate_id));
  const targetFile = await readCandidateFile(candidateFilePath(workspaceRoot, target.candidate_id));

  if (input.replacement_skill_content) {
    targetFile.proposedSkillContent = input.replacement_skill_content;
  }
  if (input.diff_summary) {
    target.diff_summary = input.diff_summary;
  }
  target.review_suggestions = uniqueStrings([
    ...(target.review_suggestions || []),
    `Merged ${source.candidate_id}: ${input.reason}`,
  ]);

  source.status = "merged";
  source.merged_into = target.candidate_id;
  source.failure_reason = null;

  await writeCandidateFile(candidateFilePath(workspaceRoot, target.candidate_id), target, targetFile.proposedSkillContent);
  await writeCandidateFile(candidateFilePath(workspaceRoot, source.candidate_id), source, sourceFile.proposedSkillContent);
  await saveRegistry(workspaceRoot, registry);

  const auditPath = await writeAuditEvent(workspaceRoot, "candidate_merged", {
    candidate_id: source.candidate_id,
    target_skill: target.target_skill,
    status_before: "pending_review",
    status_after: "merged",
    decision_reason: input.reason,
    matched_rules: source.matched_rules || [],
    dedupe_basis: `merged into ${target.candidate_id}`,
    diff_summary: input.diff_summary || source.diff_summary,
    failure_reason: null,
    publish_effect: null,
    autonomy_mode: source.autonomy_mode || "manual",
  });

  return {
    ok: true,
    operation: "merge_candidate",
    candidate_id: source.candidate_id,
    merge_into_candidate_id: target.candidate_id,
    status_before: "pending_review",
    status_after: "merged",
    audit_path: relativeTo(workspaceRoot, auditPath),
    message: `Merged ${source.candidate_id} into ${target.candidate_id}`,
  };
}

async function getMode(workspaceRoot) {
  const config = await loadConfig(workspaceRoot);
  return {
    ok: true,
    operation: "get_mode",
    autonomy_mode: config.autonomy_mode,
    summary: modeSummary(config.autonomy_mode),
  };
}

async function setMode(workspaceRoot, input) {
  requireFields(input, ["autonomy_mode"]);
  if (!AUTONOMY_MODES.includes(input.autonomy_mode)) {
    throw createError("INVALID_MODE", `Unsupported autonomy_mode: ${input.autonomy_mode}`);
  }

  const config = await loadConfig(workspaceRoot);
  const statusBefore = config.autonomy_mode;
  config.autonomy_mode = input.autonomy_mode;
  await saveConfig(workspaceRoot, config);

  const auditPath = await writeAuditEvent(workspaceRoot, "mode_changed", {
    candidate_id: null,
    target_skill: null,
    status_before: statusBefore,
    status_after: config.autonomy_mode,
    decision_reason: input.reason || "autonomy mode updated",
    matched_rules: [],
    dedupe_basis: null,
    diff_summary: null,
    failure_reason: null,
    publish_effect: null,
    autonomy_mode: config.autonomy_mode,
  });

  return {
    ok: true,
    operation: "set_mode",
    status_before: statusBefore,
    status_after: config.autonomy_mode,
    autonomy_mode: config.autonomy_mode,
    audit_path: relativeTo(workspaceRoot, auditPath),
    summary: modeSummary(config.autonomy_mode),
    message: `Set skill-evolver mode to ${config.autonomy_mode}`,
  };
}

async function reviewCandidate(workspaceRoot, input) {
  requireFields(input, ["candidate_id", "decision"]);

  const registry = await loadRegistry(workspaceRoot);
  const record = getRecord(registry, input.candidate_id);
  const candidatePath = candidateFilePath(workspaceRoot, record.candidate_id);
  const candidateFile = await readCandidateFile(candidatePath);
  const statusBefore = record.status;
  let statusAfter = statusBefore;
  let eventType = "candidate_approved";

  if (input.decision === "approve") {
    record.status = "approved";
    record.approved_at ||= new Date().toISOString();
    statusAfter = record.status;
  } else if (input.decision === "reject") {
    if (!input.failure_reason) {
      throw createError("MISSING_FAILURE_REASON", "failure_reason is required when rejecting a candidate.");
    }
    record.status = "rejected";
    record.failure_reason = input.failure_reason;
    statusAfter = record.status;
    eventType = "candidate_rejected";
  } else if (input.decision === "revise") {
    const suggestions = uniqueStrings([...(record.review_suggestions || []), ...(input.suggestions || [])]);
    if (suggestions.length === 0 && !input.replacement_skill_content) {
      throw createError("MISSING_REVISION_INPUT", "Provide suggestions or replacement_skill_content when revising a candidate.");
    }
    record.status = "pending_review";
    record.review_suggestions = suggestions;
    record.revision_count = (record.revision_count || 0) + 1;
    if (input.diff_summary) {
      record.diff_summary = input.diff_summary;
    }
    if (input.replacement_skill_content) {
      candidateFile.proposedSkillContent = input.replacement_skill_content;
    }
    statusAfter = record.status;
    eventType = "candidate_revised";
  } else {
    throw createError("INVALID_DECISION", `Unsupported review decision: ${input.decision}`);
  }

  await writeCandidateFile(candidatePath, record, candidateFile.proposedSkillContent);
  await saveRegistry(workspaceRoot, registry);

  const auditPath = await writeAuditEvent(workspaceRoot, eventType, {
    candidate_id: record.candidate_id,
    target_skill: record.target_skill,
    status_before: statusBefore,
    status_after: statusAfter,
    decision_reason: input.reason || input.failure_reason || input.decision,
    matched_rules: record.matched_rules || [],
    dedupe_basis: record.dedupe_basis || null,
    diff_summary: record.diff_summary || null,
    failure_reason: record.failure_reason || null,
    publish_effect: null,
    review_suggestions: record.review_suggestions || [],
    autonomy_mode: record.autonomy_mode || "manual",
  });

  return {
    ok: true,
    operation: "review_candidate",
    candidate_id: record.candidate_id,
    status_before: statusBefore,
    status_after: statusAfter,
    audit_path: relativeTo(workspaceRoot, auditPath),
    message:
      input.decision === "revise"
        ? `Revised ${record.candidate_id}; candidate remains in review`
        : `${input.decision}d ${record.candidate_id}`,
  };
}

async function publishCandidate(workspaceRoot, input) {
  requireFields(input, ["candidate_id"]);

  const registry = await loadRegistry(workspaceRoot);
  const record = getRecord(registry, input.candidate_id);
  if (record.status !== "approved") {
    throw createError(
      "CANDIDATE_NOT_APPROVED",
      `Candidate ${record.candidate_id} must be approved before publishing.`,
    );
  }

  const publishResult = await internalPublishCandidate(workspaceRoot, registry, record, {
    publish_as: input.publish_as,
    reason: input.reason || "candidate published",
    channel: "main",
  });

  return {
    ok: true,
    operation: "publish_candidate",
    ...publishResult,
  };
}

async function rollbackSkill(workspaceRoot, input) {
  requireFields(input, ["skill_name"]);

  const skillName = normalizeSkillName(input.skill_name, "patch_skill");
  const skillPath = path.join(workspaceRoot, "skills", skillName, "SKILL.md");
  const currentContent = await readIfExists(skillPath);
  if (!currentContent || !isManagedSkill(currentContent)) {
    throw createError("UNMANAGED_TARGET", `Skill ${skillName} is not managed by ${MANAGED_BY}.`);
  }

  const backupDir = path.join(workspaceRoot, ".skill-evolver", "backups", skillName);
  const backupFiles = await listFiles(backupDir);
  if (backupFiles.length === 0) {
    throw createError("BACKUP_NOT_FOUND", `No backups found for ${skillName}.`);
  }

  const latestBackup = backupFiles.sort().at(-1);
  const backupPath = path.join(backupDir, latestBackup);
  const backupContent = await fs.readFile(backupPath, "utf8");
  await fs.writeFile(skillPath, backupContent, "utf8");

  const registry = await loadRegistry(workspaceRoot);
  const publishedRecord = [...registry.records]
    .reverse()
    .find((record) => record.target_skill === skillName && record.status === "published");
  if (publishedRecord) {
    publishedRecord.status = "rolled_back";
    publishedRecord.rollback_of = relativeTo(workspaceRoot, backupPath);
    publishedRecord.publish_effect = "rolled back to previous managed version";
    await saveRegistry(workspaceRoot, registry);
  }

  const auditPath = await writeAuditEvent(workspaceRoot, "skill_rolled_back", {
    candidate_id: publishedRecord?.candidate_id || null,
    target_skill: skillName,
    status_before: "published",
    status_after: "rolled_back",
    decision_reason: input.reason || "manual rollback",
    matched_rules: publishedRecord?.matched_rules || [],
    dedupe_basis: publishedRecord?.dedupe_basis || null,
    diff_summary: publishedRecord?.diff_summary || null,
    failure_reason: null,
    publish_effect: "rolled back to previous managed version",
    backup_path: relativeTo(workspaceRoot, backupPath),
    autonomy_mode: publishedRecord?.autonomy_mode || "manual",
  });

  return {
    ok: true,
    operation: "rollback_skill",
    skill_name: skillName,
    status_before: "published",
    status_after: "rolled_back",
    backup_path: relativeTo(workspaceRoot, backupPath),
    audit_path: relativeTo(workspaceRoot, auditPath),
    message: `Rolled back ${skillName}`,
  };
}

async function ensureState(workspaceRoot) {
  const root = path.join(workspaceRoot, ".skill-evolver");
  await fs.mkdir(path.join(root, "candidates"), { recursive: true });
  await fs.mkdir(path.join(root, "backups"), { recursive: true });
  await fs.mkdir(path.join(root, "audit"), { recursive: true });
  const registryPath = path.join(root, "registry.json");
  if (!(await exists(registryPath))) {
    await fs.writeFile(
      registryPath,
      JSON.stringify({ version: 1, records: [] }, null, 2),
      "utf8",
    );
  }
  const configPath = path.join(root, "config.json");
  if (!(await exists(configPath))) {
    await fs.writeFile(
      configPath,
      JSON.stringify({ version: 1, autonomy_mode: "manual" }, null, 2),
      "utf8",
    );
  }
}

async function loadRegistry(workspaceRoot) {
  const registryPath = path.join(workspaceRoot, ".skill-evolver", "registry.json");
  const content = await fs.readFile(registryPath, "utf8");
  const data = JSON.parse(content);
  data.records ||= [];
  return data;
}

async function saveRegistry(workspaceRoot, registry) {
  const registryPath = path.join(workspaceRoot, ".skill-evolver", "registry.json");
  const tempPath = `${registryPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
  await fs.rename(tempPath, registryPath);
}

async function loadConfig(workspaceRoot) {
  const configPath = path.join(workspaceRoot, ".skill-evolver", "config.json");
  const content = await fs.readFile(configPath, "utf8");
  const data = JSON.parse(content);
  data.version ||= 1;
  data.autonomy_mode ||= "manual";
  return data;
}

async function saveConfig(workspaceRoot, config) {
  const configPath = path.join(workspaceRoot, ".skill-evolver", "config.json");
  const tempPath = `${configPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), "utf8");
  await fs.rename(tempPath, configPath);
}

async function writeCandidateFile(filePath, record, proposedSkillContent) {
  const content = renderCandidateMarkdown(record, proposedSkillContent);
  await fs.writeFile(filePath, content, "utf8");
}

async function readCandidateFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return parseCandidateMarkdown(content);
}

async function writeAuditEvent(workspaceRoot, eventType, payload) {
  const stamp = compactStamp();
  const safeId = slugify(payload.candidate_id || payload.target_skill || "event");
  const filePath = path.join(
    workspaceRoot,
    ".skill-evolver",
    "audit",
    `${stamp}-${eventType}-${safeId}.json`,
  );
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        ...payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  return filePath;
}

function candidateFilePath(workspaceRoot, candidateId) {
  return path.join(workspaceRoot, ".skill-evolver", "candidates", `${candidateId}.md`);
}

async function backupManagedSkill(workspaceRoot, skillName, version, content) {
  const backupDir = path.join(workspaceRoot, ".skill-evolver", "backups", skillName);
  await fs.mkdir(backupDir, { recursive: true });
  const filePath = path.join(
    backupDir,
    `${compactStamp()}-v${version || 1}-SKILL.md`,
  );
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

async function maybeAutoPromoteCandidate(workspaceRoot, registry, record, config, reason) {
  const decision = decideAutonomy(record, config.autonomy_mode);
  const autoActions = [];

  if (!decision.autoApprove) {
    return {
      status_after: record.status,
      auto_actions: autoActions,
      publish_result: null,
      message: `Created candidate ${record.candidate_id} for ${record.target_skill}`,
    };
  }

  const statusBefore = record.status;
  record.status = "approved";
  record.approved_at ||= new Date().toISOString();
  await saveRegistry(workspaceRoot, registry);
  const candidate = await readCandidateFile(candidateFilePath(workspaceRoot, record.candidate_id));
  await writeCandidateFile(candidateFilePath(workspaceRoot, record.candidate_id), record, candidate.proposedSkillContent);
  autoActions.push("approved");

  await writeAuditEvent(workspaceRoot, "candidate_approved", {
    candidate_id: record.candidate_id,
    target_skill: record.target_skill,
    status_before: statusBefore,
    status_after: "approved",
    decision_reason: reason || decision.reason,
    matched_rules: record.matched_rules || [],
    dedupe_basis: record.dedupe_basis || null,
    diff_summary: record.diff_summary || null,
    failure_reason: null,
    publish_effect: null,
    autonomy_mode: config.autonomy_mode,
  });

  if (!decision.autoPublish) {
    return {
      status_after: record.status,
      auto_actions: autoActions,
      publish_result: null,
      message: `Created candidate ${record.candidate_id} for ${record.target_skill} and auto-approved it in ${config.autonomy_mode} mode`,
    };
  }

  const publishResult = await internalPublishCandidate(workspaceRoot, registry, record, {
    publish_as: decision.publishAs,
    reason: decision.reason,
    channel: decision.channel,
  });
  autoActions.push(decision.channel === "canary" ? "published_canary" : "published");

  return {
    status_after: "published",
    auto_actions: autoActions,
    publish_result: publishResult,
    message:
      decision.channel === "canary"
        ? `Created candidate ${record.candidate_id} and auto-published canary ${publishResult.skill_name}`
        : `Created candidate ${record.candidate_id} and auto-published ${publishResult.skill_name}`,
  };
}

function decideAutonomy(record, mode) {
  if (mode === "manual") {
    return {
      autoApprove: false,
      autoPublish: false,
      channel: null,
      publishAs: null,
      reason: "manual mode keeps candidates in review",
    };
  }

  if (record.risk_level !== "low") {
    return {
      autoApprove: false,
      autoPublish: false,
      channel: null,
      publishAs: null,
      reason: `${mode} mode leaves ${record.risk_level}-risk candidates for human review`,
    };
  }

  if (mode === "assisted") {
    return {
      autoApprove: record.change_type !== "create_skill",
      autoPublish: false,
      channel: null,
      publishAs: null,
      reason: "assisted mode auto-approves low-risk updates but keeps publishing manual",
    };
  }

  if (record.change_type === "patch_skill") {
    return {
      autoApprove: true,
      autoPublish: true,
      channel: "main",
      publishAs: record.target_skill,
      reason: "autonomous mode auto-publishes low-risk patches",
    };
  }

  if (record.change_type === "create_skill") {
    return {
      autoApprove: true,
      autoPublish: true,
      channel: "canary",
      publishAs: `${record.target_skill}-canary`,
      reason: "autonomous mode auto-publishes low-risk new skills as canaries",
    };
  }

  return {
    autoApprove: true,
    autoPublish: false,
    channel: null,
    publishAs: null,
    reason: "autonomous mode auto-approves low-risk non-patch updates",
  };
}

async function internalPublishCandidate(workspaceRoot, registry, record, options = {}) {
  const candidateFile = await readCandidateFile(candidateFilePath(workspaceRoot, record.candidate_id));
  const skillName = normalizeSkillName(options.publish_as || record.target_skill, record.change_type);
  const skillDir = assertInside(workspaceRoot, path.join(workspaceRoot, "skills", skillName));
  const skillPath = path.join(skillDir, "SKILL.md");
  const existingSkillContent = await readIfExists(skillPath);

  if (existingSkillContent && !isManagedSkill(existingSkillContent)) {
    throw createError("UNMANAGED_TARGET", `Cannot publish over unmanaged skill ${skillName}.`);
  }

  const currentVersion = existingSkillContent ? getManagedVersion(existingSkillContent) : 0;
  const nextVersion = currentVersion + 1;
  const backupPath = existingSkillContent
    ? await backupManagedSkill(workspaceRoot, skillName, nextVersion - 1, existingSkillContent)
    : null;

  await fs.mkdir(skillDir, { recursive: true });
  const finalContent = buildManagedSkillContent(candidateFile.proposedSkillContent, {
    skillName,
    managedVersion: nextVersion,
    candidateId: record.candidate_id,
  });
  await fs.writeFile(skillPath, finalContent, "utf8");

  record.status = "published";
  record.target_skill = skillName;
  record.published_version = nextVersion;
  record.publish_effect = `Published ${skillName} v${nextVersion}`;
  record.promotion_channel = options.channel || "main";
  await saveRegistry(workspaceRoot, registry);

  const auditPath = await writeAuditEvent(workspaceRoot, "candidate_published", {
    candidate_id: record.candidate_id,
    target_skill: record.target_skill,
    status_before: "approved",
    status_after: "published",
    decision_reason: options.reason || "candidate published",
    matched_rules: record.matched_rules || [],
    dedupe_basis: record.dedupe_basis || null,
    diff_summary: record.diff_summary || null,
    failure_reason: null,
    publish_effect: record.publish_effect,
    backup_path: backupPath ? relativeTo(workspaceRoot, backupPath) : null,
    promotion_channel: record.promotion_channel,
    autonomy_mode: record.autonomy_mode || "manual",
  });

  await writeCandidateFile(candidateFilePath(workspaceRoot, record.candidate_id), record, candidateFile.proposedSkillContent);

  return {
    candidate_id: record.candidate_id,
    skill_name: skillName,
    status_before: "approved",
    status_after: "published",
    published_version: nextVersion,
    backup_path: backupPath ? relativeTo(workspaceRoot, backupPath) : null,
    audit_path: relativeTo(workspaceRoot, auditPath),
    promotion_channel: record.promotion_channel,
    message: `Published ${skillName} v${nextVersion}`,
  };
}

function buildManagedSkillContent(rawContent, { skillName, managedVersion, candidateId }) {
  const { frontmatter, body } = parseFrontmatterBlock(rawContent);
  const finalFrontmatter = {
    name: frontmatter.name || skillName,
    description:
      frontmatter.description ||
      `Managed skill for ${skillName}, published by ${MANAGED_BY}.`,
    ...frontmatter,
    "managed-by": MANAGED_BY,
    "managed-version": managedVersion,
    "published-from-candidate": candidateId,
  };

  return renderFrontmatterBlock(finalFrontmatter, body.trim());
}

function renderCandidateMarkdown(record, proposedSkillContent) {
  const frontmatter = {
    candidate_id: record.candidate_id,
    status: record.status,
    source_summary: record.source_summary,
    signal_type: record.signal_type,
    signal_count: record.signal_count,
    target_skill: record.target_skill,
    change_type: record.change_type,
    risk_level: record.risk_level,
    dedupe_basis: record.dedupe_basis,
    merged_into: record.merged_into,
    matched_rules: record.matched_rules || [],
    source_tools: record.source_tools || [],
    diff_summary: record.diff_summary,
    failure_reason: record.failure_reason,
    review_suggestions: record.review_suggestions || [],
    revision_count: record.revision_count || 0,
    created_at: record.created_at,
    approved_at: record.approved_at,
    published_version: record.published_version,
    rollback_of: record.rollback_of,
    publish_effect: record.publish_effect,
    autonomy_mode: record.autonomy_mode || "manual",
    promotion_channel: record.promotion_channel,
  };

  const body = [
    `# Candidate ${record.candidate_id}`,
    "",
    "## Why This Was Learned",
    "",
    frontmatter.source_summary || "No summary provided.",
    "",
    "## Review Notes",
    "",
    `- Scope: current workspace only`,
    `- Target skill: ${record.target_skill}`,
    `- Change type: ${record.change_type}`,
    `- Risk level: ${record.risk_level}`,
    `- Dedupe basis: ${record.dedupe_basis}`,
    `- Matched rules: ${(record.matched_rules || []).join(", ")}`,
    `- Source tools: ${(record.source_tools || []).join(", ")}`,
    `- Diff summary: ${record.diff_summary}`,
    `- Review suggestions: ${(record.review_suggestions || []).join(" | ")}`,
    `- Autonomy mode: ${record.autonomy_mode || "manual"}`,
    `- Promotion channel: ${record.promotion_channel || "none"}`,
    "",
    "## Proposed Skill Content",
    "",
    "```md",
    proposedSkillContent.trim(),
    "```",
  ].join("\n");

  return renderFrontmatterBlock(frontmatter, body);
}

function parseCandidateMarkdown(content) {
  const { frontmatter, body } = parseFrontmatterBlock(content);
  const match = body.match(/```md\n([\s\S]*?)\n```/);
  return {
    record: frontmatter,
    proposedSkillContent: match ? match[1] : "",
  };
}

function parseFrontmatterBlock(content) {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }
  const parts = content.split("\n---\n");
  if (parts.length < 2) {
    return { frontmatter: {}, body: content };
  }
  const rawFrontmatter = parts[0].replace(/^---\n/, "");
  const body = parts.slice(1).join("\n---\n");
  const frontmatter = {};

  for (const line of rawFrontmatter.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    frontmatter[key] = parseScalar(rawValue);
  }

  return { frontmatter, body };
}

function renderFrontmatterBlock(frontmatter, body) {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${renderScalar(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

function parseScalar(rawValue) {
  if (rawValue === "null") {
    return null;
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }
  if (
    (rawValue.startsWith("[") && rawValue.endsWith("]")) ||
    (rawValue.startsWith("{") && rawValue.endsWith("}")) ||
    (rawValue.startsWith("\"") && rawValue.endsWith("\""))
  ) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

function renderScalar(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  return JSON.stringify(String(value));
}

function normalizeSkillName(skillName, changeType) {
  const slug = slugify(skillName);
  if (changeType === "create_skill" && !slug.startsWith("learned-")) {
    return `learned-${slug}`;
  }
  return slug;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function compactStamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function generateCandidateId(skillName) {
  return `candidate-${compactStamp()}-${slugify(skillName)}`;
}

function isManagedSkill(content) {
  return content.includes(`managed-by: "${MANAGED_BY}"`) || content.includes(`managed-by: ${MANAGED_BY}`);
}

function getManagedVersion(content) {
  const { frontmatter } = parseFrontmatterBlock(content);
  return Number(frontmatter["managed-version"] || 0);
}

function getRecord(registry, candidateId) {
  const record = registry.records.find((item) => item.candidate_id === candidateId);
  if (!record) {
    throw createError("CANDIDATE_NOT_FOUND", `Candidate ${candidateId} was not found.`);
  }
  return record;
}

function requireFields(input, fields) {
  for (const field of fields) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      throw createError("MISSING_FIELD", `Missing required field: ${field}`);
    }
  }
}

function createError(code, message, blockingRecord) {
  const error = new Error(message);
  error.code = code;
  if (blockingRecord) {
    error.blockingRecord = blockingRecord;
  }
  return error;
}

async function resolveWorkspaceRoot(workspaceRoot) {
  const resolved = path.resolve(workspaceRoot);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw createError("INVALID_WORKSPACE", `${workspaceRoot} is not a directory.`);
  }
  return resolved;
}

function assertInside(workspaceRoot, targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(workspaceRoot) + path.sep;
  if (!resolved.startsWith(root)) {
    throw createError("PATH_OUT_OF_SCOPE", `${resolved} is outside ${workspaceRoot}.`);
  }
  return resolved;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function relativeTo(workspaceRoot, filePath) {
  return `./${path.relative(workspaceRoot, filePath)}`;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function modeSummary(mode) {
  if (mode === "manual") {
    return "Create candidates and require human approval before any publish.";
  }
  if (mode === "assisted") {
    return "Auto-approve low-risk updates, but keep publishing manual.";
  }
  if (mode === "autonomous") {
    return "Auto-publish low-risk patches and publish low-risk new skills as canaries.";
  }
  return "Unknown mode.";
}
