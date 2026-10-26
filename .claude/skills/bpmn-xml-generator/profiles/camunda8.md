# Profile: Camunda 8 (Zeebe)

## 1. Overview

Camunda 8 executes BPMN on the Zeebe engine. Sources:

- BPMN coverage — https://docs.camunda.io/docs/components/modeler/bpmn/bpmn-coverage/
- Expressions (FEEL) — https://docs.camunda.io/docs/components/concepts/expressions/
- Element reference — https://docs.camunda.io/docs/components/modeler/bpmn/bpmn/
- Machine-readable support matrix: [`bpmnlint-plugin-camunda-compat`](https://github.com/camunda/bpmnlint-plugin-camunda-compat)
  (the same rules the Camunda Modeler runs). `scripts/validate.mjs --profile camunda8` runs it for the
  target version.

**Always ask for the target Camunda version** (8.x). The validator defaults to **8.10**
(`--engine-version 8.8` to change). Older versions reject newer elements (e.g. `zeebe:userTask` < 8.5).

Camunda 7 (`camunda:` namespace, JUEL) is a different engine and is **not** this profile.

## 2. Definitions header

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="Definitions_{process-key}"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.10.0">
  <process id="{process-key}" name="{Process Name}" isExecutable="true">
    <!-- … -->
  </process>
</definitions>
```
`modeler:executionPlatform*` makes the Camunda Modeler open the file in Camunda 8 mode with the right
version checks. `process@id` is the BPMN process id used to start instances.

## 3. Expressions

| Position | Syntax | Example |
|---|---|---|
| Conditions, assignee, inputs, collections, script expressions | FEEL, prefixed with `=` | `=amount > 1000`, `=approvalLevel = "manager"` |
| Static values (job type, candidate groups list, `target` names) | plain text, no `=` | `type="payment-service"`, `target="amount"` |
| Timers | ISO 8601 literal **or** FEEL (`=duration("PT" + string(hours) + "H")`) | `PT48H`, `R3/PT1H`, cron `0 0 9 * * MON-FRI` (8.1+) |
| Correlation key | FEEL | `correlationKey="=orderId"` |

- FEEL equality is `=` (single), strings use double quotes — escape them in attributes as `&quot;`.
- Boolean operators: `and`, `or`, `not(…)`. Null-safe: `x != null`.
- `=` prefix is mandatory in conditions (`local/expression-syntax`); `camunda-compat/feel` checks FEEL syntax.

## 4. Support matrix

From `bpmnlint-plugin-camunda-compat` (`element-type` and version rules). "since" = first Camunda version.

| Construct | Status | Notes / alternative |
|---|---|---|
| start none, timer, message | supported | message start needs a `<message name>` (no correlation key) |
| start signal | supported (8.2+) | |
| start conditional | supported (8.9+) | |
| event sub-process start: timer, message, error, escalation (8.2), signal (8.3), compensation | supported | interrupting rules vary by version — the validator checks |
| end none, error | supported | |
| end message (8.2), escalation (8.2), signal (8.3), terminate (8.1), compensation (8.5) | supported | message end = job worker |
| intermediate catch timer, message | supported | |
| intermediate catch link (8.2), signal (8.3), conditional (8.9) | supported | |
| intermediate throw none (1.1), message (1.2), escalation/link (8.2), signal (8.3), compensation (8.5) | supported | |
| boundary timer, message, error | supported | |
| boundary escalation (8.2), signal (8.3), compensation (8.5), conditional (8.9) | supported | |
| cancel events, `transaction` | **unsupported** | Error boundary + compensation |
| task (8.2), userTask, serviceTask, sendTask, receiveTask, scriptTask, manualTask, businessRuleTask | supported | send/script = job worker or FEEL script |
| subProcess, event sub-process, callActivity | supported | |
| adHocSubProcess | supported (8.7+) | |
| multi-instance (parallel/sequential) | supported | collection via `zeebe:loopCharacteristics` (required) |
| standard loop | **unsupported** | Gateway back-edge or multi-instance |
| exclusive, parallel, event-based gateway | supported | |
| inclusive gateway | split 8.1+, join 8.6+ | |
| complexGateway | **unsupported** | Inclusive gateway / multi-instance with completion condition |
| compensation (`isForCompensation`) | supported (8.5+) | |
| dataObject, dataObjectReference, dataStoreReference | modeling only | Use variables + `ioMapping` |
| textAnnotation, association, group | supported | |
| collaboration, pools, lanes | out of scope for this skill | |

## 5. Extension mapping

### 5.1 userTask
```xml
<userTask id="review_expense" name="Review Expense">
  <extensionElements>
    <zeebe:userTask/>
    <zeebe:formDefinition formId="review-expense"/>
    <zeebe:assignmentDefinition assignee="=managerId" candidateGroups="finance-approvers"/>
    <zeebe:taskSchedule dueDate="=now() + duration(&quot;P2D&quot;)"/>
  </extensionElements>
  <incoming>flow_gw_level_to_review_expense</incoming>
  <outgoing>flow_review_expense_to_gw_approved</outgoing>
</userTask>
```
- `<zeebe:userTask/>` = Camunda user task (8.5+, recommended); without it the task is a job-worker user task (deprecated).
- Assignment: `assignee`, `candidateGroups`, `candidateUsers` (static comma list or FEEL).
- Forms: `formId` (linked Camunda form), or `externalReference` for a custom form.
- `zeebe:taskSchedule dueDate/followUpDate` (FEEL or ISO date-time); `zeebe:priorityDefinition priority`.

### 5.2 serviceTask / sendTask / scriptTask (job worker) and scriptTask (FEEL)
```xml
<serviceTask id="pay_expense" name="Pay Expense">
  <extensionElements>
    <zeebe:taskDefinition type="payment-service" retries="3"/>
    <zeebe:taskHeaders>
      <zeebe:header key="channel" value="sepa"/>
    </zeebe:taskHeaders>
    <zeebe:ioMapping>
      <zeebe:input source="=amount" target="amount"/>
      <zeebe:output source="=paymentId" target="paymentId"/>
    </zeebe:ioMapping>
  </extensionElements>
  <incoming>flow_gw_pay_merge_to_pay_expense</incoming>
  <outgoing>flow_pay_expense_to_end_paid</outgoing>
</serviceTask>
```
- `type` is the job type a worker (or a Connector) subscribes to; `retries` defaults to 3.
- Connectors (REST, Kafka …) are service tasks with the connector's job type plus input mappings;
  prefer a Connector template from the user when they name one.
- Script task without a worker: `<zeebe:script expression="=a + b" resultVariable="total"/>`.

### 5.3 businessRuleTask (DMN)
`<zeebe:calledDecision decisionId="expense-policy" resultVariable="approvalLevel"/>` — the DMN must be
deployed to the same cluster. `bindingType` (`latest`, `deployment`, `versionTag`) from 8.6.

### 5.4 callActivity
`<zeebe:calledElement processId="shipping" propagateAllChildVariables="false"/>` + `zeebe:ioMapping`
inputs/outputs. `propagateAllParentVariables` from 8.2.

### 5.5 Messages
```xml
<message id="msg_payment_confirmed" name="payment_confirmed">
  <extensionElements>
    <zeebe:subscription correlationKey="=orderId"/>
  </extensionElements>
</message>
```
Intermediate/boundary message catches need a `correlationKey`; message **start** events must not have one.

### 5.6 Multi-instance
```xml
<multiInstanceLoopCharacteristics isSequential="false">
  <extensionElements>
    <zeebe:loopCharacteristics inputCollection="=items" inputElement="item"
                               outputCollection="results" outputElement="=result"/>
  </extensionElements>
  <completionCondition xsi:type="tFormalExpression">=numberOfCompletedInstances &gt;= 3</completionCondition>
</multiInstanceLoopCharacteristics>
```
`loopCardinality` is not supported — always iterate over a collection.

### 5.7 Errors and retries
A job worker throws a BPMN error by `errorCode`; catch it with an error boundary whose `<error errorCode>`
matches. Technical failures decrement `retries` and raise an incident at 0.

## 6. Additional questions

- Target Camunda version (8.x) and SaaS vs Self-Managed.
- For each service/send/script task: job type (or Connector), retries, inputs/outputs.
- For each user task: assignee / candidate groups (static or FEEL), form id, due date.
- For each decision: decision id and result variable. For each call activity: process id and variable propagation.
- For each message catch: message name and correlation key.

## 7. Deployment

- Camunda Modeler (deploy button), `zbctl deploy resource file.bpmn` / `c8ctl`, or the REST API
  `POST /v2/deployments` (multipart `resources`).
- Run `scripts/layout.mjs` so the Modeler and Operate can display the diagram.

## 8. Profile-specific errors (`lint:camunda-compat/*`, `lint:local/expression-syntax`)

| Message | Fix |
|---|---|
| `Element of type <bpmn:X> only allowed by Camunda 8.y` | Upgrade the target version or use an alternative from §4 |
| `Element of type <bpmn:ServiceTask> must have one extension element of type <zeebe:TaskDefinition>` | Add the job type |
| `… must have property <correlationKey>` | Add `zeebe:subscription` to the message |
| `… <zeebe:LoopCharacteristics> must have property <inputCollection>` | Iterate over a collection |
| FEEL syntax errors (`camunda-compat/feel`) | Fix the expression; strings in double quotes |
| `<conditionExpression> … must be a FEEL expression prefixed with "="` | Add `=` |

## 9. Complete examples

### Example 1 — Expense approval (DMN, Camunda user task, job worker)

```xml profile=camunda8
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="Definitions_expense-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.10.0">

  <process id="expense-approval" name="Expense Approval" isExecutable="true">

    <startEvent id="start" name="Expense Submitted">
      <outgoing>flow_start_to_classify_expense</outgoing>
    </startEvent>

    <businessRuleTask id="classify_expense" name="Classify Expense">
      <extensionElements>
        <zeebe:calledDecision decisionId="expense-policy" resultVariable="approvalLevel"/>
      </extensionElements>
      <incoming>flow_start_to_classify_expense</incoming>
      <outgoing>flow_classify_expense_to_gw_level</outgoing>
    </businessRuleTask>

    <userTask id="review_expense" name="Review Expense">
      <extensionElements>
        <zeebe:userTask/>
        <zeebe:formDefinition formId="review-expense"/>
        <zeebe:assignmentDefinition assignee="=managerId" candidateGroups="finance-approvers"/>
        <zeebe:taskSchedule dueDate="=now() + duration(&quot;P2D&quot;)"/>
        <zeebe:ioMapping>
          <zeebe:output source="=approved" target="approved"/>
        </zeebe:ioMapping>
      </extensionElements>
      <incoming>flow_gw_level_to_review_expense</incoming>
      <outgoing>flow_review_expense_to_gw_approved</outgoing>
    </userTask>

    <serviceTask id="pay_expense" name="Pay Expense">
      <extensionElements>
        <zeebe:taskDefinition type="payment-service" retries="3"/>
        <zeebe:taskHeaders>
          <zeebe:header key="channel" value="sepa"/>
        </zeebe:taskHeaders>
        <zeebe:ioMapping>
          <zeebe:input source="=amount" target="amount"/>
          <zeebe:output source="=paymentId" target="paymentId"/>
        </zeebe:ioMapping>
      </extensionElements>
      <incoming>flow_gw_pay_merge_to_pay_expense</incoming>
      <outgoing>flow_pay_expense_to_end_paid</outgoing>
    </serviceTask>

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

    <endEvent id="end_paid" name="Expense Paid">
      <incoming>flow_pay_expense_to_end_paid</incoming>
    </endEvent>

    <endEvent id="end_rejected" name="Expense Rejected">
      <incoming>flow_gw_approved_to_end_rejected</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_classify_expense" sourceRef="start" targetRef="classify_expense"/>
    <sequenceFlow id="flow_classify_expense_to_gw_level" sourceRef="classify_expense" targetRef="gw_level"/>
    <sequenceFlow id="flow_gw_level_to_review_expense" name="Manager approval" sourceRef="gw_level" targetRef="review_expense">
      <conditionExpression xsi:type="tFormalExpression">=approvalLevel = "manager"</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_level_to_gw_pay_merge" name="Auto-approved" sourceRef="gw_level" targetRef="gw_pay_merge"/>
    <sequenceFlow id="flow_review_expense_to_gw_approved" sourceRef="review_expense" targetRef="gw_approved"/>
    <sequenceFlow id="flow_gw_approved_to_gw_pay_merge" name="Yes" sourceRef="gw_approved" targetRef="gw_pay_merge">
      <conditionExpression xsi:type="tFormalExpression">=approved = true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_approved_to_end_rejected" name="No" sourceRef="gw_approved" targetRef="end_rejected"/>
    <sequenceFlow id="flow_gw_pay_merge_to_pay_expense" sourceRef="gw_pay_merge" targetRef="pay_expense"/>
    <sequenceFlow id="flow_pay_expense_to_end_paid" sourceRef="pay_expense" targetRef="end_paid"/>

  </process>

</definitions>
```

### Example 2 — Order fulfillment (multi-instance, error boundary, event-based gateway, call activity, FEEL script)

```xml profile=camunda8
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="Definitions_order-fulfillment"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.10.0">

  <message id="msg_payment_confirmed" name="payment_confirmed">
    <extensionElements>
      <zeebe:subscription correlationKey="=orderId"/>
    </extensionElements>
  </message>

  <error id="err_out_of_stock" name="Out of Stock" errorCode="OUT_OF_STOCK"/>

  <process id="order-fulfillment" name="Order Fulfillment" isExecutable="true">

    <startEvent id="start" name="Order Placed">
      <outgoing>flow_start_to_reserve_items</outgoing>
    </startEvent>

    <serviceTask id="reserve_items" name="Reserve Item">
      <extensionElements>
        <zeebe:taskDefinition type="inventory-reserve" retries="3"/>
      </extensionElements>
      <incoming>flow_start_to_reserve_items</incoming>
      <outgoing>flow_reserve_items_to_gw_payment</outgoing>
      <multiInstanceLoopCharacteristics>
        <extensionElements>
          <zeebe:loopCharacteristics inputCollection="=items" inputElement="item"
                                     outputCollection="reservations" outputElement="=reservationId"/>
        </extensionElements>
      </multiInstanceLoopCharacteristics>
    </serviceTask>

    <boundaryEvent id="error_boundary_reserve_items" name="Out of Stock" attachedToRef="reserve_items">
      <outgoing>flow_error_boundary_reserve_items_to_notify_backorder</outgoing>
      <errorEventDefinition id="ErrDef_out_of_stock" errorRef="err_out_of_stock"/>
    </boundaryEvent>

    <eventBasedGateway id="gw_payment" name="Payment or Timeout?">
      <incoming>flow_reserve_items_to_gw_payment</incoming>
      <outgoing>flow_gw_payment_to_catch_payment</outgoing>
      <outgoing>flow_gw_payment_to_catch_timeout</outgoing>
    </eventBasedGateway>

    <intermediateCatchEvent id="catch_payment" name="Payment Confirmed">
      <incoming>flow_gw_payment_to_catch_payment</incoming>
      <outgoing>flow_catch_payment_to_ship_order</outgoing>
      <messageEventDefinition id="MsgDef_payment" messageRef="msg_payment_confirmed"/>
    </intermediateCatchEvent>

    <intermediateCatchEvent id="catch_timeout" name="24h Elapsed">
      <incoming>flow_gw_payment_to_catch_timeout</incoming>
      <outgoing>flow_catch_timeout_to_release_items</outgoing>
      <timerEventDefinition id="TimerDef_payment_timeout">
        <timeDuration xsi:type="tFormalExpression">PT24H</timeDuration>
      </timerEventDefinition>
    </intermediateCatchEvent>

    <callActivity id="ship_order" name="Ship Order">
      <extensionElements>
        <zeebe:calledElement processId="shipping" propagateAllChildVariables="false"/>
        <zeebe:ioMapping>
          <zeebe:input source="=orderId" target="orderId"/>
          <zeebe:output source="=trackingCode" target="trackingCode"/>
        </zeebe:ioMapping>
      </extensionElements>
      <incoming>flow_catch_payment_to_ship_order</incoming>
      <outgoing>flow_ship_order_to_end_shipped</outgoing>
    </callActivity>

    <serviceTask id="release_items" name="Release Items">
      <extensionElements>
        <zeebe:taskDefinition type="inventory-release"/>
      </extensionElements>
      <incoming>flow_catch_timeout_to_release_items</incoming>
      <outgoing>flow_release_items_to_end_cancelled</outgoing>
    </serviceTask>

    <scriptTask id="notify_backorder" name="Compose Backorder Notice">
      <extensionElements>
        <zeebe:script expression="=&quot;Order &quot; + orderId + &quot; is back-ordered&quot;" resultVariable="notice"/>
      </extensionElements>
      <incoming>flow_error_boundary_reserve_items_to_notify_backorder</incoming>
      <outgoing>flow_notify_backorder_to_end_backordered</outgoing>
    </scriptTask>

    <endEvent id="end_shipped" name="Order Shipped">
      <incoming>flow_ship_order_to_end_shipped</incoming>
    </endEvent>

    <endEvent id="end_cancelled" name="Order Cancelled">
      <incoming>flow_release_items_to_end_cancelled</incoming>
    </endEvent>

    <endEvent id="end_backordered" name="Order Back-ordered">
      <incoming>flow_notify_backorder_to_end_backordered</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_reserve_items" sourceRef="start" targetRef="reserve_items"/>
    <sequenceFlow id="flow_reserve_items_to_gw_payment" sourceRef="reserve_items" targetRef="gw_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_payment" sourceRef="gw_payment" targetRef="catch_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_timeout" sourceRef="gw_payment" targetRef="catch_timeout"/>
    <sequenceFlow id="flow_catch_payment_to_ship_order" sourceRef="catch_payment" targetRef="ship_order"/>
    <sequenceFlow id="flow_catch_timeout_to_release_items" sourceRef="catch_timeout" targetRef="release_items"/>
    <sequenceFlow id="flow_ship_order_to_end_shipped" sourceRef="ship_order" targetRef="end_shipped"/>
    <sequenceFlow id="flow_release_items_to_end_cancelled" sourceRef="release_items" targetRef="end_cancelled"/>
    <sequenceFlow id="flow_error_boundary_reserve_items_to_notify_backorder" sourceRef="error_boundary_reserve_items" targetRef="notify_backorder"/>
    <sequenceFlow id="flow_notify_backorder_to_end_backordered" sourceRef="notify_backorder" targetRef="end_backordered"/>

  </process>

</definitions>
```
