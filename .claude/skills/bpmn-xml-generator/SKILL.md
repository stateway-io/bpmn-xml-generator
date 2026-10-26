---
name: bpmn-xml-generator
license: Apache-2.0
description: >
  Generate well-formed, schema-valid BPMN 2.0 XML for a target process engine (Stateway, Camunda 8 /
  Zeebe, or Flowable). Use this skill whenever the user asks to create, write, design, model, or define
  a business process, workflow, or BPMN diagram — even if they just describe a flow in plain language
  ("I need a process that does X then Y..."). Also use it when asked to convert YAML/JSON process
  definitions to BPMN, to migrate a BPMN file between engines, or to edit/fix/validate an existing BPMN
  file. The skill gathers missing requirements first, writes engine-agnostic BPMN 2.0, applies the
  engine profile, and verifies the result with an executable validator (bpmn-moddle, OMG XSD, bpmnlint).
---

# BPMN XML Generator

Produces BPMN 2.0 XML that is valid against the OMG specification **and** executable on the engine
the user targets.

---

## 0. Orientation: two layers

| Layer | Files | Responsibility |
|---|---|---|
| **Core** (this file + `references/`) | `elements.md`, `patterns.md`, `examples.md`, `validation-errors.md` | OMG BPMN 2.0 only: elements, structure, child order, modeling rules. Never emits engine extensions. |
| **Profile** (`profiles/`) | `stateway.md`, `camunda8.md`, `flowable.md` | One engine: namespace, expression language, extension elements, support matrix, deployment. |
| **Tooling** (`scripts/`) | `validate.mjs`, `layout.mjs` | Executable checks and diagram layout. |

Workflow: **gather requirements → model in core BPMN → apply the profile → validate → lay out → deliver.**

Read only what you need: this file always; `profiles/<engine>.md` once the engine is known;
`references/*` when a construct needs detail.

---

## 1. Information gathering — ask before writing

**Never generate a BPMN file from an incomplete description.** Ask every missing item in **one** message.

### 1.1 Always required
- [ ] **Target engine profile** — Stateway, Camunda 8 (which 8.x version?), or Flowable.
      If the user only wants a diagram for documentation, use the `core` profile (no extensions).
- [ ] **Process key** — lowercase kebab-case, starts with a letter (e.g. `order-approval`).
- [ ] **Process name** — human-readable label.
- [ ] **Happy path** — the sequence of steps from start to end (at least one activity).
- [ ] **Human steps** — which steps are done by people, and who (user, group, expression)?
- [ ] **Automated steps** — which steps call systems, and how (HTTP endpoint, job worker, decision, sub-process …)?
- [ ] **Decisions** — every branch point and the condition of each outgoing path, plus the default path.

### 1.2 Ask when relevant
- [ ] **Waits** — timers (ISO 8601 durations, dates, cycles), messages (name, correlation), signals.
- [ ] **Exceptions** — deadlines on tasks, error handling, cancellation, compensation (undo).
- [ ] **Parallel or repeated work** — parallel branches, one task per item of a list (multi-instance), loops.
- [ ] **Sub-processes** — embedded sub-flows, reusable processes (call activity), event sub-processes.
- [ ] **Data** — variable names used in conditions/mappings; what each human task may see and must write.
- [ ] **Diagram layout** — needed by bpmn.io / Modeler / Operate. Offer it by default (§6).

### 1.3 Profile questions
Add the questions listed in section 6 of the selected `profiles/<engine>.md` (e.g. URL and sync/async
mode for Stateway HTTP tasks, job types for Camunda 8, delegate kind for Flowable).

