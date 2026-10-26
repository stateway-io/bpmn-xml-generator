# Profile: Stateway

## 1. Overview

[Stateway](https://stateway.io) is a hosted BPMN/DMN engine ("Business Rule as a Service") operated
through a REST API. Sources checked (2026-10):

- Supported Elements & Fields — https://docs.stateway.io/docs/guides/supported-elements
- Processes (publishing) — https://docs.stateway.io/docs/guides/processes
- Variable Expressions — https://docs.stateway.io/docs/guides/variable-expressions
- Service Tasks — https://docs.stateway.io/docs/guides/service-tasks
- Human Tasks — https://docs.stateway.io/docs/guides/human-tasks
- BPMN assignment (Frontend Gateway) — https://docs.stateway.io/docs/frontend-gateway/bpmn-assignment
- Decision Models — https://docs.stateway.io/docs/guides/decision-models
- Events and Signals — https://docs.stateway.io/docs/guides/events-and-signals
- Timers — https://docs.stateway.io/docs/guides/timers

Stateway uses **its own namespace** (`stateway:`), not `camunda:`. Files written for older versions of
this skill with `camunda:assignee`, `camunda:decisionRef`, `camunda:formData` … must be migrated
(see §5.9).

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
| Timers | literal ISO 8601 only | `PT48H`, `2026-12-31T09:00:00Z`, `R3/PT1H` |

- Roots: `variables`, `instance`, `now`, `session` (Frontend Gateway user advancing the instance; empty for
  REST calls, timers, signals, messages and service-task responses), plus field-specific roots
  (`result` on user-task outputs, the response/payload fields on service-task and catch-event outputs).
- `{{x}}` is shorthand for `{{variables.x}}`, except when `x` is a root name (`{{variables.session}}`).
- Fallback operator: `||` (`{{session.userId || variables.requesterId}}`). The full operator set is not
  documented: keep conditions to comparisons and `||`; avoid functions.
- Credentials: `{{credentials.name}}` with `name` matching `^[a-z][a-z0-9_]*$`.
- `sendTask` ioMapping **output** sources are literal field names (`{{…}}` is rejected at publish).
- XML escaping still applies: `>` may stay literal, write `<` as `&lt;` and `&&` as `&amp;&amp;`.

## 4. Support matrix

Source: *Supported Elements & Fields* (generated from the engine registry). Anything not listed there is
treated as **unsupported**. Kept in sync with `STATEWAY_MATRIX` in `scripts/profiles.mjs`.

| Construct | Status | Notes / alternative |
|---|---|---|
| startEvent none, timer | supported | `ioMapping` on start: outputs only (they filter the start variables) |
| startEvent message, signal | unverified | Prefer `POST /v1/instances` |
| endEvent none, terminate, message, signal | supported | `stateway:variableFilter` limits the payload |
| endEvent error, escalation, compensation, cancel | unsupported | Error boundaries exist, but error end events are not documented |
| intermediateCatchEvent timer, message, signal | supported | Message name = event name; `ioMapping` outputs read the payload |
| intermediateThrowEvent none, message, signal | supported | |
| boundaryEvent timer, error, message, signal | supported | Non-interrupting `R<n>/…` timer cycles re-arm |
| boundaryEvent escalation, conditional, compensation, cancel | unsupported | |
| task, userTask, serviceTask, sendTask, businessRuleTask | supported | See §5 |
| scriptTask, receiveTask | **parse-only** | Use a serviceTask (HTTP) / an intermediate message catch |
| manualTask | unsupported | Use `task` or `userTask` |
| subProcess (embedded), callActivity | supported | `calledElement` must be published in the tenant |
| event sub-process, transaction, ad-hoc sub-process | unsupported | Use boundary events on an embedded sub-process |
| multi-instance, standard loop | unsupported | Loop with an exclusive gateway back-edge, or call the API per item |
| exclusiveGateway, inclusiveGateway, parallelGateway | supported | `default` supported |
| eventBasedGateway | **parse-only** | Wrap the message catch in a sub-process with an interrupting timer boundary (Example 2) |
| complexGateway | unsupported | |
| compensation (`isForCompensation`, compensate events) | unsupported | Model explicit undo steps |
| link, conditional, escalation events | unsupported | |
| dataObject, dataObjectReference, dataStoreReference | supported | Data store access is configured via the API (`storeAccess`) |
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
- `formSchema` (JSON Schema) is documented for the JSON/YAML formats only; its BPMN XML form is not
  documented — configure it through the API and do not invent an XML element.

### 5.2 serviceTask / sendTask — HTTP
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
| `url` | ✅ | Supports `{{…}}` interpolation |
| `method` | — | `POST` (default), `GET`, `PUT`, `PATCH`, `DELETE` |
| `headers` | — | JSON string of extra headers |
| `authorization` | — | Shorthand for the Authorization header; use credentials |
| `executionMode` | — | `sync` (default) waits for the response; `async` parks the token until the callback event |
| `callbackEvent` | async only | Event type that resumes the token |
| `timeout` | — | ms or ISO 8601; default 30000 ms. Async: time to wait for the callback |

There is **no retry policy**: a failed or timed-out call puts the instance in `error`
(recover with the `instance.error` webhook / instance recovery). Do not add a `retries` header.

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
- Always synchronous: `executionMode="async"` errors the instance.

### 5.4 callActivity
`<callActivity calledElement="kyc-check">` — the called definition must already be published for the
tenant. `callConfig.onChildFailure` (`propagate` | `continue`) and typed I/O are documented for the
JSON format; their XML form is not documented.

### 5.5 Messages, events and signals
- Native: `<message id="msg_payment_confirmed" name="payment_confirmed"/>` + `messageEventDefinition`.
  The event type to post is the message `name` (or its `id` without a name).
- Extension: `<stateway:eventCorrelation eventName="payment_confirmed"/>` on a catch/boundary event
  (no `<message>` needed; wins over `messageEventDefinition`).
- Events are matched **within the same instance** (`POST` the event to the instance); signals
  (`<signal>` + `signalEventDefinition`) are broadcast tenant-wide.
- Catch events read the payload with `ioMapping` outputs (`source="{{approved}}"`).
- Throw/end events choose the payload with `<stateway:variableFilter variables="a,b"/>`.

### 5.6 Timers
Native `timerEventDefinition` with `timeDate`, `timeDuration` or `timeCycle`, literal ISO 8601 only
(no cron, no expressions). Boundary cycles: non-interrupting `R<n>/…` re-arms until the count runs out;
`R/…` repeats forever; interrupting boundaries never re-arm.

### 5.7 Gateways and conditions
```xml
<sequenceFlow id="flow_gw_level_to_review_expense" name="Needs approval"
              sourceRef="gw_level" targetRef="review_expense">
  <conditionExpression xsi:type="tFormalExpression">{{variables.approvalLevel == 'manager'}}</conditionExpression>
</sequenceFlow>
```

### 5.8 Not available in XML / not documented
Typed I/O (`activityContract`, `itemDefinition` JSON Schema via `stateway:schema`), `formSchema`,
`storeAccess`/`storeConfig` and `callConfig` are documented for the JSON/YAML formats. Do not emit them
in XML unless the user provides the exact syntax.

### 5.9 Migrating files that use `camunda:`
| Old (`camunda:`) | Stateway |
|---|---|
| `camunda:assignee`, `camunda:candidateGroups` | `<stateway:assignmentDefinition assignee=… candidateGroups=…/>` |
| `camunda:formData` / `formKey` | inputs/outputs via `stateway:ioMapping`; form schema via the API |
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
| `ServiceTask needs <stateway:taskDefinition type="http"/>` | Add the task definition and headers |
| `http task needs a "url" task header` | Add `<stateway:taskHeader key="url" …/>` |
| `executionMode="async" requires a "callbackEvent" task header` | Add the callback event name |
| `businessRuleTask needs stateway:decisionRef` | Add the decision key |
| `ioMapping target "variables.x" must be a bare name` | Write `target="x"` |
| `a startEvent ioMapping may only declare outputs` | Remove `stateway:input` from the start event |
| `<timeDuration> … must be a literal ISO 8601 value` | No `{{…}}`/cron in timers |
| `Stateway has no retry policy` | Remove the `retries` header |
| `<X> is accepted but NOT executed` (warning) | Use the alternative from §4 |
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

Stateway parses `eventBasedGateway` but does not execute it. The equivalent behavior: wrap the message
catch in an embedded sub-process and attach an **interrupting timer boundary** to the sub-process.
The HTTP reservation runs in `async` mode and resumes on the `stock_reserved` callback event.

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
          <stateway:taskHeader key="timeout" value="PT10M"/>
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
