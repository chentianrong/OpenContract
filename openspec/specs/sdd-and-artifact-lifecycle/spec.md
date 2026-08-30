## Purpose

Defines the durable Markdown evidence model used by agent-driven work: task and ActionRun boundaries, SDD specification/design modes, human decisions, and safe archival of validated historical artifacts.

## Requirements

### Requirement: Persist managed work in a three-level hierarchy

When an agent chooses to persist a managed Artifact, it SHALL create a task directory, an ActionRun directory beneath it, and Markdown Artifact files beneath the ActionRun using `YYYYMMDDTHHmmss` plus a short kebab-case description. Managed Artifacts SHALL NOT be placed directly at the artifacts root; temporary conversational exploration MAY remain unpersisted.

#### Scenario: Persisted task has complete hierarchy
- **WHEN** an agent persists any managed Artifact for a tracked task
- **THEN** the Artifact is located at `opencontract/artifacts/{task}/{action-run}/{artifact}.md` with both timestamped directory levels

#### Scenario: Untracked conversation remains lightweight
- **WHEN** a task only needs an answer or temporary exploration and no managed Artifact is produced
- **THEN** no task or ActionRun directory is required

### Requirement: Represent SDD specifications and designs in explicit modes

The `specification` Contract SHALL support `mode: delta` with a capability and `ADDED`, `MODIFIED`, or `REMOVED` requirement sections using normative language and WHEN/THEN scenarios, and `mode: canonical` describing current effective project facts without delta markers. The `design` Contract SHALL support `mode: change` for a task's technical choices and `mode: canonical` for durable architecture facts. Formal canonical documents SHALL live under `opencontract/specs/` or a clearly scoped architecture path.

#### Scenario: Delta specification is machine-checkable
- **WHEN** a specification Artifact declares delta mode
- **THEN** it identifies a capability and each requirement includes normative behavior plus at least one verifiable scenario

#### Scenario: Canonical specification omits historical delta markers
- **WHEN** a formal specification is stored in canonical mode
- **THEN** it describes the current effective behavior and does not retain `ADDED`, `MODIFIED`, or `REMOVED` as historical section markers

### Requirement: Record decisions and enforce authorization state

The `decision` Contract SHALL support an initial `pending` state and a human- or agent-attributed `decided` state. A pending decision MAY be structurally valid, but any subsequent operation requiring authorization, including scope, high-risk, or material value trade-offs, SHALL require a `decided` Decision with decider and decision timestamp; archived decisions SHALL be immutable.

#### Scenario: Pending decision blocks authorized work
- **WHEN** a required authorization Decision has `status: pending`
- **THEN** the agent reports the missing human decision and does not proceed with the gated operation

#### Scenario: Decided decision authorizes continuation
- **WHEN** a Decision records `status: decided`, a valid decider, decision time, and selected option
- **THEN** the gated Action may use it as an input and must preserve the decision reference

### Requirement: Archive validated history with repaired references

The `archive` Action SHALL inspect all task Artifacts and existing canonical Specs, determine which content represents new project facts, apply necessary create/merge/rewrite/split/remove changes, validate the resulting canonical Specs and references, generate one `archive-report` recording sources, updates, transformations, conflicts, checks, and destination, then move the task directory under `opencontract/artifacts/archive/`. Because inputs are relative, archival moves SHALL search and rewrite affected managed `inputs` and Markdown links before recursive validation; if references cannot be safely repaired, archival SHALL stop and request a decision.

#### Scenario: Successful archive produces immutable history
- **WHEN** all selected canonical Spec changes, repaired references, and the archive report validate
- **THEN** the complete task directory is moved to `opencontract/artifacts/archive/`, its history is treated as immutable, and the report identifies the final destination

#### Scenario: Archive conflict waits for human choice
- **WHEN** merging an Artifact into canonical Specs would create a material semantic conflict, scope change, or destructive deletion
- **THEN** the agent presents evidence, options, recommendation, and waits for a decided human Decision before changing canonical content or moving the task

#### Scenario: Unsafe reference repair prevents archive
- **WHEN** an input or Markdown link cannot be rewritten safely after the planned move
- **THEN** the archive operation halts, leaves the task in place, and reports the unresolved references and repair decision needed

### Requirement: Preserve dynamic agent-selected behavior without central state

The system SHALL derive current work state from the user goal, conversation, project files, managed Artifacts, tracked ActionRun directories, human decisions, and current constraints. It SHALL permit agents to branch, repeat, parallelize, merge, or end Actions without requiring a predefined DAG or central status file.

#### Scenario: Agent chooses a non-linear path
- **WHEN** an agent decides to revisit an Action, branch into independent ActionRuns, or skip a commonly suggested step
- **THEN** the managed evidence remains valid as long as each persisted Artifact and ActionRun satisfies its Contract, with no scheduler rejection

#### Scenario: State is reconstructed from evidence
- **WHEN** a new agent or session enters an existing task directory
- **THEN** it can inspect the current goal, conversation context, decisions, and managed inputs/outputs without consulting a central database maintained by OpenContract
