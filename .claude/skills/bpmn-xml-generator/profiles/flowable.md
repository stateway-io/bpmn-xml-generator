# Profile: Flowable

## 1. Overview

Flowable (Open Source 6.x/7.x and Flowable Work/Orchestrate) executes BPMN 2.0 on the JVM. Sources:

- BPMN constructs — https://www.flowable.com/open-source/docs/bpmn/ch07b-BPMN-Constructs
- Flowable namespace `http://flowable.org/bpmn` (the legacy `activiti:` prefix is also accepted by the engine,
  but this skill always emits `flowable:`).

Status `unverified` below means the construct is not described on the BPMN constructs page; confirm
it against the user's Flowable version before relying on it.

## 2. Definitions header

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:flowable="http://flowable.org/bpmn"
             id="Definitions_{process-key}"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">
  <process id="{process-key}" name="{Process Name}" isExecutable="true">
    <!-- … -->
  </process>
</definitions>
```
`process@id` is the process definition key (`runtimeService.startProcessInstanceByKey`).

## 3. Expressions

| Position | Syntax | Example |
|---|---|---|
| Conditions, assignee, due date, collection, field `expression` | JUEL/UEL `${…}` (value) or `#{…}` (method) | `${amount > 1000}`, `${approvalLevel == 'manager'}` |
| Static values (`candidateGroups`, `formKey`, `stringValue`) | plain text | `candidateGroups="finance,approvers"` |
| Timers | ISO 8601, expressions (`${duration}`) or **cron** in `timeCycle` (6 fields, seconds first) | `PT48H`, `0 0 9 ? * MON-FRI` |

- Operators: `==`, `!=`, `<`, `>`, `&&` / `and`, `||` / `or`, `!` / `not`, `empty`.
  Escape `&&` as `&amp;&amp;` and `<` as `&lt;` in XML.
- Beans (`${myBean.method()}`) require Spring/CDI configuration on the engine side — ask before using them.

## 4. Support matrix

Kept in sync with `FLOWABLE_MATRIX` in `scripts/profiles.mjs`.

| Construct | Status | Notes / alternative |
|---|---|---|
| start none, timer, message, signal | supported | `flowable:formKey`, `flowable:initiator` on the none start |
| start conditional | unverified | |
| event sub-process start timer, message, signal, error | supported | escalation, conditional: unverified |
| end none, terminate, error, cancel | supported | `flowable:terminateAll` on terminate |
| end message, signal, escalation | unverified | Prefer a sendTask / intermediate signal throw |
| intermediate catch timer, message, signal | supported | conditional, link: unverified |
| intermediate throw none, signal, compensation | supported | message, escalation, link: unverified |
| boundary timer, error, message, signal, cancel, compensation | supported | escalation, conditional: unverified |
| task, userTask, manualTask, receiveTask, scriptTask | supported | scriptFormat `groovy`, `javascript` (JSR-223 engine required) |
| serviceTask (class, delegateExpression, expression, http, dmn, mail, external-worker, camel, shell) | supported | See §5.2 |
| sendTask | supported | Needs an implementation (e.g. `flowable:type="mail"` or a class) |
| businessRuleTask | supported | **Drools rules**, not DMN — for DMN use `serviceTask flowable:type="dmn"` |
| subProcess, event sub-process, transaction, callActivity | supported | |
| adHocSubProcess | unverified | |
| multi-instance | supported | `flowable:collection` / `flowable:elementVariable` |
| standard loop | **unsupported** | Multi-instance or gateway back-edge |
| exclusive, inclusive, parallel, event-based gateway | supported | |
| complexGateway | **unsupported** | |
| compensation (`isForCompensation`, compensate events) | supported | |
| dataObject, dataObjectReference | supported | dataObjects become process variables |
| dataStoreReference | unverified | |
| textAnnotation, association, group | supported | |
| collaboration, pools, lanes | out of scope for this skill | |

## 5. Extension mapping

### 5.1 userTask
```xml
<userTask id="review_expense" name="Review Expense"
          flowable:assignee="${managerId}"
          flowable:candidateGroups="finance-approvers"
          flowable:formKey="review-expense"
          flowable:dueDate="P2D">
  <incoming>flow_gw_level_to_review_expense</incoming>
  <outgoing>flow_review_expense_to_gw_approved</outgoing>
</userTask>
```
`flowable:candidateUsers`, `flowable:priority`, `flowable:category`, task listeners
(`<flowable:taskListener event="create" delegateExpression="${…}"/>`) are also available.

