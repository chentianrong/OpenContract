#!/usr/bin/env python3
"""Semantic validator for the verification-report Contract.

Checks that each scenario in the Results section declares an outcome from the
Contract's vocabulary. A verification report whose entries omit the outcome
cannot be read as a verdict, and a heading rule cannot reach inside the section
to check it.

It deliberately does not judge whether an outcome is correct, nor how a failure
is described. Whether the evidence supports "passed" is the verifying agent's
call, guided by the Action's Skill.

Protocol: one JSON request on stdin, one JSON response on stdout. Diagnostics go
to stderr and are never part of the protocol.
"""
import json
import re
import sys

PROTOCOL = "opencontract-validator"
VERSION = "v1.0.0"

SECTION = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)
SCENARIO = re.compile(
    r"^[ \t]*(?:[-*][ \t]+)?\*\*Scenario:[ \t]*(.+?)\*\*[ \t]*[—–-][ \t]*(.*)$",
    re.MULTILINE,
)
# The outcome vocabulary is deliberately broad: it fixes the shape of the
# verdict, not the words an agent uses to explain it.
OUTCOMES = (
    "passed",
    "pass",
    "failed",
    "fail",
    "unverifiable",
    "not verified",
    "could not be verified",
    "no test coverage",
    "skipped",
)


def split_frontmatter(text):
    """Return (frontmatter_text, body). Assumes the file opens with `---`."""
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    return text[3:end], text[end + 4 :]


def section_body(body, heading):
    """Return the text under a level-2 heading, or "" when it is absent."""
    sections = list(SECTION.finditer(body))
    for index, section in enumerate(sections):
        if section.group(1) != heading:
            continue
        start = section.end()
        end = sections[index + 1].start() if index + 1 < len(sections) else len(body)
        return body[start:end]
    return ""


def validate(body):
    errors = []
    results = section_body(body, "Results")

    # An absent or empty section is the heading rules' business, not ours.
    if not results.strip():
        return errors

    scenarios = SCENARIO.findall(results)

    if not scenarios:
        errors.append(
            {
                "message": "The Results section lists no scenario outcomes.",
                "code": "VERIFICATION_NO_SCENARIOS",
                "detail": "write each entry as `**Scenario: <name>** — <outcome>`",
            }
        )
        return errors

    for name, outcome in scenarios:
        lowered = outcome.lower()
        if not any(word in lowered for word in OUTCOMES):
            errors.append(
                {
                    "message": f'Scenario "{name}" declares no outcome.',
                    "code": "VERIFICATION_OUTCOME_MISSING",
                    "detail": f"expected one of: {', '.join(OUTCOMES)}",
                }
            )

    return errors


def main():
    try:
        request = json.load(sys.stdin)
        with open(request["artifactPath"], "r", encoding="utf-8") as handle:
            content = handle.read()
    except Exception as cause:  # noqa: BLE001 - reported through the protocol
        print(
            json.dumps(
                {
                    "protocol": PROTOCOL,
                    "version": VERSION,
                    "valid": False,
                    "errors": [{"message": f"Could not read the Artifact: {cause}"}],
                    "warnings": [],
                }
            )
        )
        sys.exit(1)

    _, body = split_frontmatter(content)
    errors = validate(body)

    print(
        json.dumps(
            {
                "protocol": PROTOCOL,
                "version": VERSION,
                "valid": not errors,
                "errors": errors,
                "warnings": [],
            }
        )
    )
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
