#!/usr/bin/env python3
"""Semantic validator for the review-report Contract.

Checks that each finding carries a location anchor, which is what makes a
review report actionable: `**path/to/file.ext:42** — description`. A heading rule
can require the Findings section to exist, but not that its entries are anchored.

It deliberately does not judge a finding's content. Whether the described defect
is real, severe, or worth fixing is the reviewing agent's call — sniffing for
words like "might" or "seems" would reject legitimate findings that hedge an
honest uncertainty.

Protocol: one JSON request on stdin, one JSON response on stdout. Diagnostics go
to stderr and are never part of the protocol.
"""
import json
import re
import sys

PROTOCOL = "opencontract-validator"
VERSION = "v1.0.0"

SECTION = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)
# A finding opens with a bolded anchor followed by an em dash or hyphen.
FINDING = re.compile(r"^[ \t]*(?:[-*][ \t]+)?\*\*(.+?)\*\*[ \t]*[—–-][ \t]*(.*)$", re.MULTILINE)
# `path/to/file.ext:42`, optionally a range (`:42-58`), optionally a column.
LOCATION = re.compile(r"^[\w./@-]+\.[A-Za-z0-9]+:\d+(?:[-:]\d+)?$")


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
    findings_body = section_body(body, "Findings")

    # An absent or empty section is the heading rules' business, not ours.
    if not findings_body.strip():
        return errors

    findings = FINDING.findall(findings_body)

    if not findings:
        errors.append(
            {
                "message": "The Findings section contains no anchored findings.",
                "code": "REVIEW_FINDING_NOT_ANCHORED",
                "detail": "open each finding with `**path/to/file.ext:42** — description`",
            }
        )
        return errors

    for anchor, description in findings:
        if not LOCATION.match(anchor.strip()):
            errors.append(
                {
                    "message": f'Finding anchor "{anchor}" is not a file location.',
                    "code": "REVIEW_FINDING_NOT_ANCHORED",
                    "detail": "expected `path/to/file.ext:42`, optionally a line range",
                }
            )
        if not description.strip():
            errors.append(
                {
                    "message": f'Finding at "{anchor}" has no description.',
                    "code": "REVIEW_FINDING_EMPTY",
                    "detail": "state what goes wrong at this location",
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
