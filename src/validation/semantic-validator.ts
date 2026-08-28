import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { repairHintFor } from '../domain/errors.js';
import type { ContractDefinition, ValidationError, ValidationWarning } from '../domain/types.js';

/**
 * The semantic-validator boundary.
 *
 * This is a trust gate and a protocol boundary, not a sandbox: a validator that
 * passes the trust check runs with the invoking user's permissions. What the
 * boundary does guarantee is that an untrusted validator never runs, and that a
 * trusted one cannot hang the CLI, flood memory, or corrupt the result by
 * writing prose where protocol JSON belongs.
 */

export const VALIDATOR_REQUEST_PROTOCOL = 'opencontract-validator-request';
export const VALIDATOR_RESPONSE_PROTOCOL = 'opencontract-validator';
export const VALIDATOR_PROTOCOL_VERSION = 'v1.0.0';

export interface ValidatorRuntimeConfig {
  readonly pythonExecutable: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface ValidatorRequestContext {
  readonly artifactPath: string;
  readonly contract: ContractDefinition;
  readonly workspaceRoot: string;
  /** Task directory the Artifact belongs to, when it is inside one. */
  readonly taskRoot?: string;
}

export interface ValidatorOutcome {
  /** 'passed' when the validator ran and reported no violations. */
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
  /** Captured stderr, surfaced for diagnostics but never parsed as protocol. */
  readonly stderr?: string;
}

function validationError(
  code: string,
  message: string,
  path: string,
  detail?: string,
): ValidationError {
  return {
    code,
    phase: 'semantic_validator',
    message,
    path,
    detail,
    repairHint: repairHintFor(code),
  };
}

function isUnder(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep)
  );
}

/**
 * Decide whether a validator entrypoint may execute. Trust is positional: the
 * entrypoint must resolve, through symlinks, to a location under a configured
 * trusted root. Registry-provided validators are untrusted unless their
 * directory was explicitly added.
 */
export function checkValidatorTrust(
  entrypoint: string,
  trustedRoots: string[],
): { trusted: true } | { trusted: false; error: ValidationError } {
  if (!existsSync(entrypoint)) {
    return {
      trusted: false,
      error: validationError(
        'VALIDATOR_ENTRYPOINT_MISSING',
        'The declared validator entrypoint does not exist.',
        entrypoint,
      ),
    };
  }

  const real = realpathSync(entrypoint);
  const trusted = trustedRoots.some((root) => existsSync(root) && isUnder(realpathSync(root), real));

  if (!trusted) {
    return {
      trusted: false,
      error: validationError(
        'VALIDATOR_UNTRUSTED',
        'The validator entrypoint is not under a configured trusted root.',
        entrypoint,
        trustedRoots.length === 0
          ? 'no trusted validator roots are configured'
          : `trusted roots: ${trustedRoots.join(', ')}`,
      ),
    };
  }

  return { trusted: true };
}

interface SpawnOutcome {
  readonly kind: 'exited' | 'timeout' | 'oversized' | 'spawn-failed';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnError?: Error;
}

/**
 * Run the validator with one JSON request on stdin. Every bounded failure mode
 * terminates the child: a timeout kills it, and so does exceeding the stdout
 * cap, so a runaway validator cannot fill memory or block the CLI.
 */
function spawnValidator(
  request: string,
  entrypoint: string,
  config: ValidatorRuntimeConfig,
): Promise<SpawnOutcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(config.pythonExecutable, [entrypoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    let oversized = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, config.timeoutMs);

    const settle = (outcome: SpawnOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(outcome);
    };

    const collected = () => ({
      stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
      stderr: Buffer.concat(stderrChunks).toString('utf-8'),
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > config.maxOutputBytes) {
        oversized = true;
        child.kill('SIGKILL');
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      // Stderr is bounded by the same cap so a chatty validator cannot grow
      // unboundedly, but it never affects the protocol decision.
      if (Buffer.concat(stderrChunks).length < config.maxOutputBytes) {
        stderrChunks.push(chunk);
      }
    });

    child.on('error', (spawnError) => {
      settle({ kind: 'spawn-failed', exitCode: null, ...collected(), spawnError });
    });

    child.on('close', (exitCode) => {
      if (oversized) {
        settle({ kind: 'oversized', exitCode, ...collected() });
      } else if (timedOut) {
        settle({ kind: 'timeout', exitCode, ...collected() });
      } else {
        settle({ kind: 'exited', exitCode, ...collected() });
      }
    });

    // A validator that never reads stdin would otherwise leave us writing into
    // a closed pipe; EPIPE here is not a protocol failure.
    child.stdin.on('error', () => {});
    child.stdin.end(request);
  });
}

