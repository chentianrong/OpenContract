#!/usr/bin/env python3
"""Generate the fourteen v1.0.0 Contract packages.

Each Contract package includes:
- contract.md: frontmatter metadata + declarative rules
- template.md: default blank template with artifact-core fields
- fixtures/valid/ and fixtures/invalid/: minimal conformance examples

The rules here are lightweight stubs — full structural rules and semantic
validators are deferred to later tasks. This script produces the package
skeleton needed for manifest and resolution conformance.
"""
from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1] / "resources" / "system" / "contracts"

# name -> (artifactType, description, required_sections)
# required_sections: [(name, level)]
CONTRACTS = {
    "note": (
        "note",
        "An informal observation, finding, or idea captured during exploration.",
        [],
    ),
    "decision": (
        "decision",
        "A question requiring human authorization, with options and a recommendation.",
        [("Question", 2), ("Options", 2), ("Recommendation", 2)],
    ),
    "decomposition": (
        "decomposition",
        "A large goal broken into independently workable parts.",
        [("Parts", 2)],
    ),
    "suggestion": (
        "suggestion",
        "Multiple viable options with trade-offs and a recommendation.",
        [("Options", 2), ("Recommendation", 2)],
    ),
    "proposal": (
        "proposal",
        "A statement of intended change: why, what, and impact.",
        [("Why", 2), ("What Changes", 2), ("Impact", 2)],
    ),
    "specification": (
        "specification",
        "Required behavior described with normative language and verifiable scenarios.",
        [("Requirements", 2)],
    ),
    "design": (
        "design",
        "Technical choices and their rationale.",
        [("Context", 2), ("Decisions", 2)],
    ),
    "tasks": (
        "tasks",
        "An ordered, verifiable task list.",
        [("Tasks", 2)],
    ),
    "execution-report": (
        "execution-report",
        "What was implemented, what was verified, and what remains.",
        [("Completed", 2), ("Verified", 2)],
    ),
    "debug-report": (
        "debug-report",
        "Symptom, reproduction, root cause, and fix.",
        [("Symptom", 2), ("Root Cause", 2), ("Fix", 2)],
    ),
    "review-report": (
        "review-report",
        "Findings from a correctness and simplification review.",
        [("Findings", 2)],
    ),
    "verification-report": (
        "verification-report",
        "What was checked, what passed, what failed, what could not be verified.",
        [("Checked", 2), ("Results", 2)],
    ),
    "report": (
        "report",
        "A standalone summary of a body of work.",
        [("Summary", 2)],
    ),
    "archive-report": (
        "archive-report",
        "Canonical Spec updates, repaired references, and final archive destination.",
        [("Updates", 2), ("Destination", 2)],
    ),
}


def render_sections(sections: list[tuple[str, int]]) -> str:
    if not sections:
        return ""
    lines = ["  sections:"]
    for name, level in sections:
        lines.append(f"    - name: {name}")
        lines.append(f"      level: {level}")
        lines.append("      required: true")
        lines.append("      minimumContent: 1")
    return "\n" + "\n".join(lines)


def render_contract_md(name: str, artifact_type: str, description: str, sections) -> str:
    # Quote description if it contains YAML special chars
    safe_description = f'"{description}"' if ':' in description else description
    rules_block = f"""rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]{render_sections(sections)}"""
    return f"""---
name: {name}
version: v1.0.0
artifactType: {artifact_type}
artifactCoreVersion: v1.0.0
description: {safe_description}
template: template.md
{rules_block}
---

# {name.replace("-", " ").title()} Contract

This Contract validates the `{artifact_type}` Artifact type at v1.0.0.

## Structure

Frontmatter must include the artifact-core metadata fields. The body must contain the declared sections.

## Usage

Agents produce Artifacts of this type when the {description.lower()}.
"""


def render_template(name: str, sections) -> str:
    heading_lines = "\n\n".join(f"## {s[0]}\n" for s in sections)
    return f"""---
contract: {name}
version: v1.0.0
action: example
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

{heading_lines}
""".strip() + "\n"


def render_valid_fixture(name: str, sections) -> str:
    # Minimal valid example with actual content under each heading
    heading_lines = "\n\n".join(f"## {s[0]}\n\nContent under {s[0]}." for s in sections)
    return f"""---
contract: {name}
version: v1.0.0
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

{heading_lines}
""".strip() + "\n"


def render_invalid_fixture(name: str, sections) -> str:
    """An invalid fixture must actually fail validation.

    For a Contract with required sections, dropping the first one is a real
    SECTION_MISSING. For a Contract with no section rules, a missing section
    proves nothing (extra sections are allowed by default), so the fixture has
    to break something the Contract does check: an inexact `version`.
    """
    if sections:
        heading_lines = "\n\n".join(f"## {s[0]}\n\nContent." for s in sections[1:])
        version = "v1.0.0"
    else:
        heading_lines = "## Observation\n\nContent."
        version = "1.0"  # not an exact vX.Y.Z, fails artifact-core
    return f"""---
contract: {name}
version: {version}
action: test
action_version: v1.0.0
created_at: "2026-01-31T12:00:00Z"
inputs: []
---

{heading_lines}
""".strip() + "\n"


def main() -> None:
    for name, (artifact_type, description, sections) in CONTRACTS.items():
        package = ROOT / name
        package.mkdir(parents=True, exist_ok=True)

        (package / "contract.md").write_text(
            render_contract_md(name, artifact_type, description, sections), encoding="utf-8"
        )
        (package / "template.md").write_text(render_template(name, sections), encoding="utf-8")

        fixtures_valid = package / "fixtures" / "valid"
        fixtures_invalid = package / "fixtures" / "invalid"
        fixtures_valid.mkdir(parents=True, exist_ok=True)
        fixtures_invalid.mkdir(parents=True, exist_ok=True)

        (fixtures_valid / "example.md").write_text(
            render_valid_fixture(name, sections), encoding="utf-8"
        )
        # Name the fixture after the defect it actually carries.
        invalid_name = "missing-section.md" if sections else "inexact-version.md"
        (fixtures_invalid / invalid_name).write_text(
            render_invalid_fixture(name, sections), encoding="utf-8"
        )

        print(f"wrote {name}/ (contract.md, template.md, fixtures)")

    print(f"\n{len(CONTRACTS)} Contract packages generated.")


if __name__ == "__main__":
    main()
