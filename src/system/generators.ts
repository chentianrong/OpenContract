import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GENERATED_MARKER } from './harnesses.js';

/**
 * Options for adapter generation.
 */
export interface AdapterGenerateOptions {
  /** Absolute path to the system tree containing actions/. */
  readonly systemRoot: string;
  /** Absolute path where adapters will be written (e.g., ~/.claude or <project>/.claude). */
  readonly targetRoot: string;
  /** Harness name (e.g., 'claude', 'cursor', 'codex'). */
  readonly harness: string;
  /** Overwrite existing files even if they lack the generated marker. */
  readonly force?: boolean;
}

/**
 * Result of adapter generation for one harness-location pair.
 */
export interface GenerateResult {
  /** Paths of generated command files. */
  readonly commands: readonly string[];
  /** Paths of generated skill files. */
  readonly skills: readonly string[];
  /** Action names skipped (e.g., 'opencontract' legacy). */
  readonly skipped: readonly string[];
  /** Paths that collided (exist without generated marker); empty if force=true. */
  readonly collisions: readonly string[];
}

/**
 * Generate per-Action adapters for one harness at one location.
 * Implements all-or-nothing collision detection: if any target path exists
 * without the generated marker, writes zero files and returns collisions.
 */
export function generateAdapters(options: AdapterGenerateOptions): GenerateResult {
  const { systemRoot, targetRoot, harness, force = false } = options;

  const actionsDir = join(systemRoot, 'actions');
  if (!existsSync(actionsDir) || !statSync(actionsDir).isDirectory()) {
    throw new Error(`System actions directory not found: ${actionsDir}`);
  }

  // Enumerate actions
  const actionNames = readdirSync(actionsDir).filter((name) => {
    const actionDir = join(actionsDir, name);
    return statSync(actionDir).isDirectory() && existsSync(join(actionDir, 'SKILL.md'));
  });

  // Skip legacy 'opencontract' single-entry Action
  const skipped: string[] = [];
  const actionsToGenerate = actionNames.filter((name) => {
    if (name === 'opencontract') {
      skipped.push(name);
      return false;
    }
    return true;
  });

  // Build target path list
  const targetPaths: string[] = [];
  for (const action of actionsToGenerate) {
    targetPaths.push(join(targetRoot, 'commands', 'oc', `${action}.md`));
    targetPaths.push(join(targetRoot, 'skills', `oc-${action}`, 'SKILL.md'));
  }

  // Collision detection (all-or-nothing)
  if (!force) {
    const collisions: string[] = [];
    for (const path of targetPaths) {
      if (existsSync(path) && !isGenerated(path)) {
        collisions.push(path);
      }
    }
    if (collisions.length > 0) {
      return { commands: [], skills: [], skipped, collisions };
    }
  }

  // Generate adapters
  const commands: string[] = [];
  const skills: string[] = [];

  for (const action of actionsToGenerate) {
    const actionDir = join(actionsDir, action);
    const skillPath = join(actionDir, 'SKILL.md');
    const body = actionBody(skillPath);

    // Generate command
    const commandPath = join(targetRoot, 'commands', 'oc', `${action}.md`);
    const commandContent = renderCommand(action, body, harness);
    mkdirSync(dirname(commandPath), { recursive: true });
    writeFileSync(commandPath, commandContent, 'utf-8');
    commands.push(commandPath);

    // Generate skill
    const skillTargetPath = join(targetRoot, 'skills', `oc-${action}`, 'SKILL.md');
    const skillContent = renderSkill(action, body, harness);
    mkdirSync(dirname(skillTargetPath), { recursive: true });
    writeFileSync(skillTargetPath, skillContent, 'utf-8');
    skills.push(skillTargetPath);
  }

  return { commands, skills, skipped, collisions: [] };
}

/**
 * Extract Action body from SKILL.md: drops the leading heading, returns prose + contracts.
 */
function actionBody(skillPath: string): string {
  const content = readFileSync(skillPath, 'utf-8');
  const lines = content.split('\n');

  // Drop the first heading line (e.g., "# Explore")
  const bodyStart = lines.findIndex((line, idx) => idx > 0 && line.trim() !== '');
  if (bodyStart === -1) return content;

  // Find the first non-empty line that isn't the heading
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#')) {
      start = i + 1;
      break;
    }
  }

  return lines.slice(start).join('\n').trim();
}

/**
 * Render a slash command adapter with inlined Action guidance.
 */
function renderCommand(action: string, body: string, harness: string): string {
  return `${GENERATED_MARKER}
---
name: oc:${action}
description: OpenContract ${action} Action
allowed-tools: []
category: opencontract
tags: [opencontract, ${action}]
---

${body}

## Available commands

- \`opencontract action list\` — list installed Actions
- \`opencontract contract list\` — list installed Contracts
- \`opencontract validate <path>\` — validate an Artifact
- \`opencontract doctor\` — workspace health check
`;
}

/**
 * Render a skill adapter with inlined Action guidance.
 */
function renderSkill(action: string, body: string, harness: string): string {
  return `${GENERATED_MARKER}
---
name: oc-${action}
description: OpenContract ${action} Action
allowed-tools: []
metadata:
  version: v1.1.0
  harness: ${harness}
  action: ${action}
---

${body}

## Available commands

- \`opencontract action list\` — list installed Actions
- \`opencontract contract list\` — list installed Contracts
- \`opencontract validate <path>\` — validate an Artifact
- \`opencontract doctor\` — workspace health check
`;
}

/**
 * True when the file at path was generated by OpenContract.
 */
function isGenerated(path: string): boolean {
  if (!existsSync(path)) return false;
  const head = readFileSync(path, 'utf-8').slice(0, GENERATED_MARKER.length + 2);
  return head.startsWith(GENERATED_MARKER);
}
