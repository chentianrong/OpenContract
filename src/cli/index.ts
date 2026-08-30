#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { requireWorkspace, resolvePaths } from '../workspace/discovery.js';
import { DefinitionResolver } from '../definitions/resolver.js';
import { testContractFixtures } from '../definitions/fixtures.js';
import {
  renderContractTestHuman,
  renderContractTestJson,
} from '../presentation/contract-test.js';
import {
  renderValidationHuman,
  renderValidationJson,
  exitCodeForResult,
} from '../presentation/validation.js';
import {
  renderActionRunHuman,
  renderActionRunJson,
  exitCodeForActionRun,
} from '../presentation/action-run.js';
import { renderDoctorHuman, renderDoctorJson } from '../presentation/doctor.js';
import { renderUpdateHuman, renderUpdateJson } from '../presentation/update.js';
import {
  renderActionListHuman,
  renderActionListJson,
  renderActionInspectHuman,
  renderActionInspectJson,
  renderContractListHuman,
  renderContractListJson,
  renderContractInspectHuman,
  renderContractInspectJson,
} from '../presentation/definitions.js';
import { validateTarget } from '../validation/pipeline.js';
import { parseActionRunLayout } from '../actions/action-run.js';
import { validateActionRun } from '../actions/validate.js';
import { initWorkspace } from '../workspace/init.js';
import { runDoctor } from '../system/health.js';
import { updateSystem } from '../system/update.js';
import { runInstallCommand } from './commands/install.js';
import { runUninstallCommand } from './commands/uninstall.js';
import { isGlobalSystemInstalled, installGlobalSystem, readGlobalHarnesses } from '../system/install.js';
import { generateAdapters } from '../system/generators.js';
import { promptConfirm, promptHarnessSelection } from './prompts.js';
import { runScopedUpdate, resolveUpdateScope } from '../system/update-scoped.js';
import { discoverWorkspace } from '../workspace/discovery.js';
import { EXIT_CODES, OpenContractError } from '../domain/errors.js';
import { reportAndExit } from './process.js';

const program = new Command();

program
  .name('opencontract')
  .version('1.0.1', '-V, --cli-version', 'display CLI version')
  .description('Markdown-first contract system for agent-driven work');

const action = program
  .command('action')
  .description('Inspect Action definitions and validate tracked ActionRuns');

action
  .command('list')
  .option('--json', 'emit machine-readable JSON')
  .description('List installed Actions with their exact versions')
  .action((options: { json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);
      const actions = resolver.listActions();

      process.stdout.write(
        `${options.json ? renderActionListJson(actions) : renderActionListHuman(actions)}\n`,
      );
      process.exit(EXIT_CODES.VALID);
    } catch (err) {
      reportAndExit(err);
    }
  });

action
  .command('inspect')
  .argument('<name>', 'Action name')
  .requiredOption('--version <version>', 'exact Action version (vX.Y.Z)')
  .option('--json', 'emit machine-readable JSON')
  .description("Show an Action's declared input and output contracts")
  .action((name: string, options: { version: string; json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);
      const definition = resolver.resolveAction(name, options.version);

      process.stdout.write(
        `${options.json ? renderActionInspectJson(definition) : renderActionInspectHuman(definition)}\n`,
      );
      process.exit(EXIT_CODES.VALID);
    } catch (err) {
      reportAndExit(err);
    }
  });

const contract = program.command('contract').description('Inspect and test Contract definitions');

contract
  .command('list')
  .option('--json', 'emit machine-readable JSON')
  .description('List installed Contracts with their exact versions')
  .action((options: { json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);
      const contracts = resolver.listContracts();

      process.stdout.write(
        `${options.json ? renderContractListJson(contracts) : renderContractListHuman(contracts)}\n`,
      );
      process.exit(EXIT_CODES.VALID);
    } catch (err) {
      reportAndExit(err);
    }
  });

contract
  .command('inspect')
  .argument('<name>', 'Contract name')
  .requiredOption('--version <version>', 'exact Contract version (vX.Y.Z)')
  .option('--json', 'emit machine-readable JSON')
  .description("Show a Contract's rules, template, and validator")
  .action((name: string, options: { version: string; json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);
      const definition = resolver.resolveContract(name, options.version);

      process.stdout.write(
        `${options.json ? renderContractInspectJson(definition) : renderContractInspectHuman(definition)}\n`,
      );
      process.exit(EXIT_CODES.VALID);
    } catch (err) {
      reportAndExit(err);
    }
  });