function buildRequest(context: ValidatorRequestContext): string {
  return JSON.stringify({
    protocol: VALIDATOR_REQUEST_PROTOCOL,
    version: VALIDATOR_PROTOCOL_VERSION,
    artifactPath: context.artifactPath,
    contractPath: context.contract.contractPath,
    contract: context.contract.name,
    contractVersion: context.contract.version,
    workspaceRoot: context.workspaceRoot,
    taskRoot: context.taskRoot ?? null,
  });
}

interface ProtocolResponse {
  readonly valid: boolean;
  readonly errors: Array<{ message: string; code?: string; repairHint?: string; detail?: string }>;
  readonly warnings: Array<{ message: string; code?: string; detail?: string }>;
}

/**
 * Parse the validator's stdout. Exactly one JSON document is expected; anything
 * else — prose, a log line before the JSON, several documents — is stdout
 * contamination, because a partially-parsed response cannot be trusted.
 */
function parseResponse(
  stdout: string,
  artifactPath: string,
): { response: ProtocolResponse } | { error: ValidationError } {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return {
      error: validationError(
        'VALIDATOR_PROTOCOL_INVALID',
        'The validator produced no protocol output on stdout.',
        artifactPath,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      error: validationError(
        'VALIDATOR_STDOUT_CONTAMINATED',
        'The validator wrote non-JSON output on stdout.',
        artifactPath,
        trimmed.slice(0, 200),
      ),
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      error: validationError(
        'VALIDATOR_RESPONSE_INVALID',
        'The validator response must be a JSON object.',
        artifactPath,
      ),
    };
  }

  const body = parsed as Record<string, unknown>;

  if (body.protocol !== VALIDATOR_RESPONSE_PROTOCOL) {
    return {
      error: validationError(
        'VALIDATOR_RESPONSE_INVALID',
        `The validator response must declare protocol "${VALIDATOR_RESPONSE_PROTOCOL}".`,
        artifactPath,
        `got ${JSON.stringify(body.protocol)}`,
      ),
    };
  }
  if (body.version !== VALIDATOR_PROTOCOL_VERSION) {
    return {
      error: validationError(
        'VALIDATOR_RESPONSE_INVALID',
        `Unsupported validator protocol version.`,
        artifactPath,
        `expected ${VALIDATOR_PROTOCOL_VERSION}, got ${JSON.stringify(body.version)}`,
      ),
    };
  }
  if (typeof body.valid !== 'boolean') {
    return {
      error: validationError(
        'VALIDATOR_RESPONSE_INVALID',
        'The validator response must include a boolean `valid` field.',
        artifactPath,
      ),
    };
  }

  const rawErrors = body.errors ?? [];
  const rawWarnings = body.warnings ?? [];
  if (!Array.isArray(rawErrors) || !Array.isArray(rawWarnings)) {
    return {
      error: validationError(
        'VALIDATOR_RESPONSE_INVALID',
        '`errors` and `warnings` must be arrays when present.',
        artifactPath,
      ),
    };
  }

  const normalizeEntry = (entry: unknown): Record<string, unknown> =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : { message: String(entry) };

  return {
    response: {
      valid: body.valid,
      errors: rawErrors.map((entry) => {
        const item = normalizeEntry(entry);
        return {
          message: typeof item.message === 'string' ? item.message : 'Unspecified violation.',
          code: typeof item.code === 'string' ? item.code : undefined,
          repairHint: typeof item.repairHint === 'string' ? item.repairHint : undefined,
          detail: typeof item.detail === 'string' ? item.detail : undefined,
        };
      }),
      warnings: rawWarnings.map((entry) => {
        const item = normalizeEntry(entry);
        return {
          message: typeof item.message === 'string' ? item.message : 'Unspecified warning.',
          code: typeof item.code === 'string' ? item.code : undefined,
          detail: typeof item.detail === 'string' ? item.detail : undefined,
        };
      }),
    },
  };
}

/**
 * Run a Contract's semantic validator, if it declares one.
 *
 * A Contract with no validator, or one whose validator fails the trust check,
 * yields a `skipped` phase rather than a content failure: the Artifact was not
 * found defective, it simply was not examined. Process and protocol faults are
 * configuration-class errors for the same reason — they describe the validator,
 * not the document.
 */
