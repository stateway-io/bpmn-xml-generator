# BPMN Validation Errors

What `scripts/validate.mjs` reports, why, and how to fix it. The `source` column of the
validator output tells you which layer found the problem:

| Source | Layer | Typical cause |
|---|---|---|
| `namespace` | namespace allowlist | extension namespace that the selected profile does not use |
| `moddle` | `bpmn-moddle` parse | unknown element/attribute, unresolved reference, duplicate id, malformed XML |
| `xsd` | OMG BPMN 2.0 XSD (`xmllint`) | wrong child order, missing mandatory child, invalid id |
| `lint:<rule>` | bpmnlint | modeling errors (`recommended`), engine support, expression syntax, engine configuration |

Engine-specific problems are listed at the end of each `profiles/<engine>.md`.

---

## 1. Parse-time errors (`namespace`, `moddle`)

### ERR-001: `duplicate ID <xyz>` / element without `id`
**Fix:** every element that is referenced or rendered needs a unique `id` (flow nodes, flows, event
definitions, messages, errors, data objects, artifacts).

### ERR-002: `unknown type <ns:Element>` / `unparsable content <xyz> detected`
**Cause:** typo or wrong case (`<exclusivegateway>`, `<SequenceFlow>`), or an extension element the
profile's descriptor does not know (e.g. `stateway:retries`).
**Fix:** BPMN is case-sensitive; check `references/elements.md` or the profile's extension table.

### ERR-003: `unresolved reference <xyz>`
**Cause:** `sourceRef`, `targetRef`, `attachedToRef`, `messageRef`, `signalRef`, `errorRef`,
`escalationRef`, `default`, `dataObjectRef` … points to an id that does not exist — or a **variable
name** was used where an id is required (data associations).
**Fix:** reference declared ids. `<message>`, `<signal>`, `<error>`, `<escalation>` are siblings of
`<process>` inside `<definitions>`.

### ERR-004: `targetNamespace` missing
**Fix:** add any URI (`http://bpmn.io/schema/bpmn` for new files); keep the existing value when editing.

### ERR-005: XML is not well-formed
- Every tag is closed; `<incoming>`/`<outgoing>` are child elements, not attributes.
- No comments inside a start tag (`<definitions a="1" <!-- x --> b="2">` is invalid).
- Escape `&` as `&amp;` and `<` as `&lt;` in content and attributes; `"` as `&quot;` in attributes.

### ERR-006: `namespace prefix="uri" is not allowed for profile "<p>"`
**Cause:** extensions of another engine (`camunda:`, `zeebe:` in a Stateway file …) or any extension in
`core` output.
**Fix:** use only the profile's namespace; translate the extension (see the profile's mapping table).

### ERR-007: invalid id (XSD `xsd:ID`)
**Cause:** ids must be XML NCNames — start with a letter or `_`, no spaces, no `:`.
`1st_review` or `review task` are invalid. **Fix:** `review_1`, `review_task`.

---

## 2. Schema errors (`xsd`)

### ERR-010: `Element 'bpmn:incoming': This element is not expected`
**Cause:** children in the wrong order — typically `ioSpecification`, `dataInputAssociation` or an
event definition placed **before** `<incoming>`/`<outgoing>`.
**Fix:** follow `references/elements.md` §2: `documentation` → `extensionElements` → `incoming` →
`outgoing` → type-specific children (event definitions are last in events; `loopCharacteristics`
last in activities).

### ERR-011: `Element 'bpmn:ioSpecification': Missing child element(s)`
**Cause:** `ioSpecification` without `inputSet`/`outputSet` (both mandatory, even if empty).
**Fix:** add `<inputSet id="…"/>` and `<outputSet id="…"/>` after the `dataInput`/`dataOutput` list.

### ERR-012: `Element 'bpmn:dataInputAssociation': Missing child element(s)`
**Cause:** data association without `targetRef` (mandatory).
**Fix:** `<sourceRef>` = id of a `dataObjectReference`/`property`/`dataOutput`, `<targetRef>` = id of a
`dataInput` declared in the activity's `ioSpecification` (input) or of a `dataObjectReference` (output).

---

## 3. Modeling errors (`lint:*`, bpmnlint `recommended`)

### ERR-020: `start-event-required` / `end-event-required`
Every process and embedded sub-process needs a start and an end event. Several start events in a
process are allowed (e.g. blank + message start); only one *blank* start per scope (`single-blank-start-event`).

### ERR-021: `conditional-flows` — token can get stuck
**Cause:** an exclusive/inclusive split where no condition may hold and there is no default flow,
or a non-default outgoing flow without a condition.
**Fix:** set `default="flow_id"` on the gateway (that flow has no condition) and give every other
outgoing flow a `conditionExpression`.

### ERR-022: parallel join never fires (deadlock)
**Cause:** a branch of a parallel split can leave the scope before reaching the join — through an end
event or an **interrupting boundary event** — so the join waits forever. Not detectable by the linter;
check it manually.
**Fix:** route the escaping path to a `terminateEventDefinition` end event, use a non-interrupting
boundary that rejoins the branch, or wrap the parallel part in a sub-process with an error boundary.

