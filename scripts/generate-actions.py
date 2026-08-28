#!/usr/bin/env python3
"""Generate the twelve v1.0.0 business Action Skills.

Each Action is a standards-compliant SKILL.md: minimal frontmatter plus a
fenced ```yaml opencontract block declaring its Artifact contracts. The
declarations here are the authority for what `validate-action` enforces.
"""
from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1] / "resources" / "system" / "actions"

# name -> (description, guidance paragraphs, inputs, outputs)
# Each input/output entry: (contract, required, minCount, maxCount)
ACTIONS = {
    "explore": (
        "Investigate an open question or unfamiliar area and capture what was learned.",
        [
            "Use this Action when the goal is still vague, the problem space is unfamiliar, "
            "or a decision needs evidence before it can be framed. Exploration is "
            "deliberately unstructured: read code, run experiments, and follow leads.",
            "Persist a `note` only when a finding is worth carrying into later work. A purely "
            "conversational exploration that reaches an answer immediately needs no Artifact.",
        ],
        [],
        [("note", False, 0, None)],
    ),
    "clarify": (
        "Resolve an ambiguity by asking the user and recording the decision.",
        [
            "Use this Action when work cannot proceed correctly under any assumption: the "
            "requirement is genuinely ambiguous, the trade-off is the user's to make, or the "
            "change is material enough to need authorization.",
            "Record the question, the options considered, and the recommendation as a "
            "`decision`. Leave it `pending` until the user answers; a gated operation must not "
            "proceed on a pending Decision.",
        ],
        [("note", False, 0, None)],
        [("decision", True, 1, None)],
    ),
    "decompose": (
        "Break a large goal into independently workable parts.",
        [
            "Use this Action when a goal is too large to hold in one plan, or when parts of it "
            "can proceed in parallel or be delivered separately.",
            "Produce a `decomposition` that names each part, states its boundary, and records "
            "the dependencies between parts. Do not plan the parts here — that is `plan`.",
        ],
        [("note", False, 0, None)],
        [("decomposition", True, 1, 1)],
    ),
    "suggest": (
        "Offer options for how to proceed, with a recommendation.",
        [
            "Use this Action when several approaches are viable and the choice benefits from "
            "being made explicit before implementation starts.",
            "Produce a `suggestion` recording each option with its trade-offs and a clear "
            "recommendation. When the choice requires authorization rather than advice, use "
            "`clarify` instead.",
        ],
        [("note", False, 0, None), ("decomposition", False, 0, None)],
        [("suggestion", True, 1, None)],
    ),
    "build": (
        "Turn an agreed direction into a written proposal of what will change.",
        [
            "Use this Action to state the intended change before designing or planning it: why "
            "the change is needed, what will change, and what the impact is.",
            "Produce a `proposal`. Keep it about scope and intent; technical choices belong in "
            "`design` and step ordering belongs in `plan`.",
        ],
        [("suggestion", False, 0, None), ("decision", False, 0, None)],
        [("proposal", True, 1, 1)],
    ),
    "plan": (
        "Turn a proposal into specifications, a design, and an ordered task list.",
        [
            "Use this Action once the intended change is agreed. Specify the required behavior, "
            "record the technical choices, and order the work so each step is verifiable.",
            "Produce a `tasks` list, and produce `specification` and `design` Artifacts when the "
            "change adds behavior or makes architectural choices worth recording.",
        ],
        [("proposal", True, 1, None), ("decision", False, 0, None)],
        [
            ("specification", False, 0, None),
            ("design", False, 0, None),
            ("tasks", True, 1, 1),
        ],
    ),
    "execute": (
        "Implement planned tasks and record what was actually done.",
        [
            "Use this Action to carry out a task list. Implement the specified behavior, verify "
            "it with the project's own build and tests, and keep changes scoped to the tasks.",
            "Produce an `execution-report` recording which tasks completed, what was verified, "
            "and anything left out with the reason. Do not silently narrow specified behavior.",
        ],
        [("tasks", True, 1, None), ("specification", False, 0, None), ("design", False, 0, None)],
        [("execution-report", True, 1, None)],
    ),
    "debug": (
        "Diagnose a defect and record the root cause and the fix.",
        [
            "Use this Action when behavior is wrong and the cause is not yet known. Reproduce "
            "the failure first, then narrow to a root cause before changing code.",
            "Produce a `debug-report` recording the symptom, the reproduction, the root cause, "
            "and the fix. If the same approach fails twice, change approach rather than "
            "tweaking further.",
        ],
        [("execution-report", False, 0, None), ("note", False, 0, None)],
        [("debug-report", True, 1, None)],
    ),
    "review": (
        "Review changed work for correctness and for simplification opportunities.",
        [
            "Use this Action to examine work that is already written: look for defects that "
            "would change behavior, and for reuse or simplification that would reduce it.",
            "Produce a `review-report` with each finding anchored to a file and line, stating "
            "the concrete failure scenario rather than a general concern.",
        ],
        [("execution-report", False, 0, None), ("tasks", False, 0, None)],
        [("review-report", True, 1, None)],
    ),
    "verify": (
        "Check delivered work against its specified behavior.",
        [
            "Use this Action to confirm that what was built matches what was specified. Run the "
            "project's build and tests, and check each specified scenario.",
            "Produce a `verification-report` stating what was checked, what passed, what failed "
            "with the actual output, and what could not be verified.",
        ],
        [
            ("specification", False, 0, None),
            ("tasks", False, 0, None),
            ("execution-report", False, 0, None),
        ],
        [("verification-report", True, 1, None)],
    ),
    "report": (
        "Summarize a body of work for a reader who did not follow it.",
        [
            "Use this Action to produce a standalone account of what was done and what it "
            "means, leading with the outcome rather than the chronology.",
            "Produce a `report`. Draw on the task's existing Artifacts as inputs rather than "
            "re-deriving their content.",
        ],
        [
            ("execution-report", False, 0, None),
            ("verification-report", False, 0, None),
            ("review-report", False, 0, None),
        ],
        [("report", True, 1, None)],
    ),
    "archive": (
        "Fold validated task facts into canonical Specs and archive the task.",
        [
            "Use this Action when a task is complete and its durable facts belong in the "
            "canonical Specs. Determine which content is a new project fact, apply the needed "
            "create/merge/rewrite/split/remove changes, and validate the result.",
            "Because managed `inputs` are relative, rewrite affected inputs and Markdown links "
            "before moving the task directory under the archive root. If a reference cannot be "
            "repaired safely, or a merge would cause a material conflict, stop and request a "
            "decided Decision instead of guessing.",
        ],
        [
            ("report", False, 0, None),
            ("verification-report", False, 0, None),
            ("decision", False, 0, None),
        ],
        [("archive-report", True, 1, 1)],
    ),
}


