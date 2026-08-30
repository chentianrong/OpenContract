#!/bin/bash
set -euo pipefail

# Manual integration tests for v1.1 global system.
# Runs with an isolated HOME so no real config is touched.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO_ROOT/dist/cli/index.js"

cleanup() {
  [ -n "${TEST_HOME:-}" ] && rm -rf "$TEST_HOME"
}
trap cleanup EXIT

TEST_HOME=$(mktemp -d)
export HOME="$TEST_HOME"
echo "=== Isolated HOME: $TEST_HOME"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

# 9.1: Interactive install (simulated with --non-interactive)
echo
echo "=== 9.1: Install global system with harness selection ==="
node "$CLI" install --non-interactive --harness claude,cursor
[ -f "$HOME/.opencontract/system/manifest.yaml" ] || fail "manifest missing"
[ -d "$HOME/.claude/commands/oc" ] || fail "claude commands missing"
[ -d "$HOME/.cursor/commands/oc" ] || fail "cursor commands missing"
[ -f "$HOME/.claude/skills/oc-explore/SKILL.md" ] || fail "claude skill missing"
pass "Global system installed with user-level adapters"

# 9.2: Init in new directory prompts for global install (already installed, so just init)
echo
echo "=== 9.2: Init new project ==="
PROJECT="$TEST_HOME/myproject"
mkdir -p "$PROJECT"
cd "$PROJECT"
node "$CLI" init --non-interactive --harness claude
[ -f ".opencontract/config.yaml" ] || fail "project config missing"
grep -q "system: ~/.opencontract/system" .opencontract/config.yaml || fail "config not global"
[ ! -d ".opencontract/system" ] || fail "local system should not exist"
[ -d "opencontract/specs" ] || fail "specs dir missing"
pass "Project initialized with global references"

# 9.3: v1.0 project auto-migrates on update
echo
echo "=== 9.3: v1.0 migration on update ==="
V1_PROJECT="$TEST_HOME/v1project"
mkdir -p "$V1_PROJECT"
cd "$V1_PROJECT"

# Manually construct a v1.0 project structure
mkdir -p .opencontract/{system,cache,actions,contracts}
mkdir -p opencontract/{specs,artifacts}
cp -r "$REPO_ROOT/resources/system/." .opencontract/system/
cat > .opencontract/config.yaml <<EOF
system: .opencontract/system
cache: .opencontract/cache
projectActions: .opencontract/actions
projectContracts: .opencontract/contracts
specs: opencontract/specs
artifacts: opencontract/artifacts
archive: opencontract/artifacts/archive
trust:
  validatorRoots:
    - .opencontract/system
harnesses: ["claude"]
EOF

mkdir -p .claude/skills/opencontract
cat > .claude/skills/opencontract/SKILL.md <<'EOF'
<!-- opencontract:generated -->
---
name: opencontract
---
Legacy adapter
EOF

node "$CLI" update --project 2>&1 | tee /tmp/update-output.txt
grep -q "Migrated project to the global system model" /tmp/update-output.txt || fail "migration message missing"
[ ! -d ".opencontract/system" ] || fail "local system should be gone"
[ -d ".opencontract/system.backup-"* ] || fail "backup missing"
grep -q "system: ~/.opencontract/system" .opencontract/config.yaml || fail "config not migrated"
[ ! -d ".claude/skills/opencontract" ] || fail "legacy adapter should be removed"
[ -d ".claude/commands/oc" ] || fail "new adapters missing"
pass "v1.0 project auto-migrated"

# 9.4: Adapter command completion (we can't test interactive completion, but check files exist)
echo
echo "=== 9.4: Per-Action adapters generated ==="
cd "$PROJECT"
[ -f ".claude/commands/oc/explore.md" ] || fail "explore command missing"
[ -f ".claude/commands/oc/build.md" ] || fail "build command missing"
[ -f ".claude/skills/oc-explore/SKILL.md" ] || fail "explore skill missing"
pass "Per-Action adapters present"

# 9.5: Validate after migration
echo
echo "=== 9.5: Validate finds global Contracts ==="
cd "$V1_PROJECT"
mkdir -p opencontract/artifacts/test
cat > opencontract/artifacts/test/note.md <<'EOF'
---
contract: note
version: v1.0.0
action: explore
action_version: v1.0.0
created_at: "2026-08-29T16:00:00Z"
inputs: []
---

## Observation

Validation resolves this Contract from the global system after migration.
EOF

node "$CLI" validate opencontract/artifacts/test/note.md --json > /tmp/validate.json
grep -q '"valid": true' /tmp/validate.json || fail "validation failed"
pass "Validate resolved Contract from global system"

# 9.6: Uninstall removes global system and adapters
echo
echo "=== 9.6: Uninstall global system ==="
node "$CLI" uninstall --non-interactive
[ ! -d "$HOME/.opencontract/system" ] || fail "system not removed"
[ ! -f "$HOME/.opencontract/config.yaml" ] || fail "config not removed"
[ ! -d "$HOME/.claude/commands/oc" ] || fail "claude commands not removed"
[ ! -d "$HOME/.claude/skills/oc-explore" ] || fail "claude skills not removed"
[ ! -d "$HOME/.opencontract/cache" ] || fail "cache should be removed by default"
pass "Global system uninstalled"

# 9.7: Uninstall with --keep-cache
echo
echo "=== 9.7: Uninstall with cache preservation ==="
node "$CLI" install --non-interactive --harness claude
node "$CLI" uninstall --keep-cache --non-interactive
[ ! -d "$HOME/.opencontract/system" ] || fail "system not removed"
[ -d "$HOME/.opencontract/cache" ] || fail "cache should be preserved"
pass "Cache preserved with --keep-cache"

echo
echo "=== All manual tests passed ==="