### ERR-023: `fake-join` (warning)
**Cause:** several incoming flows straight into a task/event; it fires once per token instead of synchronizing.
**Fix:** merge with an exclusive gateway (alternative paths) or a parallel gateway (synchronize).

### ERR-024: `no-implicit-split`, `no-implicit-start`, `no-implicit-end`, `no-disconnected`
**Cause:** several unconditioned outgoing flows on a task (implicit parallel split), a node without
incoming/outgoing flows, or an orphan element.
**Fix:** use explicit gateways; connect every node. Exceptions handled by the rules: boundary events
(no incoming), compensation handlers and boundaries (connected by a **process-level** `<association>`),
link events, event sub-processes, children of ad-hoc sub-processes.

### ERR-025: `label-required`
Every task, event, gateway that splits, and conditional/default flow leaving a split needs a `name`.

### ERR-026: `no-gateway-join-fork`
A gateway both merges and splits. Use two gateways.

### ERR-027: `event-based-gateway`
Targets must be intermediate catch events (message, timer, signal, conditional) or receive tasks, with
no conditions on the flows; at least two targets.

### ERR-028: `link-event`
Every link throw needs a catch with the same `linkEventDefinition@name` in the same scope, and names
must be unique per scope.

### ERR-029: `event-sub-process-typed-start-event` / `sub-process-blank-start-event`
An event sub-process start must have an event definition; an embedded sub-process start must not.

### ERR-030: `superfluous-gateway`, `superfluous-termination`, `no-overlapping-elements` (warnings)
A gateway with one incoming and one outgoing flow; a terminate end event where a normal end suffices;
overlapping DI shapes. Remove the gateway / use a blank end / re-run the layout.

### ERR-031: `no-bpmndi`
Only checked when the file has a `BPMNDiagram` (or `--require-di`): every element needs a shape/edge.
**Fix:** regenerate the diagram with `node scripts/layout.mjs <file>`.

### ERR-032: timer value invalid
Timers must hold exactly one of `timeDate`, `timeDuration`, `timeCycle` with a valid value:
duration `PT1H`, `P1D`, `P2DT3H`; date with zone `2026-12-31T09:00:00Z`; cycle `R3/PT1H`,
`R/2026-01-01T08:00:00Z/P1D`. Whether cron or expressions are accepted is profile-specific.

---

## 4. Profile errors (`lint:local/*`, `lint:camunda-compat/*`)

### ERR-040: `local/engine-support` — `<X> is not supported by the <engine> engine`
The element (or event-type/definition combination) is not executable on the selected engine.
**Fix:** use the alternative listed in the profile's support matrix, or ask the user whether a
documentation-only model is acceptable.

### WARN-040: `local/engine-support-caution` — parse-only or not documented
The engine accepts the element but does not execute it (*parse-only*), or its documentation does not
cover it (*unverified*). Tell the user explicitly; do not ship it silently.

### ERR-041: `local/expression-syntax`
A condition is not written in the profile's expression language
(`{{...}}` Stateway · `=FEEL` Camunda 8 · `${...}` Flowable).

### ERR-042: engine configuration (`local/stateway-config`, `local/flowable-config`, `camunda-compat/*`)
Missing implementation details (task definition, URL header, decision reference, job type, called
element, correlation key …). See the profile's extension table.

---

## 5. ID naming conventions

| Category | Convention | Example |
|---|---|---|
| Process | kebab-case, starts with a letter | `order-approval` |
| Definitions | `Definitions_{process-key}` | `Definitions_order-approval` |
| Start / end events | `start`, `start_{trigger}`, `end_{outcome}` | `start_on_payment`, `end_rejected` |
| Intermediate events | `catch_{what}`, `throw_{what}` | `catch_payment`, `throw_in_review` |
| Boundary events | `{type}_boundary_{activity}` | `timeout_boundary_review_request` |
| Tasks / activities | `verb_noun`, snake_case | `review_request`, `send_welcome` |
| Gateways | `gw_{purpose}`; merges `gw_{purpose}_join` / `_merge` | `gw_decision`, `gw_notify_join` |
| Sequence flows | `flow_{source}_to_{target}` | `flow_review_request_to_gw_decision` |
| Sub-process internals | prefix with the sub-process id | `manual_review_start` |
| Event definitions | `{Kind}Def_{name}` | `TimerDef_kyc_deadline`, `MsgDef_payment` |
| Messages / signals / errors / escalations | `msg_`, `sig_`, `err_`, `esc_` + snake_case | `msg_payment_confirmed` |
| Data | `obj_{name}`, `ref_{name}`, `item_{name}` | `obj_audit_plan` |
| Artifacts | `note_{topic}`, `assoc_{source}_{target}`, `group_{name}` | `note_sla` |
