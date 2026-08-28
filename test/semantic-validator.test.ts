import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkValidatorTrust,
  runSemanticValidator,
  VALIDATOR_REQUEST_PROTOCOL,
  VALIDATOR_PROTOCOL_VERSION,
} from '../src/validation/semantic-validator.js';
import type { ContractDefinition } from '../src/domain/types.js';

/**
 * The validator boundary is where untrusted-looking code meets the CLI. Each
 * bounded failure mode gets its own case, because the guarantee being tested is
 * that none of them hangs the process or is mistaken for a document defect.
 */

const RUNTIME = { pythonExecutable: 'python3', timeoutMs: 5_000, maxOutputBytes: 64 * 1024 };

describe('Validator trust gate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-trust-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts an entrypoint under a trusted root', () => {
    const trusted = join(tempDir, 'system');
    mkdirSync(trusted, { recursive: true });
    const entrypoint = join(trusted, 'validator.py');
    writeFileSync(entrypoint, '', 'utf-8');

    expect(checkValidatorTrust(entrypoint, [trusted])).toEqual({ trusted: true });
  });

  it('rejects an entrypoint outside every trusted root', () => {
    const trusted = join(tempDir, 'system');
    const elsewhere = join(tempDir, 'elsewhere');
    mkdirSync(trusted, { recursive: true });
    mkdirSync(elsewhere, { recursive: true });
    const entrypoint = join(elsewhere, 'validator.py');
    writeFileSync(entrypoint, '', 'utf-8');

    const result = checkValidatorTrust(entrypoint, [trusted]);
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.error.code).toBe('VALIDATOR_UNTRUSTED');
    }
  });

  it('rejects everything when no trusted roots are configured', () => {
    const entrypoint = join(tempDir, 'validator.py');
    writeFileSync(entrypoint, '', 'utf-8');

    const result = checkValidatorTrust(entrypoint, []);
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.error.code).toBe('VALIDATOR_UNTRUSTED');
      expect(result.error.detail).toContain('no trusted validator roots');
    }
  });

  it('rejects a symlink that escapes the trusted root', () => {
    const trusted = join(tempDir, 'system');
    const outside = join(tempDir, 'outside');
    mkdirSync(trusted, { recursive: true });
    mkdirSync(outside, { recursive: true });

    const realTarget = join(outside, 'evil.py');
    writeFileSync(realTarget, '', 'utf-8');
    const link = join(trusted, 'validator.py');
    try {
      symlinkSync(realTarget, link, 'file');
    } catch {
      return; // platform without symlink permission
    }

    const result = checkValidatorTrust(link, [trusted]);
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.error.code).toBe('VALIDATOR_UNTRUSTED');
    }
  });

  it('reports a missing entrypoint distinctly from an untrusted one', () => {
    const result = checkValidatorTrust(join(tempDir, 'absent.py'), [tempDir]);
    expect(result.trusted).toBe(false);
    if (!result.trusted) {
      expect(result.error.code).toBe('VALIDATOR_ENTRYPOINT_MISSING');
    }
  });
});

