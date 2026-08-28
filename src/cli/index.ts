#!/usr/bin/env node
import { Command } from 'commander';
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
import { EXIT_CODES, OpenContractError } from '../domain/errors.js';
import { reportAndExit } from './process.js';

const program = new Command();

program
  .name('opencontract')
  .version('1.0.0', '-V, --cli-version', 'display CLI version')
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
  .command('init')
  .option('--harness <names>', 'comma-separated harnesses to generate (codex,claude,cursor)')
  .description('Create an OpenContract workspace in the current directory')
  .action((options: { harness?: string }) => {
    try {
      const harnesses = options.harness
        ? options.harness.split(',').map((name) => name.trim()).filter(Boolean)
        : undefined;

      initWorkspace(process.cwd(), harnesses ? { harnesses } : {});

      // Install the bundled system tree and generate the selected adapters.
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const outcome = updateSystem(paths, workspace.config);

      process.stdout.write(`${renderUpdateHuman(outcome)}\n`);
      process.exit(outcome.success ? EXIT_CODES.VALID : EXIT_CODES.CONFIGURATION);
    } catch (err) {
      reportAndExit(err);
    }
  });

program
  .command('update')
  .option('--json', 'emit machine-readable JSON')
  .description('Install or refresh the system tree and generated harness adapters')
  .action((options: { json?: boolean }) => {
    try {
      const workspace = requireWorkspace(process.cwd());
      const paths = resolvePaths(workspace);
      const outcome = updateSystem(paths, workspace.config);

      process.stdout.write(
        `${options.json ? renderUpdateJson(outcome) : renderUpdateHuman(outcome)}\n`,
      );
      process.exit(outcome.success ? EXIT_CODES.VALID : EXIT_CODES.CONFIGURATION);
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

