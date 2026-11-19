# Profile: Stateway

## 1. Overview

[Stateway](https://stateway.io) is a hosted BPMN/DMN engine ("Business Rule as a Service") operated
through a REST API. Sources checked (2026-11):

- Supported Elements & Fields — https://docs.stateway.io/docs/guides/supported-elements
- Processes (publishing) — https://docs.stateway.io/docs/guides/processes
- Variable Expressions — https://docs.stateway.io/docs/guides/variable-expressions
- Service Tasks — https://docs.stateway.io/docs/guides/service-tasks
- Human Tasks — https://docs.stateway.io/docs/guides/human-tasks
- BPMN assignment (Frontend Gateway) — https://docs.stateway.io/docs/frontend-gateway/bpmn-assignment
- Decision Models — https://docs.stateway.io/docs/guides/decision-models
- Events and Signals — https://docs.stateway.io/docs/guides/events-and-signals
- Timers — https://docs.stateway.io/docs/guides/timers
- Multi-Instance Activities — https://docs.stateway.io/docs/guides/multi-instance
- Inline Types — https://docs.stateway.io/docs/types-and-validation/inline-types
- Data Stores — https://docs.stateway.io/docs/types-and-validation/data-stores

`scripts/moddle/stateway.json` is the engine's own moddle descriptor; its `associations` block says
which `stateway:` element or attribute goes on which BPMN element, and `lint:local/stateway-config`
rejects anything placed elsewhere.

Stateway uses **its own namespace** (`stateway:`), not `camunda:`. Files written for older versions of
this skill with `camunda:assignee`, `camunda:decisionRef`, `camunda:formData` … must be migrated
(see §5.10).

## 2. Definitions header

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:stateway="https://stateway.io/schema/bpmn/1.0"
             id="Definitions_{process-key}"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">
  <process id="{process-key}" name="{Process Name}" isExecutable="true">
    <!-- … -->
  </process>
</definitions>
```

- `process@id` is the definition key used by `POST /v1/definitions` and `POST /v1/instances`.
- The Stateway docs write elements with a `bpmn:` prefix; a default namespace (as above) is equivalent XML.
- Extension element names are lower camelCase (`stateway:taskHeaders`, `stateway:ioMapping`).
  The Decision Models page also shows PascalCase (`stateway:TaskHeaders`); this skill always emits camelCase.

## 3. Expressions

| Position | Syntax | Example |
|---|---|---|
| Read position (`conditionExpression`, `assignee`, `candidateUsers`, `candidateGroups`, `ioMapping` input sources, header values) | `{{ … }}` | `{{variables.amount > 1000}}` |
| `conditionExpression` | braces optional; one whole expression | `variables.status == 'approved'` |
| Write position (`ioMapping` `target`, `variableFilter`) | **bare name**, never `variables.x` | `target="paymentId"` |
| Partial interpolation (`url`, `headers`, `authorization` headers) | text with `{{ }}` | `Bearer {{credentials.payments_token}}` |
| Timers | literal ISO 8601 only (see §5.6) | `PT48H`, `2026-12-31T09:00:00Z`, `R3/PT1H` |

- Roots: `variables`, `instance`, `now`, `session` (Frontend Gateway user advancing the instance; empty for
  REST calls, timers, signals, messages and service-task responses), plus field-specific roots
  (`result` on user-task outputs, the response/payload fields on service-task and catch-event outputs).
- `{{x}}` is shorthand for `{{variables.x}}`, except when `x` is a root name (`{{variables.session}}`).
- Fallback operator: `||` (`{{session.userId || variables.requesterId}}`). The full operator set is not
  documented: keep conditions to comparisons and `||`; avoid functions.
- Credentials: `{{credentials.name}}` with `name` matching `^[a-z][a-z0-9_]*$`, only in the `headers`
  and `authorization` headers — **never in `url`**.
- `ioMapping` targets are bare variable names matching `^[A-Za-z_$][A-Za-z0-9_$]*$` (no dots).
- XML escaping still applies: `>` may stay literal, write `<` as `&lt;` and `&&` as `&amp;&amp;`.

## 4. Support matrix

Source: *Supported Elements & Fields* (generated from the engine registry) and the engine's list of
types rejected at publish. Anything not listed there is **unsupported**. Kept in sync with
`STATEWAY_MATRIX` in `scripts/profiles.mjs`. Stateway has no "parse-only" constructs: what it does not
execute, it rejects at publish (`POST /v1/definitions` answers 400).

| Construct | Status | Notes / alternative |
|---|---|---|
| startEvent none, timer | supported | `ioMapping` on start: outputs only (they are the instance input contract) |
| startEvent message, signal, conditional | unsupported | Start instances with `POST /v1/instances`; wait for the message/signal with a catch event after the start |
| endEvent none, terminate, message, signal | supported | `stateway:variableFilter` limits the payload |
| endEvent error, escalation, compensation, cancel | unsupported | Error end events are rejected; signal the failure with a message/signal end event or let an activity fail into an error boundary |
| intermediateCatchEvent timer, message, signal | supported | Message name = event name; `ioMapping` outputs read the payload |
| intermediateCatchEvent conditional, link | unsupported | |
| intermediateThrowEvent none, message, signal | supported | |
| intermediateThrowEvent escalation, compensation, link | unsupported | |
| boundaryEvent timer, error, message, signal | supported | Non-interrupting `R<n>/…` timer cycles re-arm. No error boundary on a `sendTask` |
| boundaryEvent escalation, conditional, compensation, cancel | unsupported | |
| task, userTask, serviceTask, sendTask, businessRuleTask | supported | See §5 |
| scriptTask | unsupported | Call the logic as an HTTP service from a `serviceTask`, or evaluate it with a `businessRuleTask` (decision table) |
| receiveTask | unsupported | Wait for the message with an `intermediateCatchEvent` correlated by name (`stateway:eventCorrelation` or a `messageRef`) |
| manualTask | unsupported | Use `task` or `userTask` |
| subProcess (embedded), callActivity | supported | `calledElement` must be published in the tenant |
| event sub-process | unsupported | Use boundary events on an embedded sub-process |
| transaction, ad-hoc sub-process | unsupported | Model the work as an embedded `subProcess` (with explicit sequence flows) |
| multi-instance (`multiInstanceLoopCharacteristics`) | supported | On every activity except an embedded `subProcess`; see §5.8 |
| standard loop (`standardLoopCharacteristics`) | unsupported | Loop with an exclusive gateway back-edge |
| exclusiveGateway, inclusiveGateway, parallelGateway | supported | `default` supported; no conditions on flows leaving a parallelGateway |
| eventBasedGateway | unsupported | Attach interrupting boundary events (message, signal, timer) to a waiting activity, each leading to its own path (Example 2) |
| complexGateway | unsupported | |
| compensation (`isForCompensation`, compensate events) | unsupported | Model explicit undo steps |
| dataObject, dataObjectReference, dataStoreReference | supported | Typed data and data stores: §5.9 |
| textAnnotation, association, group | supported | Not executed (documentation) |
| collaboration, pools, lanes | out of scope | |

## 5. Extension mapping

All extension elements go inside `<extensionElements>`, which is the **first** child after `documentation`.

### 5.1 userTask — assignment and data
```xml
<userTask id="review_expense" name="Review Expense">
  <extensionElements>
    <stateway:assignmentDefinition assignee="{{variables.managerId}}"
                                   candidateGroups="finance-approvers"/>
    <stateway:ioMapping>
      <stateway:input source="{{variables.description}}" target="description"/>
      <stateway:input source="{{variables.amount}}" target="amount"/>
      <stateway:output source="{{result.approved}}" target="approved"/>
      <stateway:output source="{{session.userId}}" target="reviewedBy"/>
    </stateway:ioMapping>
  </extensionElements>
  <incoming>flow_classify_expense_to_review_expense</incoming>
  <outgoing>flow_review_expense_to_gw_approved</outgoing>
</userTask>
```
- `assignee` routes the task to one user (no claim); `candidateUsers` / `candidateGroups`
  (comma-separated) create pool tasks to claim. If `assignmentDefinition` is present it must set at least
  one attribute; omitting it lets the backend assign through the API.
- The task UI only sees a **snapshot of declared inputs** — `ioMapping` inputs (and formal
  `ioSpecification` data inputs). No inputs ⇒ the task exposes no variables (secure default).
- `ioMapping` outputs decide what is written back; `{{result.<field>}}` is the submitted value.
- Frontend Gateway visibility: `candidateUsers` requires `candidate_as_user: true` and
  `candidateGroups` requires the groups in the definition scope's `roles`.
- The form is a JSON Schema in the **content** of `<stateway:formSchema>` (inside `extensionElements`);
  wrap it in `CDATA`. It must be a valid JSON object or the publish is rejected.

### 5.2 serviceTask / sendTask — HTTP

`<stateway:taskDefinition type="http"/>` is optional and allowed **only on a serviceTask** (a sendTask
or businessRuleTask with it is rejected). `http` is its only type; it takes no other attribute.
```xml
<serviceTask id="pay_expense" name="Pay Expense">
  <extensionElements>
    <stateway:taskDefinition type="http"/>
    <stateway:taskHeaders>
      <stateway:taskHeader key="url" value="https://payments.example.com/payouts"/>
      <stateway:taskHeader key="method" value="POST"/>
      <stateway:taskHeader key="authorization" value="Bearer {{credentials.payments_token}}"/>
      <stateway:taskHeader key="executionMode" value="sync"/>
      <stateway:taskHeader key="timeout" value="15000"/>
    </stateway:taskHeaders>
    <stateway:ioMapping>
      <stateway:input source="{{variables.amount}}" target="amount"/>
      <stateway:output source="{{paymentId}}" target="paymentId"/>
    </stateway:ioMapping>
  </extensionElements>
  <incoming>flow_gw_pay_merge_to_pay_expense</incoming>
  <outgoing>flow_pay_expense_to_throw_paid</outgoing>
</serviceTask>
```
| Header | Required | Notes |
|---|---|---|
| `url` | ✅ | Supports `{{…}}` interpolation (no `credentials`) |
| `method` | — | `POST` (default), `GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `headers` | — | JSON string of extra headers; may use `{{credentials.x}}` |
| `authorization` | — | Shorthand for the Authorization header; may use `{{credentials.x}}` |
| `timeout` | — | Request timeout, ms or ISO 8601 duration (positive) |
| `executionMode` | — | serviceTask only: `sync` (default) completes with the response; `async` parks the token until the callback event |
| `callbackEvent` | async only | Event type that resumes the token. Rejected on a sync serviceTask |
| `callbackTimeout` | — | serviceTask, async only: how long to wait for the callback (ms or ISO 8601); expiry fails the task with `TimeoutError` |
| `callbackCorrelation` | — | serviceTask, async only: condition picking which waiting task receives a callback (`{{event.orderId == orderId}}`); declare it on a multi-instance async task |

Any other header key is rejected at publish. A `sendTask` is fire-and-forget: it completes on dispatch,
accepts no `executionMode`, `callbackTimeout` or `callbackCorrelation`, and cannot carry an error
boundary. Its `ioMapping` outputs (templates over the response) are written later, as a late write.

In async mode, `<stateway:accepted source="{{jobId}}" target="jobId"/>` inside `stateway:ioMapping`
maps the 2xx answer of the dispatch while the task waits; it is rejected on a sync serviceTask and on
a sendTask.

There is **no automatic retry**: a failed or timed-out call fails the activity. An error boundary on
the serviceTask catches it (its outputs can read `{{errorCode}}`, `{{errorMessage}}`); otherwise the
instance stops in error and the token can be run again with
`POST /v1/instances/{id}/tokens/{tokenId}/retry`. Do not add a `retries` header or attribute.

### 5.3 businessRuleTask — DMN decision
```xml
<businessRuleTask id="classify_expense" name="Classify Expense"
                  stateway:decisionRef="expense-policy" stateway:decisionVersion="2">
  <extensionElements>
    <stateway:ioMapping>
      <stateway:input source="{{variables.amount}}" target="amount"/>
      <stateway:input source="{{variables.category}}" target="category"/>
      <stateway:output source="{{approvalLevel}}" target="approvalLevel"/>
    </stateway:ioMapping>
  </extensionElements>
  <incoming>flow_start_to_classify_expense</incoming>
  <outgoing>flow_classify_expense_to_gw_level</outgoing>
</businessRuleTask>
```
- `stateway:decisionRef` = key of a decision already published in the tenant (alternative: a
  `decisionKey` task header; `decisionRef` wins). Omit `decisionVersion` to use the active version.
- `decisionVersion` is a positive integer. `decisionRef`/`decisionVersion` are rejected on any element
  other than a businessRuleTask.
- Allowed task headers: `decisionKey`, `decisionVersion`, `executionMode` (only `sync`), `timeout`.

### 5.4 callActivity
`<callActivity calledElement="kyc-check">` — the called definition must already be published for the
tenant. `<stateway:callConfig onChildFailure="continue"/>` (inside `extensionElements`; `propagate` is
the default) decides what a child failure does to the parent.

### 5.5 Messages, events and signals
- Native: `<message id="msg_payment_confirmed" name="payment_confirmed"/>` + `messageEventDefinition`.
  The event type to post is the message `name` (or its `id` without a name).
- Extension: `<stateway:eventCorrelation eventName="payment_confirmed"/>` on a catch or boundary event
  (no `<message>` needed; wins over `messageEventDefinition`). On an intermediate throw or end event it
  names the event thrown to the same instance. It is rejected on a start event.
- Events are matched **within the same instance** (`POST` the event to the instance); signals
  (`<signal>` + `signalEventDefinition`) are broadcast tenant-wide.
- Catch events read the payload with `ioMapping` outputs (`source="{{approved}}"`).
- Throw/end events choose the payload with `<stateway:variableFilter variables="a,b"/>`.

### 5.6 Timers
Native `timerEventDefinition` with `timeDate`, `timeDuration` or `timeCycle`, literal ISO 8601 only
(no cron, no expressions):
- durations use days, hours, minutes and whole seconds only (`PT30M`, `P1DT2H`) — no years, months,
  weeks or fractional seconds;
- dates: `2026-12-31`, `2026-12-31T09:00` or with seconds and a zone (`2026-12-31T09:00:00Z`);
- cycles: `R<n>/<duration>` or `R<n>/<start date>/<duration>`, `n` ≥ 1 or omitted (`R/PT10M`), with a
  non-zero interval. Boundary cycles: non-interrupting `R<n>/…` re-arms until the count runs out;
`R/…` repeats forever; interrupting boundaries never re-arm.

### 5.7 Gateways and conditions
A sequence flow leaving a `parallelGateway` cannot have a condition.
```xml
<sequenceFlow id="flow_gw_level_to_review_expense" name="Needs approval"
              sourceRef="gw_level" targetRef="review_expense">
  <conditionExpression xsi:type="tFormalExpression">{{variables.approvalLevel == 'manager'}}</conditionExpression>
</sequenceFlow>
```

### 5.8 Multi-instance
Native `<multiInstanceLoopCharacteristics>` inside an activity runs it once per item of a list, or N
times (approvals by several people with a quorum, one call per item, a batch). Constraints — the engine
rejects the definition otherwise:

- Allowed on `task`, `userTask`, `serviceTask`, `sendTask`, `businessRuleTask` and `callActivity`.
  **Never on an embedded `subProcess`**; use a `callActivity`. Never `<standardLoopCharacteristics>`,
  `behavior` or `complexBehaviorDefinition`.
- Declare `<loopCardinality>` (an expression resolving to an integer ≥ 0) **or** `<loopDataInputRef>`
  (one instance per item). With both, the list wins (publish warning `LOOP_CARDINALITY_IGNORED`).
- `<loopDataInputRef>` / `<loopDataOutputRef>` reference a `dataObjectReference` (or `dataObject`)
  **by id**; the variable is the data object's `name`, a valid identifier.
- `<inputDataItem name="…">` needs `loopDataInputRef`; `<loopDataOutputRef>` and
  `<outputDataItem name="…">` go together. Item names are valid identifiers, different from each other,
  and not `loopCounter`, `nrOfInstances`, `nrOfActiveInstances`, `nrOfCompletedInstances` or `countOf`.
  Do not put `itemSubjectRef` on the items: type the collection's data object instead.
- `isSequential="true"` runs one instance at a time; the default is parallel.
- `<completionCondition xsi:type="tFormalExpression">` ends early; count decisions with
  `countOf(<output list>, value)`, e.g. `{{ countOf(approvals, true) &gt;= 2 }}`.
- Inside an instance, `loopCounter`, `nrOfInstances` and the item (`{{variables.director}}`) are
  readable anywhere — `assignee`, task headers, input mapping. What an instance writes stays in the
  instance; only `outputDataItem` reaches the process, as the list in `loopDataOutputRef`.
- Publish warnings to avoid: an async multi-instance `serviceTask` without `callbackCorrelation`
  (`MI_CALLBACK_UNCORRELATED`); a multi-instance `sendTask` with outputs (`MI_LATE_OUTPUT_ISOLATED`) or
  an `outputDataItem` (`OUTPUT_ITEM_ALWAYS_NULL`); a `task` whose `outputDataItem` no output writes.

See Example 3.

### 5.9 Typed data and data stores
- **Types** are `<itemDefinition>` siblings of `<process>`: `structureRef="xsd:string|decimal|int|boolean|dateTime|date|time|base64Binary"`,
  or `structureRef="stateway:inline"` with a JSON Schema in
  `<extensionElements><stateway:schema kind="object|enum|primitive"><![CDATA[{…}]]></stateway:schema></extensionElements>`.
  A `dataObject` with `itemSubjectRef` makes its variable typed: writes to it are validated against
  the type (an invalid value fails the activity).
- **Data stores**: `<dataStore>` (sibling of `<process>`) with
  `<stateway:storeConfig backingType="processInstances" definitionKey="…" identityVariable="…"/>`, and a
  `<dataStoreReference dataStoreRef="…">` in the process with
  `<stateway:storeAccess keyExpression="{{ variables.x }}" cardinality="single|optional|list" …/>`.
  Ask the user for these details; see the Data Stores page for every attribute.

### 5.10 Migrating files that use `camunda:`
| Old (`camunda:`) | Stateway |
|---|---|
| `camunda:assignee`, `camunda:candidateGroups` | `<stateway:assignmentDefinition assignee=… candidateGroups=…/>` |
| `camunda:formData` / `formKey` | inputs/outputs via `stateway:ioMapping`; form as `<stateway:formSchema>` |
| `camunda:decisionRef` | `stateway:decisionRef` |
| `camunda:in/out variables="all"` | `stateway:ioMapping` inputs/outputs |
| `camunda:connector` / `implementation="webService"` | `<stateway:taskDefinition type="http"/>` + `taskHeaders` |
| `camunda:dueDate` | not documented for XML — ask the user |

## 6. Additional questions

Ask together with the core checklist:
- For each **service/send task**: URL, method, sync or async (and the callback event name), timeout,
  credential name for authorization, which response fields to store.
- For each **user task**: assignee expression and/or candidate users/groups; which variables the
  task UI may see (inputs); which fields it writes back (outputs).
- For each **business rule task**: published decision key (and version, if pinned); input/output fields.
- For each **message wait**: event name the client will post, and payload fields to keep.
- For each **repeated activity**: the list to iterate (or the count), parallel or sequential, what each
  instance contributes, and whether it may finish early (completion condition).

## 7. Deployment

```http
POST https://api.stateway.io/v1/definitions
X-API-Key: <key>
Content-Type: application/json

{ "key": "{process-key}", "name": "{Process Name}", "source_type": "bpmn", "source": "<definitions …>…</definitions>" }
```
`source_type` may also be `bpmn-base64`. New versions: `PUT /v1/definitions/:key`; rollback:
`POST /v1/definitions/:key/rollback`. Instances: `POST /v1/instances` with `definition_key`.
Stateway runs files without a diagram, but modelers need one — run `scripts/layout.mjs`
(see also https://docs.stateway.io/docs/bpmn/auto-layout).

## 8. Profile-specific errors (`lint:local/stateway-config`, `lint:local/engine-support*`)

| Message | Fix |
|---|---|
| `<stateway:x> is not allowed on a y (rejected at publish)` | Move or remove the extension (e.g. `taskDefinition` only on serviceTask) |
| `<stateway:inputOutput> is a legacy alias` | Use `<stateway:ioMapping>` |
| `serviceTask needs a "url" task header` | Add `<stateway:taskHeader key="url" …/>` |
| `task header "x" is not supported on a y` | Remove it; see the header table in §5.2 |
| `executionMode="async" requires a "callbackEvent" task header` | Add the callback event name |
| `task header "callbackEvent" applies only with executionMode="async"` | Remove it or make the task async |
| `businessRuleTask needs stateway:decisionRef` | Add the decision key |
| `ioMapping target "x.y" must be a bare variable name` | Write `target="y"` |
| `a startEvent ioMapping may only declare outputs` | Remove `stateway:input` (also on task, boundary and catch events) |
| `<timeDuration> … is not a valid Stateway timer` | Use the grammar of §5.6 |
| `Stateway has no automatic retry` | Remove `retries`; catch failures with an error boundary |
| `an error boundary on a sendTask is rejected` | Use a serviceTask to catch failures |
| `multi-instance …` | See §5.8 |
| `<X> is not supported by the Stateway engine` | Use the alternative from §4 |
| `<conditionExpression> … must be {{ … }}` | Rewrite `${…}`, `#{…}` or `=…` expressions |

## 9. Complete examples

### Example 1 — Expense approval (decision, assignment, HTTP, message throw, timeout)

```xml profile=stateway
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:stateway="https://stateway.io/schema/bpmn/1.0"
             id="Definitions_expense-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <message id="msg_expense_paid" name="expense_paid"/>

  <process id="expense-approval" name="Expense Approval" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Expense Submitted">
      <outgoing>flow_start_to_classify_expense</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <businessRuleTask id="classify_expense" name="Classify Expense"
                      stateway:decisionRef="expense-policy">
      <extensionElements>
        <stateway:ioMapping>
          <stateway:input source="{{variables.amount}}" target="amount"/>
          <stateway:input source="{{variables.category}}" target="category"/>
          <stateway:output source="{{approvalLevel}}" target="approvalLevel"/>
        </stateway:ioMapping>
      </extensionElements>
      <incoming>flow_start_to_classify_expense</incoming>
      <outgoing>flow_classify_expense_to_gw_level</outgoing>
    </businessRuleTask>

    <userTask id="review_expense" name="Review Expense">
      <extensionElements>
        <stateway:assignmentDefinition assignee="{{variables.managerId}}"
                                       candidateGroups="finance-approvers"/>
        <stateway:ioMapping>
          <stateway:input source="{{variables.description}}" target="description"/>
          <stateway:input source="{{variables.amount}}" target="amount"/>
          <stateway:output source="{{result.approved}}" target="approved"/>
          <stateway:output source="{{session.userId}}" target="reviewedBy"/>
        </stateway:ioMapping>
      </extensionElements>
      <incoming>flow_gw_level_to_review_expense</incoming>
      <outgoing>flow_review_expense_to_gw_approved</outgoing>
    </userTask>

    <boundaryEvent id="timeout_boundary_review_expense" name="72h Elapsed"
                   attachedToRef="review_expense" cancelActivity="true">
      <outgoing>flow_timeout_boundary_review_expense_to_end_expired</outgoing>
      <timerEventDefinition id="TimerDef_review_deadline">
        <timeDuration xsi:type="tFormalExpression">PT72H</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>

    <serviceTask id="pay_expense" name="Pay Expense">
      <extensionElements>
        <stateway:taskDefinition type="http"/>
        <stateway:taskHeaders>
          <stateway:taskHeader key="url" value="https://payments.example.com/payouts"/>
          <stateway:taskHeader key="method" value="POST"/>
          <stateway:taskHeader key="authorization" value="Bearer {{credentials.payments_token}}"/>
          <stateway:taskHeader key="executionMode" value="sync"/>
          <stateway:taskHeader key="timeout" value="15000"/>
        </stateway:taskHeaders>
        <stateway:ioMapping>
          <stateway:input source="{{variables.amount}}" target="amount"/>
          <stateway:input source="{{variables.requesterId}}" target="beneficiaryId"/>
          <stateway:output source="{{paymentId}}" target="paymentId"/>
        </stateway:ioMapping>
      </extensionElements>
      <incoming>flow_gw_pay_merge_to_pay_expense</incoming>
      <outgoing>flow_pay_expense_to_throw_paid</outgoing>
    </serviceTask>

    <intermediateThrowEvent id="throw_paid" name="Expense Paid">
      <extensionElements>
        <stateway:variableFilter variables="paymentId"/>
      </extensionElements>
      <incoming>flow_pay_expense_to_throw_paid</incoming>
      <outgoing>flow_throw_paid_to_end_paid</outgoing>
      <messageEventDefinition id="MsgDef_expense_paid" messageRef="msg_expense_paid"/>
    </intermediateThrowEvent>

    <!-- ═══ GATEWAYS ═══ -->
    <exclusiveGateway id="gw_level" name="Approval Needed?" default="flow_gw_level_to_gw_pay_merge">
      <incoming>flow_classify_expense_to_gw_level</incoming>
      <outgoing>flow_gw_level_to_review_expense</outgoing>
      <outgoing>flow_gw_level_to_gw_pay_merge</outgoing>
    </exclusiveGateway>

    <exclusiveGateway id="gw_approved" name="Approved?" default="flow_gw_approved_to_end_rejected">
      <incoming>flow_review_expense_to_gw_approved</incoming>
      <outgoing>flow_gw_approved_to_gw_pay_merge</outgoing>
      <outgoing>flow_gw_approved_to_end_rejected</outgoing>
    </exclusiveGateway>

    <exclusiveGateway id="gw_pay_merge" name="Pay">
      <incoming>flow_gw_level_to_gw_pay_merge</incoming>
      <incoming>flow_gw_approved_to_gw_pay_merge</incoming>
      <outgoing>flow_gw_pay_merge_to_pay_expense</outgoing>
    </exclusiveGateway>

    <!-- ═══ END ═══ -->
    <endEvent id="end_paid" name="Expense Paid">
      <incoming>flow_throw_paid_to_end_paid</incoming>
    </endEvent>

    <endEvent id="end_rejected" name="Expense Rejected">
      <incoming>flow_gw_approved_to_end_rejected</incoming>
    </endEvent>

    <endEvent id="end_expired" name="Review Expired">
      <incoming>flow_timeout_boundary_review_expense_to_end_expired</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_classify_expense" sourceRef="start" targetRef="classify_expense"/>
    <sequenceFlow id="flow_classify_expense_to_gw_level" sourceRef="classify_expense" targetRef="gw_level"/>
    <sequenceFlow id="flow_gw_level_to_review_expense" name="Manager approval" sourceRef="gw_level" targetRef="review_expense">
      <conditionExpression xsi:type="tFormalExpression">{{variables.approvalLevel == 'manager'}}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_level_to_gw_pay_merge" name="Auto-approved" sourceRef="gw_level" targetRef="gw_pay_merge"/>
    <sequenceFlow id="flow_review_expense_to_gw_approved" sourceRef="review_expense" targetRef="gw_approved"/>
    <sequenceFlow id="flow_gw_approved_to_gw_pay_merge" name="Yes" sourceRef="gw_approved" targetRef="gw_pay_merge">
      <conditionExpression xsi:type="tFormalExpression">{{variables.approved == true}}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_approved_to_end_rejected" name="No" sourceRef="gw_approved" targetRef="end_rejected"/>
    <sequenceFlow id="flow_gw_pay_merge_to_pay_expense" sourceRef="gw_pay_merge" targetRef="pay_expense"/>
    <sequenceFlow id="flow_pay_expense_to_throw_paid" sourceRef="pay_expense" targetRef="throw_paid"/>
    <sequenceFlow id="flow_throw_paid_to_end_paid" sourceRef="throw_paid" targetRef="end_paid"/>
    <sequenceFlow id="flow_timeout_boundary_review_expense_to_end_expired" sourceRef="timeout_boundary_review_expense" targetRef="end_expired"/>

  </process>

</definitions>
```

### Example 2 — Wait for a payment with a deadline (no eventBasedGateway)

Stateway rejects `eventBasedGateway`. The equivalent behavior: make the wait an activity — here an
embedded sub-process around the message catch — and attach an **interrupting timer boundary** to it;
each boundary leads to its own path. The HTTP reservation runs in `async` mode, resumes on the
`stock_reserved` callback event and gives up after `callbackTimeout`.

```xml profile=stateway
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:stateway="https://stateway.io/schema/bpmn/1.0"
             id="Definitions_order-fulfillment"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <message id="msg_payment_confirmed" name="payment_confirmed"/>

  <process id="order-fulfillment" name="Order Fulfillment" isExecutable="true">

    <startEvent id="start" name="Order Placed">
      <outgoing>flow_start_to_reserve_stock</outgoing>
    </startEvent>

    <serviceTask id="reserve_stock" name="Reserve Stock">
      <extensionElements>
        <stateway:taskDefinition type="http"/>
        <stateway:taskHeaders>
          <stateway:taskHeader key="url" value="https://inventory.example.com/orders/{{variables.orderId}}/reservations"/>
          <stateway:taskHeader key="method" value="POST"/>
          <stateway:taskHeader key="executionMode" value="async"/>
          <stateway:taskHeader key="callbackEvent" value="stock_reserved"/>
          <stateway:taskHeader key="callbackTimeout" value="PT10M"/>
        </stateway:taskHeaders>
        <stateway:ioMapping>
          <stateway:input source="{{variables.items}}" target="items"/>
          <stateway:output source="{{reservationId}}" target="reservationId"/>
        </stateway:ioMapping>
      </extensionElements>
      <incoming>flow_start_to_reserve_stock</incoming>
      <outgoing>flow_reserve_stock_to_await_payment</outgoing>
    </serviceTask>

    <subProcess id="await_payment" name="Await Payment">
      <incoming>flow_reserve_stock_to_await_payment</incoming>
      <outgoing>flow_await_payment_to_ship_order</outgoing>

      <startEvent id="await_payment_start" name="Waiting Started">
        <outgoing>flow_await_payment_start_to_catch_payment</outgoing>
      </startEvent>

      <intermediateCatchEvent id="catch_payment" name="Payment Confirmed">
        <extensionElements>
          <stateway:ioMapping>
            <stateway:output source="{{paymentId}}" target="paymentId"/>
          </stateway:ioMapping>
        </extensionElements>
        <incoming>flow_await_payment_start_to_catch_payment</incoming>
        <outgoing>flow_catch_payment_to_await_payment_end</outgoing>
        <messageEventDefinition id="MsgDef_payment_confirmed" messageRef="msg_payment_confirmed"/>
      </intermediateCatchEvent>

      <endEvent id="await_payment_end" name="Payment Received">
        <incoming>flow_catch_payment_to_await_payment_end</incoming>
      </endEvent>

      <sequenceFlow id="flow_await_payment_start_to_catch_payment" sourceRef="await_payment_start" targetRef="catch_payment"/>
      <sequenceFlow id="flow_catch_payment_to_await_payment_end" sourceRef="catch_payment" targetRef="await_payment_end"/>
    </subProcess>

    <boundaryEvent id="timeout_boundary_await_payment" name="24h Elapsed"
                   attachedToRef="await_payment" cancelActivity="true">
      <outgoing>flow_timeout_boundary_await_payment_to_cancel_order</outgoing>
      <timerEventDefinition id="TimerDef_payment_deadline">
        <timeDuration xsi:type="tFormalExpression">PT24H</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>

    <serviceTask id="ship_order" name="Ship Order">
      <extensionElements>
        <stateway:taskDefinition type="http"/>
        <stateway:taskHeaders>
          <stateway:taskHeader key="url" value="https://logistics.example.com/shipments"/>
          <stateway:taskHeader key="method" value="POST"/>
        </stateway:taskHeaders>
        <stateway:ioMapping>
          <stateway:input source="{{variables.orderId}}" target="orderId"/>
          <stateway:output source="{{trackingCode}}" target="trackingCode"/>
        </stateway:ioMapping>
      </extensionElements>
      <incoming>flow_await_payment_to_ship_order</incoming>
      <outgoing>flow_ship_order_to_end_shipped</outgoing>
    </serviceTask>

    <serviceTask id="cancel_order" name="Cancel Order">
      <extensionElements>
        <stateway:taskDefinition type="http"/>
        <stateway:taskHeaders>
          <stateway:taskHeader key="url" value="https://inventory.example.com/reservations/{{variables.reservationId}}"/>
          <stateway:taskHeader key="method" value="DELETE"/>
        </stateway:taskHeaders>
      </extensionElements>
      <incoming>flow_timeout_boundary_await_payment_to_cancel_order</incoming>
      <outgoing>flow_cancel_order_to_end_cancelled</outgoing>
    </serviceTask>

    <endEvent id="end_shipped" name="Order Shipped">
      <incoming>flow_ship_order_to_end_shipped</incoming>
    </endEvent>

    <endEvent id="end_cancelled" name="Order Cancelled">
      <incoming>flow_cancel_order_to_end_cancelled</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_reserve_stock" sourceRef="start" targetRef="reserve_stock"/>
    <sequenceFlow id="flow_reserve_stock_to_await_payment" sourceRef="reserve_stock" targetRef="await_payment"/>
    <sequenceFlow id="flow_await_payment_to_ship_order" sourceRef="await_payment" targetRef="ship_order"/>
    <sequenceFlow id="flow_timeout_boundary_await_payment_to_cancel_order" sourceRef="timeout_boundary_await_payment" targetRef="cancel_order"/>
    <sequenceFlow id="flow_ship_order_to_end_shipped" sourceRef="ship_order" targetRef="end_shipped"/>
    <sequenceFlow id="flow_cancel_order_to_end_cancelled" sourceRef="cancel_order" targetRef="end_cancelled"/>

  </process>

</definitions>
```

### Example 3 — Board approval by quorum (multi-instance userTask)

One approval task per director, in parallel. The activity completes when two directors approve or two
reject; the remaining task is cancelled. `approvals` receives each decision in the order of `directors`
(`null` for a cancelled instance); read it in a later step — `countOf` exists only inside the
`completionCondition`. Start the instance with `{"directors": ["ana", "bruno", "carla"]}`;
each director completes the task with `{"approval": true}` or `{"approval": false}`.

```xml profile=stateway
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:stateway="https://stateway.io/schema/bpmn/1.0"
             id="Definitions_board-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="board-approval" name="Board Approval" isExecutable="true">

    <!-- ═══ DATA ═══ the collections are data objects; the variable is the data object's name -->
    <dataObject id="DataObject_directors" name="directors"/>
    <dataObjectReference id="DataObjectReference_directors" name="Directors" dataObjectRef="DataObject_directors"/>
    <dataObject id="DataObject_approvals" name="approvals"/>
    <dataObjectReference id="DataObjectReference_approvals" name="Approvals" dataObjectRef="DataObject_approvals"/>

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Proposal Submitted">
      <outgoing>flow_start_to_approve_by_director</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <userTask id="approve_by_director" name="Director Approval">
      <extensionElements>
        <!-- the current item is a variable of the instance -->
        <stateway:assignmentDefinition assignee="{{variables.director}}"/>
      </extensionElements>
      <incoming>flow_start_to_approve_by_director</incoming>
      <outgoing>flow_approve_by_director_to_end</outgoing>
      <multiInstanceLoopCharacteristics isSequential="false">
        <loopDataInputRef>DataObjectReference_directors</loopDataInputRef>
        <loopDataOutputRef>DataObjectReference_approvals</loopDataOutputRef>
        <inputDataItem id="DataInput_director" name="director"/>
        <outputDataItem id="DataOutput_approval" name="approval"/>
        <completionCondition xsi:type="tFormalExpression">{{ countOf(approvals, true) &gt;= 2 || countOf(approvals, false) &gt;= 2 }}</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>

    <!-- ═══ END ═══ -->
    <endEvent id="end" name="Board Decided">
      <incoming>flow_approve_by_director_to_end</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_approve_by_director" sourceRef="start" targetRef="approve_by_director"/>
    <sequenceFlow id="flow_approve_by_director_to_end" sourceRef="approve_by_director" targetRef="end"/>

  </process>

</definitions>
```
