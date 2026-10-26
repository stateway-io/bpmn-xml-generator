# bpmn-xml-generator

A skill for [Claude Code](https://claude.ai/code) and [Cline](https://cline.bot) that turns plain-language
process descriptions into BPMN 2.0 XML that is valid against the OMG specification **and** ready to
deploy on your process engine: **Stateway**, **Camunda 8 (Zeebe)** or **Flowable**.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## What it does

When installed, the skill activates whenever you ask the agent to create, model, convert, migrate, fix or
validate a BPMN process. It:

- **Gathers requirements first** — asks, in a single message, for the target engine and every missing
  detail (assignees, endpoints, conditions, variables) instead of guessing.
- **Models in engine-agnostic BPMN 2.0** — events, tasks, gateways, sub-processes, multi-instance,
  event sub-processes, errors, escalations, transactions, compensation, links, conditional events,
  data objects and artifacts.
- **Applies an engine profile** — the engine's namespace, expression language, extension elements and
  support matrix (what the engine executes, parses only, or rejects).
- **Validates the result with real tools** — namespace allowlist, `bpmn-moddle`, the OMG BPMN 2.0 XSD
  (`xmllint`) and `bpmnlint` with per-engine rules (`camunda-compat` for Camunda 8).
- **Generates the diagram** — `bpmn-auto-layout` plus post-processing (boundary events, data
  associations, annotations, groups) so the file opens in bpmn.io and the engines' modelers.

---

## Architecture

```
.claude/skills/bpmn-xml-generator/
  SKILL.md                    # workflow: gather → model (core) → apply profile → validate → lay out
  references/                 # CORE: OMG BPMN 2.0 only, no engine extensions
    elements.md               #   elements, attributes, XSD child order
    patterns.md               #   multi-instance, event sub-processes, compensation, links …
    examples.md               #   complete engine-agnostic examples
    validation-errors.md      #   validator messages and fixes, ID conventions
  profiles/                   # ENGINE LAYER
    _contract.md              #   sections every profile must provide
    stateway.md               #   stateway: extensions, {{ }} expressions
    camunda8.md               #   zeebe: extensions, FEEL, version-aware checks
    flowable.md               #   flowable: extensions, JUEL
  scripts/                    # TOOLING (Node.js ≥ 20)
    validate.mjs              #   node validate.mjs file.bpmn --profile <core|stateway|camunda8|flowable>
    layout.mjs                #   node layout.mjs file.bpmn
    profiles.mjs, moddle/, lint-rules/, xsd/
tests/
  run-examples.mjs            # validates every XML block in the skill docs, before and after layout
  check-install-manifest.mjs  # install.sh downloads exactly the skill's files
```

| Profile | Namespace | Expressions | Source of the support matrix |
|---|---|---|---|
| `stateway` | `https://stateway.io/schema/bpmn/1.0` | `{{variables.x}}` | Stateway docs (Supported Elements & Fields) |
| `camunda8` | `http://camunda.org/schema/zeebe/1.0` | FEEL `=x` | `bpmnlint-plugin-camunda-compat` (per 8.x version) |
| `flowable` | `http://flowable.org/bpmn` | JUEL `${x}` | Flowable BPMN constructs guide |
| `core` | — | neutral | Documentation-only models |

**Out of scope for now:** pools, lanes, collaborations and message flows; Camunda 7 (`camunda:` namespace).

---

## Requirements

- Claude Code or Cline
- Node.js ≥ 20 — to run the validator and the layout (strongly recommended)
- `xmllint` (libxml2) — optional, enables the XSD check (child order, mandatory children)

---

## Installation

Run from the **root of your project**.

### Claude Code and Cline (shared path — recommended)

```sh
curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | sh
```

Installs to `.claude/skills/bpmn-xml-generator/` (recognised by both tools) and runs `npm ci` for the
validator when npm is available (`NO_DEPS=1` skips it).

### Cline native path

```sh
curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | TARGET=cline sh
```

### Global installation

```sh
# Shared path (Claude Code + Cline)
curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | GLOBAL=1 sh

# Cline native global path
curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | GLOBAL=1 TARGET=cline sh
```

### Manual installation

```sh
git clone https://github.com/stateway-io/bpmn-xml-generator.git
cp -r bpmn-xml-generator/.claude/skills/bpmn-xml-generator .claude/skills/
npm ci --prefix .claude/skills/bpmn-xml-generator/scripts
```

Restart Claude Code or Cline (or start a new session) to activate the skill.

---

## Use cases

### Model a process from scratch
```
Create a BPMN for expense reimbursement on Stateway. A finance analyst reviews
requests over $500; smaller amounts are paid automatically through our payments API.
```
The skill asks for what is missing (assignee, API URL, sync/async, variable names) before writing.

### Convert a description to BPMN
```
Convert this flow to BPMN for Camunda 8.8:
1. Customer places an order
2. Reserve stock for each item
3. Wait up to 24h for payment confirmation
4. If paid → ship; if timeout → release stock and cancel
```

### Fix, validate or migrate an existing file
```
Validate order.bpmn for Flowable and fix the errors.
Migrate this Camunda 8 process to Stateway.
Add a 48-hour timer to "KYC Review" that escalates to a senior analyst.
```

### Validate any file yourself
```sh
node .claude/skills/bpmn-xml-generator/scripts/validate.mjs order.bpmn --profile camunda8 --engine-version 8.8
node .claude/skills/bpmn-xml-generator/scripts/layout.mjs order.bpmn
```

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repository and create a branch from `main`.
2. Change the skill under `.claude/skills/bpmn-xml-generator/`. Core rules stay engine-agnostic;
   engine specifics go to `profiles/` (see `profiles/_contract.md` to add an engine).
3. Tag complete XML examples with ```` ```xml profile=<name> ```` so they are validated.
4. Run the checks:
   ```sh
   npm ci --prefix .claude/skills/bpmn-xml-generator/scripts
   node tests/run-examples.mjs
   node tests/check-install-manifest.mjs
   ```
5. Open a pull request describing what changed and why. CI runs the same checks.

---

## License

[Apache License 2.0](LICENSE)