def render_declaration(entries: list[tuple[str, bool, int, int | None]]) -> str:
    if not entries:
        return "[]"
    lines = []
    for contract, required, min_count, max_count in entries:
        lines.append(f"  - contract: {contract}")
        lines.append("    version: v1.0.0")
        lines.append(f"    required: {'true' if required else 'false'}")
        if min_count:
            lines.append(f"    minCount: {min_count}")
        if max_count:
            lines.append(f"    maxCount: {max_count}")
    return "\n" + "\n".join(lines)


def render_skill(name: str, description: str, guidance: list[str], inputs, outputs) -> str:
    wrapped = "\n\n".join(textwrap.fill(p, width=88) for p in guidance)
    heading = name.replace("-", " ").title()
    return f"""---
name: {name}
description: {description}
metadata:
  version: v1.0.0
---

# {heading}

{wrapped}

## Declared contracts

```yaml opencontract
inputs: {render_declaration(inputs)}
outputs: {render_declaration(outputs)}
```
"""


def main() -> None:
    for name, (description, guidance, inputs, outputs) in ACTIONS.items():
        package = ROOT / name
        package.mkdir(parents=True, exist_ok=True)
        (package / "SKILL.md").write_text(
            render_skill(name, description, guidance, inputs, outputs), encoding="utf-8"
        )
        print(f"wrote {name}/SKILL.md")
    print(f"\n{len(ACTIONS)} business Action Skills generated.")


if __name__ == "__main__":
    main()
