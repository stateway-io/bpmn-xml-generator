# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A **Claude Code / Cline skill** that generates BPMN 2.0 XML for a target process engine. It is mostly
documentation (the skill's instructions), plus a small Node.js toolchain the skill runs to validate and
lay out what it generates. There is no application to build.

The skill lives in `.claude/skills/bpmn-xml-generator/` and is invoked when users ask to create, model,
convert, migrate, fix or validate a business process / BPMN diagram.

## File structure

```
.claude/skills/bpmn-xml-generator/
  SKILL.md                        # Entry point: workflow and engine-agnostic authoring rules
  LICENSE, NOTICE                 # Apache-2.0 + copyright, OMG XSD attribution (installed with the skill)
  references/                     # CORE layer — OMG BPMN 2.0 only, no engine extensions
    elements.md                   #   element reference, XSD child order
    patterns.md                   #   advanced patterns (multi-instance, compensation, …)
    examples.md                   #   complete engine-agnostic examples
    validation-errors.md          #   validator messages, fixes, ID naming conventions
  profiles/                       # ENGINE layer — one file per engine
    _contract.md                  #   mandatory sections of a profile
    stateway.md | camunda8.md | flowable.md
  scripts/                        # Tooling run by the skill (Node.js ≥ 20, pinned deps)
    validate.mjs                  #   namespaces → bpmn-moddle → OMG XSD (xmllint) → bpmnlint
    layout.mjs                    #   bpmn-auto-layout + post-processing
    profiles.mjs                  #   per-engine config: namespaces, moddle descriptors, lint rules, support matrix
    moddle/*.json                 #   moddle descriptors for stateway: and flowable:
    lint-rules/*.cjs              #   local bpmnlint rules
    xsd/*.xsd                     #   OMG BPMN 2.0 schema
tests/
  run-examples.mjs                # validates every ```xml block in the skill docs
  check-install-manifest.mjs      # install.sh must list exactly the skill's files
.github/workflows/validate.yml    # CI: both tests on Node 20 and 22
install.sh                        # curl | sh installer (file manifest + optional npm ci)
```

## Architecture and design constraints

### Two layers
- **Core** (`SKILL.md`, `references/`) knows only the OMG BPMN 2.0 spec. It never contains engine
  extensions (`stateway:`, `zeebe:`, `flowable:`, `camunda:`) — the validator's `core` profile rejects them.
- **Profiles** (`profiles/<engine>.md` + the matching entry in `scripts/profiles.mjs`) add the engine's
  namespace, expression language, extension mapping, support matrix and deployment notes.
  Every profile follows `profiles/_contract.md`.
- Supported profiles: `stateway`, `camunda8`, `flowable` (+ `core` for documentation-only models).
- Out of scope for now: pools, lanes, collaborations, message flows, Camunda 7.

### Engine facts that are easy to get wrong
- **Stateway** uses its own namespace `https://stateway.io/schema/bpmn/1.0` (`stateway:taskDefinition`,
  `taskHeaders`, `ioMapping`, `assignmentDefinition`, `decisionRef`, `eventCorrelation`,
  `variableFilter`) — not `camunda:`. Expressions `{{…}}`; ioMapping targets are bare names; timers
  literal ISO 8601; no retries; `scriptTask`, `receiveTask`, `eventBasedGateway` are parse-only.
  Deploy with `POST /v1/definitions`. Source: https://docs.stateway.io.
- **Camunda 8**: `zeebe:` extensions, FEEL with `=` prefix, support depends on the 8.x version
  (validator `--engine-version`, default 8.10).
- **Flowable**: `flowable:` extensions, JUEL `${…}`; DMN via `serviceTask flowable:type="dmn"`
  (`businessRuleTask` is Drools).

### Output conventions
- Process ids: kebab-case starting with a letter. Flow ids: `flow_{source}_to_{target}`.
  Gateway ids: `gw_{purpose}`. Full table: `references/validation-errors.md` §5.
- Children in XSD order (`documentation`, `extensionElements`, `incoming`, `outgoing`, type-specific).
- All `<sequenceFlow>` elements at the bottom of their container, after the nodes. 2-space indentation.
- `<message>`, `<signal>`, `<error>`, `<escalation>` are siblings of `<process>`.

### Skill behavior
The skill must ask before writing whenever the description is incomplete — always including the target
engine profile — and ask all missing items in a single response. It must run `scripts/validate.mjs`
before delivering and fix every error.

## Editing guidelines

- `SKILL.md` is the source of truth for the workflow and the core authoring rules.
- Engine-specific content goes **only** in `profiles/`. When a profile's support matrix changes, update
  both the table in `profiles/<engine>.md` and the matrix in `scripts/profiles.mjs`.
- When the engine docs do not cover something, mark it `unverified` and cite the page; never invent syntax.
- Every complete XML example is fenced as ```` ```xml profile=<core|stateway|camunda8|flowable> ```` and
  must pass `node tests/run-examples.mjs` with zero errors and zero warnings (before and after layout).
  Plain ```` ```xml ```` fences are snippets and only need to be well-formed.
- New/renamed files under the skill directory must be added to the `FILES` list in `install.sh`
  (`node tests/check-install-manifest.mjs` enforces it).
- `validation-errors.md`: keep codes grouped by layer and sequential within a group.
- XML escaping in examples: `&&` → `&amp;&amp;`, `<` → `&lt;` inside element content and attribute values.
- Dependencies are pinned in `scripts/package.json` / `package-lock.json`; bump deliberately and re-run the tests.

## Commands

```sh
npm ci --prefix .claude/skills/bpmn-xml-generator/scripts        # install validator deps
node tests/run-examples.mjs                                       # validate all doc examples
node tests/check-install-manifest.mjs                             # installer manifest check
node .claude/skills/bpmn-xml-generator/scripts/validate.mjs <file.bpmn> --profile <p> [--engine-version 8.x] [--json]
node .claude/skills/bpmn-xml-generator/scripts/layout.mjs <file.bpmn> [out.bpmn]
```