export async function runSemanticValidator(
  context: ValidatorRequestContext,
  trustedRoots: string[],
  config: ValidatorRuntimeConfig,
): Promise<ValidatorOutcome> {
  const declaration = context.contract.validator;
  if (!declaration) {
    return { status: 'skipped', errors: [], warnings: [] };
  }

  const trust = checkValidatorTrust(declaration.entrypoint, trustedRoots);
  if (!trust.trusted) {
    return { status: 'skipped', errors: [trust.error], warnings: [] };
  }

  const outcome = await spawnValidator(
    buildRequest(context),
    declaration.entrypoint,
    config,
  );

  const { artifactPath } = context;

  if (outcome.kind === 'spawn-failed') {
    const missingRuntime =
      (outcome.spawnError as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
    return {
      status: 'skipped',
      errors: [
        validationError(
          missingRuntime ? 'VALIDATOR_RUNTIME_MISSING' : 'VALIDATOR_PROTOCOL_INVALID',
          missingRuntime
            ? `The configured Python runtime "${config.pythonExecutable}" is not available.`
            : 'The validator process could not be started.',
          artifactPath,
          outcome.spawnError?.message,
        ),
      ],
      warnings: [],
      stderr: outcome.stderr,
    };
  }

  if (outcome.kind === 'timeout') {
    return {
      status: 'skipped',
      errors: [
        validationError(
          'VALIDATOR_TIMEOUT',
          `The validator exceeded the ${config.timeoutMs} ms timeout and was terminated.`,
          artifactPath,
          context.contract.name,
        ),
      ],
      warnings: [],
      stderr: outcome.stderr,
    };
  }

  if (outcome.kind === 'oversized') {
    return {
      status: 'skipped',
      errors: [
        validationError(
          'VALIDATOR_OUTPUT_TOO_LARGE',
          `The validator exceeded the ${config.maxOutputBytes} byte stdout limit and was terminated.`,
          artifactPath,
          context.contract.name,
        ),
      ],
      warnings: [],
      stderr: outcome.stderr,
    };
  }

  const parsed = parseResponse(outcome.stdout, artifactPath);
  if ('error' in parsed) {
    // A non-zero exit with unusable stdout is reported as the exit failure,
    // since that is the more actionable fact for the validator author.
    if (outcome.exitCode !== 0) {
      return {
        status: 'skipped',
        errors: [
          validationError(
            'VALIDATOR_EXIT_NONZERO',
            `The validator exited with status ${outcome.exitCode}.`,
            artifactPath,
            outcome.stderr.trim().slice(0, 500) || undefined,
          ),
        ],
        warnings: [],
        stderr: outcome.stderr,
      };
    }
    return { status: 'skipped', errors: [parsed.error], warnings: [], stderr: outcome.stderr };
  }

  const { response } = parsed;

  // A well-formed response is authoritative even when the exit status is
  // non-zero: validators commonly exit 1 to mean "found violations".
  const errors: ValidationError[] = response.errors.map((entry) =>
    entry.code && entry.code !== 'SEMANTIC_VIOLATION'
      ? {
          code: 'SEMANTIC_VIOLATION',
          phase: 'semantic_validator' as const,
          message: entry.message,
          path: artifactPath,
          detail: entry.detail ? `${entry.code}: ${entry.detail}` : entry.code,
          repairHint: entry.repairHint ?? repairHintFor('SEMANTIC_VIOLATION'),
        }
      : {
          code: 'SEMANTIC_VIOLATION',
          phase: 'semantic_validator' as const,
          message: entry.message,
          path: artifactPath,
          detail: entry.detail,
          repairHint: entry.repairHint ?? repairHintFor('SEMANTIC_VIOLATION'),
        },
  );

  const warnings: ValidationWarning[] = response.warnings.map((entry) => ({
    code: entry.code ?? 'SEMANTIC_WARNING',
    phase: 'semantic_validator' as const,
    message: entry.message,
    path: artifactPath,
    detail: entry.detail,
  }));

  if (!response.valid && errors.length === 0) {
    errors.push(
      validationError(
        'SEMANTIC_VIOLATION',
        'The validator reported the Artifact invalid without describing a violation.',
        artifactPath,
        context.contract.name,
      ),
    );
  }

  return {
    status: response.valid && errors.length === 0 ? 'passed' : 'failed',
    errors,
    warnings,
    stderr: outcome.stderr,
  };
}
