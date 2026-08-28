#!/usr/bin/env python3
"""Semantic validator for the specification Contract.

Enforces what heading rules cannot express: that delta mode actually uses delta
sections, that canonical mode uses none, and that every requirement states
normative behavior and carries a verifiable scenario.

Protocol: one JSON request on stdin, one JSON response on stdout. Diagnostics go
to stderr and are never part of the protocol.
"""
import json
import re
import sys

PROTOCOL = "opencontract-validator"
VERSION = "v1.0.0"

DELTA_SECTIONS = ("ADDED Requirements", "MODIFIED Requirements", "REMOVED Requirements")
NORMATIVE_WORDS = ("SHALL", "MUST", "SHOULD", "MAY", "SHALL NOT", "MUST NOT")

REQUIREMENT_HEADING = re.compile(r"^###\s+Requirement:\s*(.+?)\s*$", re.MULTILINE)
SCENARIO_HEADING = re.compile(r"^####\s+Scenario:\s*(.+?)\s*$", re.MULTILINE)
SECTION_HEADING = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def split_frontmatter(text):
    """Return (frontmatter_text, body). Assumes the file opens with `---`."""
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    return text[3:end], text[end + 4 :]


def read_mode(frontmatter_text):
    matched = re.search(r"^mode:\s*(\S+)", frontmatter_text, re.MULTILINE)
    return matched.group(1).strip("\"'") if matched else None


def requirement_blocks(body):
    """Yield (name, block_text) for each `### Requirement:` heading."""
    matches = list(REQUIREMENT_HEADING.finditer(body))
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        yield match.group(1), body[start:end]


def validate(body, mode):
    errors = []
    sections = SECTION_HEADING.findall(body)
    delta_present = [name for name in sections if name in DELTA_SECTIONS]

    if mode == "delta":
        if not delta_present:
            errors.append(
                {
                    "message": "Delta mode needs at least one ADDED, MODIFIED, or REMOVED Requirements section.",
                    "code": "SPEC_DELTA_SECTION_MISSING",
                    "repairHint": "Add `## ADDED Requirements` (or MODIFIED/REMOVED) and put requirements under it.",
                }
            )
    elif mode == "canonical":
        for name in delta_present:
            errors.append(
                {
                    "message": f'Canonical mode must not use the historical delta section "{name}".',
                    "code": "SPEC_CANONICAL_HAS_DELTA",
                    "repairHint": "Describe current effective behavior without ADDED/MODIFIED/REMOVED markers.",
                }
            )

    requirements = list(requirement_blocks(body))
    if mode == "delta" and not requirements:
        errors.append(
            {
                "message": "Delta mode declares no requirements.",
                "code": "SPEC_NO_REQUIREMENTS",
                "repairHint": "Add a `### Requirement: <name>` heading describing the required behavior.",
            }
        )

    for name, block in requirements:
        if not any(word in block for word in NORMATIVE_WORDS):
            errors.append(
                {
                    "message": f'Requirement "{name}" states no normative behavior.',
                    "code": "SPEC_REQUIREMENT_NOT_NORMATIVE",
                    "repairHint": "Use SHALL, MUST, SHOULD, or MAY to state what is required.",
                }
            )

        scenarios = SCENARIO_HEADING.findall(block)
        if not scenarios:
            errors.append(
                {
                    "message": f'Requirement "{name}" has no scenario.',
                    "code": "SPEC_REQUIREMENT_NO_SCENARIO",
                    "repairHint": "Add a `#### Scenario:` heading with WHEN and THEN steps.",
                }
            )
            continue

        # Each scenario needs both a trigger and an observable outcome, or it
        # cannot be verified.
        for index, scenario_match in enumerate(SCENARIO_HEADING.finditer(block)):
            start = scenario_match.end()
            following = list(SCENARIO_HEADING.finditer(block))
            end = following[index + 1].start() if index + 1 < len(following) else len(block)
            scenario_body = block[start:end]

            if "WHEN" not in scenario_body or "THEN" not in scenario_body:
                errors.append(
                    {
                        "message": f'Scenario "{scenario_match.group(1)}" is not verifiable.',
                        "code": "SPEC_SCENARIO_INCOMPLETE",
                        "repairHint": "Give the scenario both a **WHEN** trigger and a **THEN** outcome.",
                    }
                )

    return errors


def main():
    request = json.load(sys.stdin)
    with open(request["artifactPath"], encoding="utf-8") as handle:
        text = handle.read()

    frontmatter_text, body = split_frontmatter(text)
    mode = read_mode(frontmatter_text)

    # A missing or unknown mode is reported by the frontmatter schema, so this
    # validator only checks the modes it understands.
    errors = validate(body, mode) if mode in ("delta", "canonical") else []

    json.dump(
        {"protocol": PROTOCOL, "version": VERSION, "valid": not errors, "errors": errors},
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