contract
  .command('test')
  .argument('<name>', 'Contract name')
  .requiredOption('--version <version>', 'exact Contract version (vX.Y.Z)')
  .option('--json', 'emit machine-readable JSON instead of human output')
  .description("Run a Contract's fixture and template checks")
  .action((name: string, options: { version: string; json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);

      const definition = resolver.resolveContract(name, options.version);
      const result = testContractFixtures(definition);

      process.stdout.write(
        `${options.json ? renderContractTestJson(result) : renderContractTestHuman(result)}\n`,
      );
      process.exit(result.passed ? EXIT_CODES.VALID : EXIT_CODES.INVALID_CONTENT);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('validate')
  .argument('<path>', 'file or directory to validate')
  .option('--json', 'emit machine-readable JSON')
  .option('--recursive', 'follow transitive inputs and detect cycles')
  .description('Validate one Artifact or a directory of Artifacts')
  .action(async (targetPath: string, options: { json?: boolean; recursive?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);

      const result = await validateTarget(targetPath, {
        resolver,
        workspaceRoot: paths.root,
        managedRoot: paths.artifacts,
        managedRoots: [paths.artifacts, paths.specs],
        trustedValidatorRoots: paths.trustedValidatorRoots,
        validatorRuntime: {
          pythonExecutable: workspace.config.validator?.pythonExecutable ?? 'python3',
          timeoutMs: workspace.config.validator?.timeoutMs ?? 30_000,
          maxOutputBytes: workspace.config.validator?.maxOutputBytes ?? 1_048_576,
        },
        recursive: options.recursive,
      });

      process.stdout.write(
        `${options.json ? renderValidationJson(result) : renderValidationHuman(result)}\n`,
      );
      process.exit(exitCodeForResult(result));
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('validate-action')
  .argument('<directory>', 'ActionRun directory to validate')
  .option('--json', 'emit machine-readable JSON')
  .description("Validate an ActionRun against its Action's declared contracts")
  .action(async (directory: string, options: { json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);

      // The Action identity is read from the outputs themselves, so a layout
      // defect has to be reported before there is anything to resolve.
      const layout = parseActionRunLayout(directory);
      if (layout.errors.length > 0) {
        const first = layout.errors[0];
        throw new OpenContractError(first.code, first.message, {
          path: first.path,
          detail: first.detail,
        });
      }
      if (layout.outputs.length === 0) {
        throw new OpenContractError('ACTION_RUN_EMPTY', undefined, { path: directory });
      }

      const actionName = layout.outputs[0].frontmatter.action;
      const actionVersion = layout.outputs[0].frontmatter.action_version;
      if (typeof actionName !== 'string' || typeof actionVersion !== 'string') {
        throw new OpenContractError(
          'CORE_FIELD_MISSING',
          'The ActionRun outputs do not declare `action` and `action_version`.',
          { path: layout.outputs[0].path },
        );
      }

      const action = resolver.resolveAction(actionName, actionVersion);

      const result = await validateActionRun(directory, action, {
        resolver,
        workspaceRoot: paths.root,
        managedRoot: paths.artifacts,
        managedRoots: [paths.artifacts, paths.specs],
        trustedValidatorRoots: paths.trustedValidatorRoots,
        validatorRuntime: {
          pythonExecutable: workspace.config.validator?.pythonExecutable ?? 'python3',
          timeoutMs: workspace.config.validator?.timeoutMs ?? 30_000,
          maxOutputBytes: workspace.config.validator?.maxOutputBytes ?? 1_048_576,
        },
      });

      process.stdout.write(
        `${options.json ? renderActionRunJson(result) : renderActionRunHuman(result)}\n`,
      );
      process.exit(exitCodeForActionRun(result));
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('install')
  .option('--force', 'overwrite an existing global installation and its adapters')
  .option('--non-interactive', 'skip all prompts; requires --harness')
  .option('--harness <names>', 'comma-separated harnesses (codex,claude,cursor)')
  .description('Install the global system at ~/.opencontract/ and user-level harness adapters')
  .action(async (options: { force?: boolean; nonInteractive?: boolean; harness?: string }) => {
    try {
      const code = await runInstallCommand(options);
      process.exit(code);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('init')
  .option('--harness <names>', 'comma-separated harnesses to generate (codex,claude,cursor)')
  .option('--non-interactive', 'skip all prompts; fail if global system missing')
  .description('Create an OpenContract workspace in the current directory')
  .action(async (options: { harness?: string; nonInteractive?: boolean }) => {
    try {
      // Check for global system first
      if (!isGlobalSystemInstalled()) {
        if (options.nonInteractive) {
          throw new OpenContractError(
            'GLOBAL_SYSTEM_NOT_INSTALLED',
            'Global system not installed. Run "opencontract install" first.',
          );
        } else {
          const confirmed = await promptConfirm(
            'Global system not found. Would you like to install it now?',
            true,
          );
          if (confirmed) {
            const installCode = await runInstallCommand({ nonInteractive: false });
            if (installCode !== EXIT_CODES.VALID) {
              process.stderr.write('Installation failed. Cannot initialize workspace.\n');
              process.exit(installCode);
            }
          } else {
            process.stderr.write(
              'Global system required for workspace initialization. Run "opencontract install".\n',
            );
            process.exit(EXIT_CODES.CONFIGURATION);
          }
        }
      }

      const harnesses = options.harness
        ? options.harness.split(',').map((name) => name.trim()).filter(Boolean)
        : options.nonInteractive
          ? readGlobalHarnesses() ?? ['codex', 'claude', 'cursor']
          : await promptHarnessSelection();

      // Initialize workspace structure and config
      initWorkspace(process.cwd(), { harnesses, checkGlobalSystem: false });

      // Generate project-level adapters
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const systemRoot = paths.system;
      const selectedHarnesses = workspace.config.harnesses ?? [];

      for (const harness of selectedHarnesses) {
        const targetRoot = workspace.root;
        const result = generateAdapters({
          systemRoot,
          targetRoot: join(targetRoot, `.${harness}`),
          harness,
        });

        if (result.collisions.length > 0) {
          process.stderr.write(
            `Warning: adapter collision for ${harness}: ${result.collisions.join(', ')}\n`,
          );
        }
      }

      process.stdout.write(
        `Workspace initialized at ${workspace.root}\nRun "opencontract doctor" to verify health.\n`,
      );
      process.exit(EXIT_CODES.VALID);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('update')
  .option('--json', 'emit machine-readable JSON')
  .option('--global', 'update ~/.opencontract/system and user-level adapters')
  .option('--project', 'regenerate project-level adapters and migrate if needed')
  .option('--force', 'overwrite adapters that were authored by hand')
  .description(
    'Refresh the global system and/or project adapters (defaults to both inside a project, global outside)',
  )
  .action((options: { json?: boolean; global?: boolean; project?: boolean; force?: boolean }) => {
    try {
      const workspace = discoverWorkspace(process.cwd());
      const result = runScopedUpdate({
        global: options.global,
        project: options.project,
        projectRoot: workspace?.root,
        force: options.force,
      });

      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        const lines: string[] = [];
        if (result.globalResult) {
          const g = result.globalResult;
          lines.push(
            `Global: ${g.previousVersion ?? 'none'} -> ${g.newVersion}${g.cachedAs ? ` (cached ${g.cachedAs})` : ''}`,
          );
          for (const [harness, counts] of Object.entries(g.userAdapters)) {
            lines.push(`  ${harness}: ${counts.commands} commands, ${counts.skills} skills`);
          }
        }
        if (result.projectResult) {
          const p = result.projectResult;
          if (p.migration?.needed) {
            lines.push('Migrated project to the global system model:');
            for (const step of p.migration.steps) lines.push(`  ${step}`);
            if (p.migration.backupPath) {
              lines.push(`  Remove the backup once verified: rm -rf ${p.migration.backupPath}`);
            }
          }
          for (const [harness, counts] of Object.entries(p.projectAdapters)) {
            if (counts.commands >= 0) {
              lines.push(`  ${harness}: ${counts.commands} commands, ${counts.skills} skills`);
            }
          }
        }
        for (const message of [
          ...(result.globalResult?.errors ?? []),
          ...(result.projectResult?.errors ?? []),
        ]) {
          lines.push(`Error: ${message}`);
        }
        process.stdout.write(`${lines.join('\n')}\n`);
      }

      process.exit(result.success ? EXIT_CODES.VALID : EXIT_CODES.CONFIGURATION);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('uninstall')
  .option('--keep-cache', 'preserve ~/.opencontract/cache/')
  .option('--non-interactive', 'skip the confirmation prompt')
  .description('Remove the global system, global config, and user-level harness adapters')
  .action(async (options: { keepCache?: boolean; nonInteractive?: boolean }) => {
    try {
      const code = await runUninstallCommand(options);
      process.exit(code);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('doctor')
  .option('--json', 'emit machine-readable JSON')
  .description('Report workspace health: configuration, manifest, definitions, trust, adapters')
  .action((options: { json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const resolver = new DefinitionResolver(paths, workspace.config);

      const result = runDoctor(paths, workspace.config, resolver);

      process.stdout.write(
        `${options.json ? renderDoctorJson(result) : renderDoctorHuman(result)}\n`,
      );
      // An unhealthy workspace is a configuration problem, not a content defect.
      process.exit(result.healthy ? EXIT_CODES.VALID : EXIT_CODES.CONFIGURATION);
    } catch (err) {
      reportAndExit(err);
    }
  });

/**
 * Orchestration is deliberately outside this CLI: choosing, sequencing, and
 * archiving Actions belongs to the agent layer. These commands are registered
 * only so the refusal is explicit rather than an unknown-command message.
 */
for (const name of ['run', 'next', 'execute', 'archive'] as const) {
  program
    .command(name)
    .description('(not provided — OpenContract does not orchestrate Actions)')
    .allowUnknownOption()
    .action(() => {
      reportAndExit(
        new OpenContractError(
          'COMMAND_UNSUPPORTED',
          `\`opencontract ${name}\` is not provided.`,
          {
            detail:
              'OpenContract validates managed evidence; it does not run, schedule, or archive Actions.',
          },
        ),
      );
    });
}

program.parse(process.argv);