### 1.4 Clarify ambiguity
"Approve or reject" → confirm: exclusive choice? what ends each path? what is the condition and the default?
"Notify A and/or B" → inclusive vs parallel. "Wait for X or timeout" → event-based gateway or boundary timer
(check the profile's support matrix — e.g. Stateway does not execute event-based gateways).

### 1.5 Drafting with assumptions
Only if the user explicitly says to proceed with defaults: generate, and list every assumption
(names, conditions, assignees, endpoints) right after the file so they can be corrected.

---

## 2. Supported BPMN constructs (core)

Full attributes and child order: `references/elements.md`. Advanced patterns: `references/patterns.md`.
**Every construct must also be allowed by the profile's support matrix** (section 4 of the profile);
if it is `unsupported` there, use the listed alternative; if `parse-only`/`unverified`, warn the user.

| Category | Elements |
|---|---|
| Events | `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent`, `boundaryEvent` |
| Event definitions | timer, message, signal, error, escalation, conditional, link, compensate, cancel, terminate |
| Activities | `task`, `userTask`, `manualTask`, `serviceTask`, `sendTask`, `receiveTask`, `scriptTask`, `businessRuleTask`, `callActivity` |
| Sub-processes | `subProcess` (embedded, event sub-process `triggeredByEvent`), `transaction`, `adHocSubProcess` |
| Loops | `multiInstanceLoopCharacteristics` (parallel/sequential), `standardLoopCharacteristics` |
| Gateways | `exclusiveGateway`, `inclusiveGateway`, `parallelGateway`, `eventBasedGateway`, `complexGateway` (discouraged) |
| Flows | `sequenceFlow` (+ `conditionExpression`, gateway/activity `default`) |
| Data | `dataObject`, `dataObjectReference`, `dataStoreReference`, `property`, `ioSpecification`, data associations, `itemDefinition` |
| Artifacts | `documentation`, `textAnnotation`, `association`, `group` (+ `category`) |
| Root elements | `process`, `message`, `signal`, `error`, `escalation`, `itemDefinition`, `dataStore`, `category` |

**Out of scope (for now):** collaborations, pools (`participant`), lanes, message flows, choreographies,
conversations, CMMN. If asked for pools/lanes, say so and model the single executable process.

---

## 3. XML structure template

Start from the profile's *Definitions header* (section 2 of the profile). The core skeleton is:

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_process-key"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <!-- root elements used by the process: message, signal, error, escalation … -->

  <process id="process-key" name="Process Name" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Start">
      <outgoing>flow_start_to_first_task</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <task id="first_task" name="First Task">
      <incoming>flow_start_to_first_task</incoming>
      <outgoing>flow_first_task_to_end</outgoing>
    </task>

    <!-- ═══ GATEWAYS ═══ -->

    <!-- ═══ END ═══ -->
    <endEvent id="end" name="End">
      <incoming>flow_first_task_to_end</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_first_task" sourceRef="start" targetRef="first_task"/>
    <sequenceFlow id="flow_first_task_to_end" sourceRef="first_task" targetRef="end"/>

  </process>

</definitions>
```

- `targetNamespace` is required by the XSD; any URI works (keep the existing one when editing).
- Never put comments inside a start tag.
- Add the profile's namespace declaration(s) to `<definitions>` — and no other engine's.

---

## 4. Authoring rules

### 4.1 Child element order (XSD — enforced by the validator)
`documentation` → `extensionElements` → `incoming` → `outgoing` → type-specific children:
- activities: `ioSpecification` → `property` → `dataInputAssociation` → `dataOutputAssociation` → `loopCharacteristics` (last);
- catch events: … → event definition (last); throw events: `dataInputAssociation` → event definition (last);
- `ioSpecification`: `dataInput*` → `dataOutput*` → `inputSet` → `outputSet` (both sets **mandatory**).

### 4.2 Structure
- Unique `id` on every element; ids are XML NCNames (start with a letter/underscore, no spaces).
- `<incoming>`/`<outgoing>` children must mirror the `sourceRef`/`targetRef` of the sequence flows.
- `message`, `signal`, `error`, `escalation` are siblings of `<process>`, never inside it.
- All `<sequenceFlow>` elements at the bottom of their container, after the nodes.
- Every task, event, splitting gateway and conditional/default flow has a `name`.

### 4.3 Flow logic
- Exclusive/inclusive splits: every outgoing flow has a `conditionExpression` except the one in `default`.
- Never split and merge in one gateway; merge alternative paths with an exclusive gateway and
  synchronize parallel paths with a parallel gateway (never several flows straight into a task).
- A parallel join must receive a token from every branch: a branch that can exit early (end event,
  interrupting boundary) must end in a **terminate** end event or be restructured (ERR-022).
- Boundary events have `<outgoing>` but never `<incoming>`.
- Event-based gateway targets: only intermediate catch events / receive tasks.

### 4.4 Expressions and data
- The expression language comes from the profile: `{{…}}` Stateway, `=FEEL` Camunda 8, `${…}` Flowable.
- Escape `&` → `&amp;`, `<` → `&lt;` (so `&&` → `&amp;&amp;`); `"` → `&quot;` inside attributes.
- Timers: ISO 8601 (`PT1H`, `2026-12-31T09:00:00Z`, `R3/PT1H`); cron/expressions only if the profile allows them.
- Data associations reference **ids** of item-aware elements, never variable names; prefer the profile's
  variable-mapping mechanism (Stateway/Zeebe `ioMapping`, Flowable variables) for execution data.

### 4.5 Naming conventions
Process `kebab-case`; tasks `verb_noun`; gateways `gw_{purpose}`; flows `flow_{source}_to_{target}`;
boundary events `{type}_boundary_{activity}`; messages/signals/errors/escalations `msg_`/`sig_`/`err_`/`esc_`.
Full table: `references/validation-errors.md` §5.

---

## 5. Validate — mandatory before delivering

Write the XML to a `.bpmn` file, then run the validator from this skill's directory
(the folder that contains this `SKILL.md`):

```sh
# once per machine (Node.js ≥ 20; needs network access the first time)
npm ci --prefix <skill-dir>/scripts

node <skill-dir>/scripts/validate.mjs <file.bpmn> --profile <stateway|camunda8|flowable|core> [--engine-version 8.10]
```

It checks: allowed namespaces → `bpmn-moddle` parse (unknown elements, unresolved references) →
OMG XSD via `xmllint` (child order, mandatory children) → bpmnlint (`recommended` + the profile's support
matrix, expression syntax and configuration; `camunda-compat` for Camunda 8).

- **Fix every error and re-run until there are 0 errors.** Look codes up in `references/validation-errors.md`
  and the profile's section 8.
- Warnings: fix them, or tell the user why one stays (e.g. a construct that is `unverified` on the engine).
- If Node.js is unavailable, say so explicitly and walk the checklist in §7 manually.
  If `xmllint` is missing the validator skips the XSD layer and prints a notice — apply §4.1 carefully.

---

## 6. Diagram layout

Engines run files without a diagram, but bpmn.io, the Camunda/Flowable modelers and monitoring tools
need the `bpmndi:BPMNDiagram` section. Unless the user declines:

```sh
node <skill-dir>/scripts/layout.mjs <file.bpmn>          # in place; replaces any existing DI
node <skill-dir>/scripts/validate.mjs <file.bpmn> --profile <p>   # re-validate (DI is now checked too)
```

---

## 7. Manual checklist (fallback when the validator cannot run)

- [ ] Only the profile's namespace; no `camunda:`/`zeebe:`/`flowable:`/`stateway:` from another engine
- [ ] Unique, NCName ids; `targetNamespace` set; `isExecutable="true"` on executable processes
- [ ] Child order per §4.1; `ioSpecification` has `inputSet` and `outputSet`
- [ ] Every flow's `sourceRef`/`targetRef` exists and matches `<incoming>`/`<outgoing>`
- [ ] Every node is reachable and reaches an end; no implicit splits/joins
- [ ] Exclusive/inclusive splits: conditions on all non-default flows; a default where no condition may hold
- [ ] Parallel joins cannot deadlock; boundary events reference an activity and have no incoming
- [ ] Root elements (`message`, `signal`, `error`, `escalation`) declared and referenced
- [ ] Timers valid for the profile; conditions in the profile's expression language
- [ ] Every construct is `supported` in the profile's matrix (or the user was warned)

---

## 8. Output format

1. Write the complete XML to a file (default name `{process-key}.bpmn`; never truncate with `<!-- … -->`).
2. 2-space indentation; section comments START / ACTIVITIES / GATEWAYS / END / SEQUENCE FLOWS.
3. Validate (§5) and lay out (§6). Report the validator result (errors/warnings) to the user.
4. Summarize: engine profile, elements used, assumptions, anything `parse-only`/`unverified`.
   For files over ~150 lines, offer a table of elements and flows.
5. Point to the profile's *Deployment* section (e.g. `POST /v1/definitions` for Stateway).

---

## 9. Editing or migrating an existing file

- Read the whole file first; detect the engine from its namespaces (`stateway:`, `zeebe:`, `flowable:`,
  `camunda:` = Camunda 7, out of scope — ask which supported profile to migrate to).
- Validate it **before** changing it, so pre-existing problems are reported separately from yours.
- Preserve ids, names, `targetNamespace`, extension data you do not touch, and the order of existing elements.
- Keep `<incoming>`/`<outgoing>` in sync with every flow you add, remove or reconnect.
- If the file has a diagram and the graph changed, re-run `layout.mjs` (it regenerates the whole DI —
  tell the user manual positions are lost) or ask whether to keep the old DI and place new shapes manually.
- Migration between engines: translate extensions with the mapping tables in the target profile
  (section 5), rewrite expressions, then validate with the target profile.

---

## 10. Reference files

| File | Read when |
|---|---|
| `profiles/stateway.md` / `camunda8.md` / `flowable.md` | As soon as the engine is known (header, expressions, support matrix, extensions, examples) |
| `profiles/_contract.md` | Adding or changing a profile |
| `references/elements.md` | Attributes, child order and semantics of any core element |
| `references/patterns.md` | Multi-instance, loops, event sub-processes, errors/escalations, transactions, compensation, links, conditional events, ad-hoc, data and artifacts |
| `references/examples.md` | Complete engine-agnostic examples to adapt |
| `references/validation-errors.md` | Interpreting validator output; ID naming conventions |