### 5.2 serviceTask
| Kind | XML |
|---|---|
| Java delegate | `flowable:class="com.acme.PayDelegate"` |
| Spring bean | `flowable:delegateExpression="${payDelegate}"` |
| Method expression | `flowable:expression="#{payments.pay(execution, amount)}"` + `flowable:resultVariable="paymentId"` |
| HTTP | `flowable:type="http"` + fields `requestMethod`, `requestUrl` (required), `requestHeaders`, `requestBody`, `requestTimeout`, `saveResponseParameters`, `resultVariablePrefix`, `failStatusCodes`, `handleStatusCodes`, `ignoreException` |
| DMN | `flowable:type="dmn"` + field `decisionTableReferenceKey` (or `decisionServiceReferenceKey`); optional `decisionTaskThrowErrorOnNoHits`, `fallbackToDefaultTenant` |
| External worker | `flowable:type="external-worker" flowable:topic="inventory-release"` |
| Mail | `flowable:type="mail"` + fields `to`, `subject`, `text`/`html` |

Exactly one implementation per task. Fields:
`<flowable:field name="requestUrl" stringValue="https://…"/>` or `<flowable:field name="requestBody" expression="${…}"/>`.

### 5.3 callActivity
```xml
<callActivity id="ship_order" name="Ship Order" calledElement="shipping" flowable:inheritBusinessKey="true">
  <extensionElements>
    <flowable:in source="orderId" target="orderId"/>
    <flowable:out source="trackingCode" target="trackingCode"/>
  </extensionElements>
  <incoming>flow_catch_payment_to_ship_order</incoming>
  <outgoing>flow_ship_order_to_end_shipped</outgoing>
</callActivity>
```
`flowable:inheritVariables="true"` passes all variables in; `sourceExpression` maps computed values.

### 5.4 Multi-instance
```xml
<multiInstanceLoopCharacteristics isSequential="false"
                                  flowable:collection="warehouses"
                                  flowable:elementVariable="warehouse">
  <completionCondition xsi:type="tFormalExpression">${nrOfCompletedInstances &gt;= 2}</completionCondition>
</multiInstanceLoopCharacteristics>
```
Built-in variables: `nrOfInstances`, `nrOfActiveInstances`, `nrOfCompletedInstances`, `loopCounter`.
`loopCardinality` with an expression also works.

### 5.5 Messages, signals, errors
- Messages: native `<message name>`; correlation is done by the API (`messageEventReceived(name, executionId)`).
- Signals: native; `flowable:scope="processInstance"` on `<signal>` limits the broadcast.
- Errors: a `BpmnError` thrown by a delegate (or an error end event) is caught by an error boundary with
  matching `errorCode`.

### 5.6 Async and listeners
`flowable:async="true"` (and `flowable:exclusive`) on activities creates a transaction boundary/job;
`<flowable:executionListener event="start|end|take" class|expression|delegateExpression="…"/>`.

## 6. Additional questions

- Flowable edition/version (Open Source 6.x/7.x, Work/Orchestrate) and how delegates are provided (Spring beans, classes, external workers).
- For each service task: implementation kind (§5.2) and its parameters.
- For each user task: assignee/candidates expression, form key, due date.
- For each decision: decision table (or service) key.
- For each call activity: called process key and variables in/out.

## 7. Deployment

`repositoryService.createDeployment().addClasspathResource("process.bpmn20.xml").deploy()`, the REST API
`POST /flowable-rest/service/repository/deployments` (multipart), or Flowable Design/Modeler import.
Use the `.bpmn20.xml` (or `.bpmn`) extension. Run `scripts/layout.mjs` to add a diagram.

## 8. Profile-specific errors (`lint:local/flowable-config`, `lint:local/engine-support*`, `lint:local/expression-syntax`)

| Message | Fix |
|---|---|
| `ServiceTask needs exactly one of flowable:class, … flowable:type` | Choose one implementation |
| `flowable:type="http" requires <flowable:field name="requestUrl">` | Add the missing field |
| `flowable:type="dmn" requires a decisionTableReferenceKey …` | Add the decision key field |
| `flowable:type="external-worker" requires flowable:topic` | Add the topic |
| `<conditionExpression> … must be a JUEL/UEL expression ${...}` | Rewrite `{{…}}` / `=…` conditions |
| `<StandardLoopCharacteristics> is not supported` | Use multi-instance |

## 9. Complete examples

### Example 1 — Expense approval (DMN, user task, HTTP task, timer boundary)