describe('Validator subprocess protocol', () => {
  let tempDir: string;
  let artifactPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencontract-validator-'));
    artifactPath = join(tempDir, 'artifact.md');
    writeFileSync(
      artifactPath,
      `---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

## Findings

Body text.
`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** Writes a Python validator into the trusted root and returns a Contract using it. */
  function contractWithValidator(source: string): ContractDefinition {
    const entrypoint = join(tempDir, 'validator.py');
    writeFileSync(entrypoint, source, 'utf-8');
    chmodSync(entrypoint, 0o755);
    return {
      name: 'note',
      version: 'v1.0.0',
      artifactType: 'note',
      artifactCoreVersion: 'v1.0.0',
      description: 'test',
      source: 'system',
      packagePath: tempDir,
      contractPath: join(tempDir, 'contract.md'),
      templatePath: join(tempDir, 'template.md'),
      variants: [],
      validator: { runtime: 'python', entrypoint },
      rules: {},
    };
  }

  function run(contract: ContractDefinition, runtime = RUNTIME) {
    return runSemanticValidator(
      { artifactPath, contract, workspaceRoot: tempDir },
      [tempDir],
      runtime,
    );
  }

  const RESPOND = (body: string) => `import json, sys
request = json.load(sys.stdin)
print(json.dumps(${body}))
`;

  it('skips when the Contract declares no validator', async () => {
    const contract = contractWithValidator('');
    const withoutValidator = { ...contract, validator: undefined };

    const outcome = await run(withoutValidator);
    expect(outcome.status).toBe('skipped');
    expect(outcome.errors).toEqual([]);
  });

  it('passes a valid protocol response through', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND(
          '{"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}',
        ),
      ),
    );

    expect(outcome.status).toBe('passed');
    expect(outcome.errors).toEqual([]);
  });

  it('delivers the versioned request on stdin', async () => {
    // The validator echoes back what it received, so a shape mismatch surfaces
    // as a protocol error rather than passing silently.
    const outcome = await run(
      contractWithValidator(`import json, sys
request = json.load(sys.stdin)
expected = {
    "protocol": ${JSON.stringify(VALIDATOR_REQUEST_PROTOCOL)},
    "version": ${JSON.stringify(VALIDATOR_PROTOCOL_VERSION)},
}
errors = []
for key, value in expected.items():
    if request.get(key) != value:
        errors.append({"message": f"{key} was {request.get(key)!r}"})
for key in ("artifactPath", "contractPath", "contract", "contractVersion", "workspaceRoot"):
    if not request.get(key):
        errors.append({"message": f"{key} missing"})
if "taskRoot" not in request:
    errors.append({"message": "taskRoot key absent"})
print(json.dumps({
    "protocol": "opencontract-validator",
    "version": "v1.0.0",
    "valid": not errors,
    "errors": errors,
}))
`),
    );

    expect(outcome.errors.map((e) => e.message)).toEqual([]);
    expect(outcome.status).toBe('passed');
  });

  it('maps reported violations to SEMANTIC_VIOLATION with the validator hint', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND(`{
    "protocol": "opencontract-validator",
    "version": "v1.0.0",
    "valid": False,
    "errors": [{"message": "Scenario is not verifiable", "code": "NO_SCENARIO", "repairHint": "Add a WHEN/THEN pair"}],
}`),
      ),
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0].code).toBe('SEMANTIC_VIOLATION');
    expect(outcome.errors[0].phase).toBe('semantic_validator');
    expect(outcome.errors[0].message).toBe('Scenario is not verifiable');
    expect(outcome.errors[0].detail).toContain('NO_SCENARIO');
    expect(outcome.errors[0].repairHint).toBe('Add a WHEN/THEN pair');
  });

  it('carries warnings without failing the phase', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND(`{
    "protocol": "opencontract-validator",
    "version": "v1.0.0",
    "valid": True,
    "errors": [],
    "warnings": [{"message": "Prefer a shorter title"}],
}`),
      ),
    );

    expect(outcome.status).toBe('passed');
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0].message).toBe('Prefer a shorter title');
  });

  it('treats a valid:false response with no errors as a violation', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND(
          '{"protocol": "opencontract-validator", "version": "v1.0.0", "valid": False, "errors": []}',
        ),
      ),
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0].code).toBe('SEMANTIC_VIOLATION');
  });

  it('accepts a well-formed response even when the validator exits non-zero', async () => {
    const outcome = await run(
      contractWithValidator(`import json, sys
print(json.dumps({
    "protocol": "opencontract-validator",
    "version": "v1.0.0",
    "valid": False,
    "errors": [{"message": "found a violation"}],
}))
sys.exit(1)
`),
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.errors[0].message).toBe('found a violation');
  });

  it('reports a non-zero exit with unusable stdout as VALIDATOR_EXIT_NONZERO', async () => {
    const outcome = await run(
      contractWithValidator(`import sys
sys.stderr.write("traceback: something broke\\n")
sys.exit(3)
`),
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_EXIT_NONZERO');
    expect(outcome.errors[0].detail).toContain('something broke');
  });

  it('reports non-JSON stdout as contamination', async () => {
    const outcome = await run(
      contractWithValidator('print("checking the artifact...")\n'),
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_STDOUT_CONTAMINATED');
  });

  it('reports a log line printed before the JSON as contamination', async () => {
    const outcome = await run(
      contractWithValidator(`import json
print("loading rules")
print(json.dumps({"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}))
`),
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_STDOUT_CONTAMINATED');
  });

  it('keeps stderr out of the protocol decision', async () => {
    const outcome = await run(
      contractWithValidator(`import json, sys
sys.stderr.write("verbose diagnostics\\n")
print(json.dumps({"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}))
`),
    );

    expect(outcome.status).toBe('passed');
    expect(outcome.stderr).toContain('verbose diagnostics');
  });

  it('rejects an empty stdout', async () => {
    const outcome = await run(contractWithValidator('pass\n'));
    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_PROTOCOL_INVALID');
  });

  it('rejects a wrong protocol name or version', async () => {
    const wrongProtocol = await run(
      contractWithValidator(
        RESPOND('{"protocol": "something-else", "version": "v1.0.0", "valid": True, "errors": []}'),
      ),
    );
    expect(wrongProtocol.errors[0].code).toBe('VALIDATOR_RESPONSE_INVALID');

    const wrongVersion = await run(
      contractWithValidator(
        RESPOND(
          '{"protocol": "opencontract-validator", "version": "v2.0.0", "valid": True, "errors": []}',
        ),
      ),
    );
    expect(wrongVersion.errors[0].code).toBe('VALIDATOR_RESPONSE_INVALID');
  });

  it('rejects a response missing the valid field', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND('{"protocol": "opencontract-validator", "version": "v1.0.0", "errors": []}'),
      ),
    );
    expect(outcome.errors[0].code).toBe('VALIDATOR_RESPONSE_INVALID');
  });

  it('terminates a validator that exceeds the timeout', async () => {
    const outcome = await run(
      contractWithValidator('import time\ntime.sleep(30)\n'),
      { ...RUNTIME, timeoutMs: 400 },
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_TIMEOUT');
  }, 10_000);

  it('terminates a validator that floods stdout', async () => {
    const outcome = await run(
      contractWithValidator(`import sys
while True:
    sys.stdout.write("x" * 4096)
    sys.stdout.flush()
`),
      { ...RUNTIME, maxOutputBytes: 8 * 1024 },
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_OUTPUT_TOO_LARGE');
  }, 10_000);

  it('reports a missing Python runtime', async () => {
    const outcome = await run(
      contractWithValidator(
        RESPOND(
          '{"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}',
        ),
      ),
      { ...RUNTIME, pythonExecutable: 'python-that-does-not-exist' },
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_RUNTIME_MISSING');
  });

  it('does not run an untrusted validator', async () => {
    const contract = contractWithValidator(
      RESPOND(
        '{"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}',
      ),
    );

    const outcome = await runSemanticValidator(
      { artifactPath, contract, workspaceRoot: tempDir },
      [], // no trusted roots
      RUNTIME,
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.errors[0].code).toBe('VALIDATOR_UNTRUSTED');
  });

  it('survives a validator that never reads stdin', async () => {
    const outcome = await run(
      contractWithValidator(`import json
print(json.dumps({"protocol": "opencontract-validator", "version": "v1.0.0", "valid": True, "errors": []}))
`),
    );

    expect(outcome.status).toBe('passed');
  });
});
