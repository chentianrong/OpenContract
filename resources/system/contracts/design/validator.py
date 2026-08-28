#!/usr/bin/env python3
"""Semantic validator for the design Contract.

Checks structure the heading rules cannot express. It deliberately does not try
to infer intent from prose: sniffing for words like "will" or "proposed" would
produce false verdicts on legitimate documents. Instead it verifies that each
mode carries the sections that make it useful, and that declared decisions
actually state a rationale.
"""
import json
import re
import sys

PROTOCOL = "opencontract-validator"
VERSION = "v1.0.0"

SECTION_HEADING = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
DECISION_HEADING = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)

# A change document has to say what it touches; a canonical one has to say what
# the standing choices are.
REQUIRED_BY_MODE = {
    "change": ("Affected Components", "Decisions"),
    "canonical": ("Components", "Decisions"),
}

RATIONALE_MARKERS = ("because", "rationale", "so that", "trade-off", "tradeoff", "instead of", "chosen")


def split_frontmatter(text):
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    return text[3:end], text[end + 4 :]


def read_mode(frontmatter_text):
    matched = re.search(r"^mode:\s*(\S+)", frontmatter_text, re.MULTILINE)
    return matched.group(1).strip("\"'") if matched else None


def decision_blocks(body):
    """Yield (name, block) for each `###` heading under `## Decisions`."""
    sections = list(SECTION_HEADING.finditer(body))
    for index, section in enumerate(sections):
        if section.group(1).strip() != "Decisions":
            continue
        start = section.end()
        end = sections[index + 1].start() if index + 1 < len(sections) else len(body)
        decisions_body = body[start:end]

        headings = list(DECISION_HEADING.finditer(decisions_body))
        for position, heading in enumerate(headings):
            block_start = heading.end()
            block_end = (
                headings[position + 1].start() if position + 1 < len(headings) else len(decisions_body)
            )
            yield heading.group(1), decisions_body[block_start:block_end]


def validate(body, mode):
    errors = []
    present = {name.strip() for name in SECTION_HEADING.findall(body)}

    for required in REQUIRED_BY_MODE.get(mode, ()):
        if required not in present:
            errors.append(
                {
                    "message": f'{mode} mode requires a "## {required}" section.',
                    "code": "DESIGN_SECTION_MISSING",
                    "repairHint": f"Add a `## {required}` section describing that part of the design.",
                }
            )

    # A decision without a rationale is a statement, not a decision: the reader
    # cannot tell why the alternative was rejected.
    for name, block in decision_blocks(body):
        if not block.strip():
            errors.append(
                {
                    "message": f'Decision "{name}" has no content.',
                    "code": "DESIGN_DECISION_EMPTY",
                    "repairHint": "State the choice and why it was made.",
                }
            )
        elif not any(marker in block.lower() for marker in RATIONALE_MARKERS):
            errors.append(
                {
                    "message": f'Decision "{name}" states no rationale.',
                    "code": "DESIGN_DECISION_NO_RATIONALE",
                    "repairHint": "Say why this choice was made and what it was chosen over.",
                }
            )

    return errors


def main():
    request = json.load(sys.stdin)
    with open(request["artifactPath"], encoding="utf-8") as handle:
        text = handle.read()

    frontmatter_text, body = split_frontmatter(text)
    mode = read_mode(frontmatter_text)

    errors = validate(body, mode) if mode in REQUIRED_BY_MODE else []

    json.dump(
        {"protocol": PROTOCOL, "version": VERSION, "valid": not errors, "errors": errors},
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