```xml profile=flowable
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:flowable="http://flowable.org/bpmn"
             id="Definitions_expense-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="expense-approval" name="Expense Approval" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Expense Submitted" flowable:initiator="requesterId">
      <outgoing>flow_start_to_classify_expense</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <serviceTask id="classify_expense" name="Classify Expense" flowable:type="dmn">
      <extensionElements>
        <flowable:field name="decisionTableReferenceKey" stringValue="expense-policy"/>
      </extensionElements>
      <incoming>flow_start_to_classify_expense</incoming>
      <outgoing>flow_classify_expense_to_gw_level</outgoing>
    </serviceTask>

    <userTask id="review_expense" name="Review Expense"
              flowable:assignee="${managerId}"
              flowable:candidateGroups="finance-approvers"
              flowable:formKey="review-expense"
              flowable:dueDate="P2D">
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

    <serviceTask id="pay_expense" name="Pay Expense" flowable:type="http">
      <extensionElements>
        <flowable:field name="requestMethod" stringValue="POST"/>
        <flowable:field name="requestUrl" stringValue="https://payments.example.com/payouts"/>
        <flowable:field name="requestHeaders" stringValue="Content-Type: application/json"/>
        <flowable:field name="requestBody" expression="{&quot;amount&quot;: ${amount}, &quot;beneficiary&quot;: &quot;${requesterId}&quot;}"/>
        <flowable:field name="saveResponseParameters" stringValue="true"/>
        <flowable:field name="resultVariablePrefix" stringValue="payment"/>
      </extensionElements>
      <incoming>flow_gw_pay_merge_to_pay_expense</incoming>
      <outgoing>flow_pay_expense_to_end_paid</outgoing>
    </serviceTask>

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
      <incoming>flow_pay_expense_to_end_paid</incoming>
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
      <conditionExpression xsi:type="tFormalExpression">${approvalLevel == 'manager'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_level_to_gw_pay_merge" name="Auto-approved" sourceRef="gw_level" targetRef="gw_pay_merge"/>
    <sequenceFlow id="flow_review_expense_to_gw_approved" sourceRef="review_expense" targetRef="gw_approved"/>
    <sequenceFlow id="flow_gw_approved_to_gw_pay_merge" name="Yes" sourceRef="gw_approved" targetRef="gw_pay_merge">
      <conditionExpression xsi:type="tFormalExpression">${approved}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_approved_to_end_rejected" name="No" sourceRef="gw_approved" targetRef="end_rejected"/>
    <sequenceFlow id="flow_gw_pay_merge_to_pay_expense" sourceRef="gw_pay_merge" targetRef="pay_expense"/>
    <sequenceFlow id="flow_pay_expense_to_end_paid" sourceRef="pay_expense" targetRef="end_paid"/>
    <sequenceFlow id="flow_timeout_boundary_review_expense_to_end_expired" sourceRef="timeout_boundary_review_expense" targetRef="end_expired"/>

  </process>

</definitions>
```

### Example 2 — Order fulfillment (multi-instance over a collection, event-based gateway, call activity, external worker)

```xml profile=flowable
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:flowable="http://flowable.org/bpmn"
             id="Definitions_order-fulfillment"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <message id="msg_payment_confirmed" name="payment_confirmed"/>

  <process id="order-fulfillment" name="Order Fulfillment" isExecutable="true">

    <startEvent id="start" name="Order Placed">
      <outgoing>flow_start_to_pick_items</outgoing>
    </startEvent>

    <!-- one picking task per warehouse, in parallel -->
    <userTask id="pick_items" name="Pick Items" flowable:assignee="${warehouse.supervisor}">
      <incoming>flow_start_to_pick_items</incoming>
      <outgoing>flow_pick_items_to_gw_payment</outgoing>
      <multiInstanceLoopCharacteristics isSequential="false"
                                        flowable:collection="warehouses"
                                        flowable:elementVariable="warehouse">
        <completionCondition xsi:type="tFormalExpression">${nrOfCompletedInstances == nrOfInstances}</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>

    <eventBasedGateway id="gw_payment" name="Payment or Timeout?">
      <incoming>flow_pick_items_to_gw_payment</incoming>
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

    <callActivity id="ship_order" name="Ship Order" calledElement="shipping" flowable:inheritBusinessKey="true">
      <extensionElements>
        <flowable:in source="orderId" target="orderId"/>
        <flowable:out source="trackingCode" target="trackingCode"/>
      </extensionElements>
      <incoming>flow_catch_payment_to_ship_order</incoming>
      <outgoing>flow_ship_order_to_end_shipped</outgoing>
    </callActivity>

    <serviceTask id="release_items" name="Release Items"
                 flowable:type="external-worker" flowable:topic="inventory-release">
      <incoming>flow_catch_timeout_to_release_items</incoming>
      <outgoing>flow_release_items_to_end_cancelled</outgoing>
    </serviceTask>

    <endEvent id="end_shipped" name="Order Shipped">
      <incoming>flow_ship_order_to_end_shipped</incoming>
    </endEvent>

    <endEvent id="end_cancelled" name="Order Cancelled">
      <incoming>flow_release_items_to_end_cancelled</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_pick_items" sourceRef="start" targetRef="pick_items"/>
    <sequenceFlow id="flow_pick_items_to_gw_payment" sourceRef="pick_items" targetRef="gw_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_payment" sourceRef="gw_payment" targetRef="catch_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_timeout" sourceRef="gw_payment" targetRef="catch_timeout"/>
    <sequenceFlow id="flow_catch_payment_to_ship_order" sourceRef="catch_payment" targetRef="ship_order"/>
    <sequenceFlow id="flow_catch_timeout_to_release_items" sourceRef="catch_timeout" targetRef="release_items"/>
    <sequenceFlow id="flow_ship_order_to_end_shipped" sourceRef="ship_order" targetRef="end_shipped"/>
    <sequenceFlow id="flow_release_items_to_end_cancelled" sourceRef="release_items" targetRef="end_cancelled"/>

  </process>

</definitions>
```
