# Engine Profile Contract

The skill has two layers:

| Layer | Files | Knows about |
|---|---|---|
| **Core** | `SKILL.md`, `references/*.md` | OMG BPMN 2.0 only: elements, structure, child order, modeling rules |
| **Profile** | `profiles/<engine>.md` + `scripts/profiles.mjs` + `scripts/moddle/*.json` + `scripts/lint-rules/*` | One engine: namespace, expression language, extensions, what it executes, how to deploy |

The core never emits extension attributes or elements. A profile never redefines BPMN semantics —
it only adds what the engine needs to execute a core model, and marks what the engine cannot run.

Every `profiles/<engine>.md` **must** contain these sections, in this order:

1. **Overview** — engine, official documentation links, version(s) covered, date verified.
2. **Definitions header** — namespace declarations and any required `<definitions>`/`<process>`
   attributes, as a copy-paste block.
3. **Expressions** — the language and its syntax per position: sequence-flow conditions, assignment
   attributes, input/output mappings, timers, multi-instance. Include escaping notes.
4. **Support matrix** — every core construct from `references/elements.md` and `references/patterns.md`
   with one status: `supported`, `parse-only`, `unverified`, `unsupported`, plus the alternative to use.
   Must match the matrix in `scripts/profiles.mjs` (or, for Camunda 8, the camunda-compat plugin).
5. **Extension mapping** — how to configure each activity/event type (user task assignment and forms,
   service/send task implementation, business rule task decision reference, call activity variables,
   script task, message correlation, multi-instance collections, errors/retries).
6. **Additional questions** — what to ask the user, on top of the core checklist, before generating.
7. **Deployment** — how the file is deployed/published (API, CLI, modeler).
8. **Profile-specific errors** — what the profile's lint rules report and how to fix it.
9. **Complete examples** — at least one full document tagged ```` ```xml profile=<engine> ````,
   which `tests/run-examples.mjs` validates with zero errors and zero warnings.

When the engine documentation does not cover something, say so explicitly (status `unverified`),
cite the page that was checked, and never invent syntax.

## Adding a profile

1. Write `profiles/<engine>.md` following the sections above.
2. Add the profile to `scripts/profiles.mjs` (namespaces, moddle extension, lint rules, support matrix).
3. Add a moddle descriptor in `scripts/moddle/<engine>.json` (or depend on the engine's published one).
4. Add engine-specific checks as a bpmnlint rule in `scripts/lint-rules/` when they are mechanical.
5. Add the engine to the profile question in `SKILL.md` §1 and to the README.
6. Run `node tests/run-examples.mjs`.
