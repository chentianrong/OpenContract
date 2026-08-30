#!/usr/bin/env python3
"""Semantic validator for the tasks Contract.

Checks the one thing heading rules cannot express: that the Tasks section is
actually a task list in checkbox form, rather than prose that happens to sit
under the right heading.

It deliberately does not judge the content of a task. Whether a task is
specific enough, correctly scoped, or worth doing is the agent's call, guided by
the Action's Skill — encoding that judgement here would fail legitimate task
lists over word choice.

Protocol: one JSON request on stdin, one JSON response on stdout. Diagnostics go
to stderr and are never part of the protocol.
"""
import json
import re
import sys

PROTOCOL = "opencontract-validator"
VERSION = "v1.0.0"

# `- [ ] text` or `- [x] text`, at any indentation, with `*` accepted as the
# bullet marker since Markdown treats it identically.
CHECKBOX = re.compile(r"^[ \t]*[-*][ \t]+\[[ xX]\][ \t]*(.*)$", re.MULTILINE)
SECTION = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)


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
    tasks = section_body(body, "Tasks")

    # An absent or empty section is the heading rules' business, not ours.
    if not tasks.strip():
        return errors

    items = CHECKBOX.findall(tasks)

    if not items:
        errors.append(
            {
                "message": "The Tasks section contains no checkbox items.",
                "code": "TASKS_NOT_A_CHECKLIST",
                "detail": "write each task as `- [ ] <task>` so completion can be tracked",
            }
        )
        return errors

    for position, text in enumerate(items, start=1):
        if not text.strip():
            errors.append(
                {
                    "message": f"Task {position} has an empty description.",
                    "code": "TASK_EMPTY",
                    "detail": "a checkbox marker with no text following it",
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
