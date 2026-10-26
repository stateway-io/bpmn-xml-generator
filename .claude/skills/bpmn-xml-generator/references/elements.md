# BPMN 2.0 Element Reference (core)

Engine-agnostic reference for the OMG BPMN 2.0 elements this skill generates.
Everything here is plain BPMN 2.0 (namespace `http://www.omg.org/spec/BPMN/20100524/MODEL`)
and validates against the OMG XSD shipped in `scripts/xsd/`.
**No engine extension (`stateway:`, `zeebe:`, `flowable:` …) appears in this file** — those live
in `profiles/<engine>.md`.

---

## Table of Contents
1. [Root elements](#1-root-elements)
2. [Child element order (XSD)](#2-child-element-order-xsd)
3. [Events](#3-events)
4. [Event definitions](#4-event-definitions)
5. [Activities](#5-activities)
6. [Gateways](#6-gateways)
7. [Sequence flows](#7-sequence-flows)
8. [Data](#8-data)
9. [Artifacts](#9-artifacts)
10. [Out of scope](#10-out-of-scope)

---

## 1. Root elements

### `<definitions>`
| Attribute | Required | Notes |
|---|---|---|
| `id` | recommended | `Definitions_{process-key}` |
| `targetNamespace` | ✅ (XSD) | Any URI. Not read by engines. Preserve the existing value when editing; `http://bpmn.io/schema/bpmn` for new files. |
| `expressionLanguage` | — | URI of the default expression language. Set by the profile (e.g. FEEL for Camunda 8). |
| `typeLanguage` | — | Defaults to XML Schema. |
| `exporter`, `exporterVersion` | — | `bpmn-xml-generator` / `2.0` |

Children, in this order: `import*`, `extension*`, root elements (any order among themselves), `bpmndi:BPMNDiagram*`.

**Root elements** (siblings of `<process>`, never inside it):

| Element | Referenced by |
|---|---|
| `<process>` | — |
| `<message id name>` | `messageEventDefinition@messageRef`, `receiveTask@messageRef`, `sendTask@messageRef` |
| `<signal id name>` | `signalEventDefinition@signalRef` |
| `<error id name errorCode>` | `errorEventDefinition@errorRef` |
| `<escalation id name escalationCode>` | `escalationEventDefinition@escalationRef` |
| `<itemDefinition id structureRef>` | `dataObject@itemSubjectRef`, `message@itemRef` … |
| `<dataStore id name>` | `dataStoreReference@dataStoreRef` |

### `<process>`
| Attribute | Required | Notes |
|---|---|---|
| `id` | ✅ | The process key. kebab-case, must start with a letter (XML NCName). |
| `name` | ✅ | Human-readable label. |
| `isExecutable` | ✅ (by convention) | `true` for anything an engine will run (all profiles). `false` only for documentation-only models. |
| `processType` | — | `None` (default), `Public`, `Private`. |

Children order: `documentation*`, `extensionElements?`, `property*`, flow elements and artifacts (any order).
Convention: nodes first, then all `<sequenceFlow>` at the bottom, then artifacts.

---

## 2. Child element order (XSD)

`bpmn-moddle` tolerates wrong child order, but the XSD (and engines that validate against it) do not.
Always emit children in this order:

| Element kind | Child order |
|---|---|
| **Any element** | `documentation*` → `extensionElements?` → … |
| **Activity** (`task`, `userTask`, `serviceTask`, `subProcess`, `callActivity` …) | `documentation` → `extensionElements` → `incoming*` → `outgoing*` → `ioSpecification?` → `property*` → `dataInputAssociation*` → `dataOutputAssociation*` → `resourceRole*` → `loopCharacteristics?` → *type-specific* (`script` for scriptTask; flow elements and artifacts for sub-processes; `completionCondition` for adHocSubProcess) |
| **Catch event** (`startEvent`, `intermediateCatchEvent`, `boundaryEvent`) | `documentation` → `extensionElements` → `incoming*` → `outgoing*` → `property*` → `dataOutput*` → `dataOutputAssociation*` → `outputSet?` → `eventDefinition*` |
| **Throw event** (`endEvent`, `intermediateThrowEvent`) | `documentation` → `extensionElements` → `incoming*` → `outgoing*` → `property*` → `dataInput*` → `dataInputAssociation*` → `inputSet?` → `eventDefinition*` |
| **Gateway** | `documentation` → `extensionElements` → `incoming*` → `outgoing*` (→ `activationCondition` for complexGateway) |
| **Sequence flow** | `documentation` → `extensionElements` → `conditionExpression?` |
| **`ioSpecification`** | `dataInput*` → `dataOutput*` → `inputSet+` → `outputSet+` (one of each set is **mandatory**) |
| **Data association** | `sourceRef*` → `targetRef` (**mandatory**) → `transformation?` → `assignment*` |
| **`multiInstanceLoopCharacteristics`** | `loopCardinality?` → `loopDataInputRef?` → `loopDataOutputRef?` → `inputDataItem?` → `outputDataItem?` → `completionCondition?` |

---

## 3. Events

Every event: `id` (required), `name` (required by convention — bpmnlint `label-required`).

### `<startEvent>`
| Attribute | Notes |
|---|---|
| `isInterrupting` | Only meaningful inside an event sub-process. Default `true`. |

| Trigger | Child | Notes |
|---|---|---|
| None | — | Instantiated by API / parent. At most one blank start per scope. |
| Timer | `timerEventDefinition` | Scheduled start. |
| Message | `messageEventDefinition messageRef` | Start on correlated message. |
| Signal | `signalEventDefinition signalRef` | Start on broadcast. |
| Conditional | `conditionalEventDefinition` | Start when a condition becomes true. |
| Error / Escalation / Compensation | — | **Only** inside an event sub-process. |

A process may have several start events (e.g. a blank start plus a message start); each starts an independent instance.

### `<endEvent>`
| Result | Child | Effect |
|---|---|---|
| None | — | Token is consumed; instance ends when no tokens remain. |
| Terminate | `terminateEventDefinition` | Ends the **whole scope** immediately (all parallel tokens). |
| Error | `errorEventDefinition errorRef` | Throws an error to the nearest matching error boundary/event sub-process. |
| Escalation | `escalationEventDefinition escalationRef` | Non-critical escalation to the parent scope. |
| Message | `messageEventDefinition messageRef` | Sends a message on completion. |
| Signal | `signalEventDefinition signalRef` | Broadcasts a signal. |
| Compensation | `compensateEventDefinition` | Triggers compensation. |
| Cancel | `cancelEventDefinition` | **Only** inside a `<transaction>`. |

### `<intermediateCatchEvent>`
Definitions: Timer, Message, Signal, Conditional, Link (target side).
Usually one `<incoming>` and one `<outgoing>`; a Link catch has **no** `<incoming>`.

### `<intermediateThrowEvent>`
Definitions: none (milestone), Message, Signal, Escalation, Compensation, Link (source side).
A Link throw has **no** `<outgoing>`.

### `<boundaryEvent>`
| Attribute | Required | Notes |
|---|---|---|
| `attachedToRef` | ✅ | Activity it is attached to (task, sub-process, call activity). |
| `cancelActivity` | — | `true` = interrupting (default), `false` = non-interrupting. |

Definitions: Timer, Message, Signal, Error, Escalation, Conditional, Compensation, Cancel (transaction only).
Error, Compensation and Cancel boundaries are always interrupting.
Has `<outgoing>`; **never** `<incoming>` (a compensation boundary has neither — it connects through an `<association>`).

---

## 4. Event definitions

```xml
<!-- Timer: exactly one of timeDate | timeDuration | timeCycle -->
<timerEventDefinition id="TimerDef_wait">
  <timeDuration xsi:type="tFormalExpression">PT24H</timeDuration>
</timerEventDefinition>
<timerEventDefinition id="TimerDef_deadline">
  <timeDate xsi:type="tFormalExpression">2026-12-31T09:00:00Z</timeDate>
</timerEventDefinition>
<timerEventDefinition id="TimerDef_daily">
  <timeCycle xsi:type="tFormalExpression">R/2026-01-01T09:00:00Z/P1D</timeCycle>
</timerEventDefinition>
```
ISO 8601: durations `PT15M`, `P1D`, `P2DT3H`; dates with zone `2026-12-31T09:00:00Z`; cycles `R3/PT1H`, `R/PT10M`, `R/<start>/<period>`.
Whether expressions or cron are accepted in timers is **profile-specific**.

```xml
<messageEventDefinition id="MsgDef_payment" messageRef="msg_payment_confirmed"/>
<signalEventDefinition id="SigDef_cancel" signalRef="sig_cancel_order"/>
<errorEventDefinition id="ErrDef_rejected" errorRef="err_payment_rejected"/>
<escalationEventDefinition id="EscDef_late" escalationRef="esc_late_delivery"/>
<terminateEventDefinition id="TermDef_end"/>
<cancelEventDefinition id="CancelDef_tx"/>
<compensateEventDefinition id="CompDef_all"/>                        <!-- all completed activities -->
<compensateEventDefinition id="CompDef_one" activityRef="book_hotel"/> <!-- one activity -->
<linkEventDefinition id="LinkDef_a" name="ToReview"/>                 <!-- throw & catch share the name -->
<conditionalEventDefinition id="CondDef_stock">
  <condition xsi:type="tFormalExpression">stock &gt; 0</condition>
</conditionalEventDefinition>
```

An `errorEventDefinition` **without** `errorRef` on a boundary/event-sub-process start catches every error.
Event-definition `id`s are optional in the XSD but recommended (bpmn-js and several engines rely on them).

---

## 5. Activities

Common attributes on all activities: `id`, `name`, `isForCompensation` (default `false`), `default` (default outgoing flow when the activity has conditional outgoing flows).

| Element | Semantics | Spec-level attributes |
|---|---|---|
| `<task>` | Abstract / undefined task. | — |
| `<userTask>` | Work performed by a person through a task UI. | `implementation` (`##unspecified`, `##WebService`, URI) |
| `<manualTask>` | Work done without any IT system (no engine interaction). | — |
| `<serviceTask>` | Automated call to a service. | `implementation`, `operationRef` |
| `<sendTask>` | Sends a message, then completes. | `messageRef`, `implementation` |
| `<receiveTask>` | Waits for a message. | `messageRef`, `instantiate` |
| `<scriptTask>` | Executes a script in the engine. | `scriptFormat` (MIME type or language name); child `<script>` |
| `<businessRuleTask>` | Evaluates business rules / a decision. | `implementation` |
| `<callActivity>` | Calls a separately deployed process. | `calledElement` (process key) |
| `<subProcess>` | Embedded sub-process with its own start/end. | `triggeredByEvent` (event sub-process) |
| `<transaction>` | Sub-process with transactional (cancel/compensate) semantics. | `method` |
| `<adHocSubProcess>` | Activities without sequence, chosen at run time. | `ordering` (`Parallel`/`Sequential`), `cancelRemainingInstances`; child `completionCondition` |

How an activity is actually *implemented* (HTTP call, job worker, Java class, assignee …) is never
expressed with core attributes — the profile adds it through `<extensionElements>` or namespaced attributes.

### Loop characteristics (last child of the activity)
```xml
<!-- parallel multi-instance over a fixed count -->
<multiInstanceLoopCharacteristics isSequential="false">
  <loopCardinality xsi:type="tFormalExpression">3</loopCardinality>
  <completionCondition xsi:type="tFormalExpression">approvals &gt;= 2</completionCondition>
</multiInstanceLoopCharacteristics>

<!-- standard (while) loop -->
<standardLoopCharacteristics testBefore="false" loopMaximum="5">
  <loopCondition xsi:type="tFormalExpression">retry == true</loopCondition>
</standardLoopCharacteristics>
```
Iterating over a collection variable is engine-specific (`zeebe:loopCharacteristics`, `flowable:collection` …).
The expression *bodies* above are placeholders: write them in the profile's expression language.

### Sub-process kinds
- **Embedded**: `<subProcess>` with one blank `<startEvent>`, its nodes, flows and end events inside.
- **Event sub-process**: `<subProcess triggeredByEvent="true">` with **no** `<incoming>`/`<outgoing>`, exactly one *typed* start event (timer, message, signal, error, escalation, conditional, compensation). `isInterrupting="false"` on the start makes it non-interrupting (not allowed for error/compensation).
- **Transaction**: `<transaction>`; cancel with an inner `cancelEventDefinition` end event, caught by a `cancelEventDefinition` boundary.
- **Ad-hoc**: `<adHocSubProcess>`; inner activities usually have no sequence flows.

### Compensation
1. Mark the undo activity `isForCompensation="true"` (no incoming/outgoing flows).
2. Attach a `boundaryEvent` with `compensateEventDefinition` to the activity to be undone.
3. Connect boundary → handler with an `<association associationDirection="One">` (not a sequence flow),
   placed in the **process-level** artifacts even when both elements are nested in a sub-process.
4. Trigger with an intermediate throw or end event carrying `compensateEventDefinition`.

---

## 6. Gateways

| Element | Split | Join | Attributes |
|---|---|---|---|
| `<exclusiveGateway>` | exactly one flow (first true condition) | passes each token through | `default` |
| `<inclusiveGateway>` | every flow whose condition is true (≥ 1) | waits for all *activated* incoming paths | `default` |
| `<parallelGateway>` | all flows, no conditions | waits for **all** incoming flows | — |
| `<eventBasedGateway>` | first event to occur wins | — (split only) | `instantiate`, `eventGatewayType` |
| `<complexGateway>` | custom `activationCondition` | custom | `default` |

Rules:
- Every outgoing flow of an exclusive/inclusive split has a `conditionExpression`, except the one named in the gateway's `default`.
- Never mix split and join in one gateway (bpmnlint `no-gateway-join-fork`); use two gateways.
- Use a gateway to merge flows; several incoming flows directly on a task/event is an implicit join that does **not** synchronize (bpmnlint `fake-join`).
- An `eventBasedGateway`'s targets are only `intermediateCatchEvent`s (message, timer, signal, conditional) or `receiveTask`s, each with one incoming flow.
- A parallel join waits forever if one branch can leave the scope (end event, interrupting boundary). Route such branches to a `terminateEventDefinition` end event, or redesign (see `validation-errors.md` → ERR-022).

---

## 7. Sequence flows

```xml
<sequenceFlow id="flow_gw_amount_to_manual_review" name="&gt; 1000"
              sourceRef="gw_amount" targetRef="manual_review">
  <conditionExpression xsi:type="tFormalExpression">amount &gt; 1000</conditionExpression>
</sequenceFlow>
```
- `id`, `sourceRef`, `targetRef` required; `name` required on conditional flows (bpmnlint `label-required`).
- Conditions are allowed on flows leaving exclusive/inclusive/complex gateways, and on flows leaving an
  activity (conditional flow; then the activity's `default` attribute may name the fallback flow).
  Never on flows leaving parallel or event-based gateways or events.
- The expression **language** is defined by the profile; the core only fixes the structure.
- Every `sourceRef`/`targetRef` must match the `<outgoing>`/`<incoming>` children of the nodes it connects.

---

## 8. Data

### Data objects and stores
```xml
<dataObject id="obj_order" name="Order" itemSubjectRef="item_order"/>
<dataObjectReference id="ref_order" name="Order" dataObjectRef="obj_order"/>
<dataStoreReference id="ref_crm" name="CRM" dataStoreRef="store_crm"/>
```
`<dataObject>`/`<dataObjectReference>`/`<dataStoreReference>` live inside the process (or sub-process);
`<itemDefinition>` and `<dataStore>` are root elements.

### Task-level I/O (formal)
```xml
<userTask id="review_request" name="Review Request">
  <incoming>flow_submit_request_to_review_request</incoming>
  <outgoing>flow_review_request_to_gw_decision</outgoing>
  <ioSpecification id="io_review_request">
    <dataInput id="review_request_in_order" name="order"/>
    <dataOutput id="review_request_out_decision" name="decision"/>
    <inputSet id="review_request_inputs">
      <dataInputRefs>review_request_in_order</dataInputRefs>
    </inputSet>
    <outputSet id="review_request_outputs">
      <dataOutputRefs>review_request_out_decision</dataOutputRefs>
    </outputSet>
  </ioSpecification>
  <dataInputAssociation id="dia_review_request_order">
    <sourceRef>ref_order</sourceRef>
    <targetRef>review_request_in_order</targetRef>
  </dataInputAssociation>
  <dataOutputAssociation id="doa_review_request_decision">
    <sourceRef>review_request_out_decision</sourceRef>
    <targetRef>ref_decision</targetRef>
  </dataOutputAssociation>
</userTask>
```
- `sourceRef`/`targetRef` are **ID references** to item-aware elements (`dataInput`, `dataOutput`,
  `dataObjectReference`, `property`) — never variable names.
- `inputSet` and `outputSet` are mandatory once `ioSpecification` is present (even if empty).
- Engines map process variables to tasks in very different ways (Stateway `ioMapping`, Zeebe `ioMapping`,
  Flowable variables). Use formal data associations only when the user wants data modeled in the diagram;
  otherwise use the profile's mapping mechanism.

### `<property>`
Process/activity-scoped data item: `<property id="prop_total" name="total" itemSubjectRef="item_number"/>`.

---

## 9. Artifacts

```xml
<textAnnotation id="note_sla">
  <text>SLA: 2 business days</text>
</textAnnotation>
<association id="assoc_note_sla" sourceRef="review_request" targetRef="note_sla" associationDirection="None"/>

<group id="group_finance" categoryValueRef="cv_finance"/>
<!-- the group's label comes from a root-level category -->
<category id="cat_departments">
  <categoryValue id="cv_finance" value="Finance"/>
</category>
```
- `<documentation>` (first child of any element) carries free text: `<documentation>Why this exists</documentation>`.
- Artifacts never affect execution.

---

## 10. Out of scope

Not generated by this skill (for now): `collaboration`, `participant` (pools), `laneSet`/`lane`,
`messageFlow`, choreographies, conversations, CMMN, `multiple`/`parallel multiple` event definitions.
If the user asks for pools or lanes, say they are out of scope and model the single executable process.
