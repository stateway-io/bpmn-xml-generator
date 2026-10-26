# Advanced BPMN 2.0 Patterns (core)

Engine-agnostic patterns beyond the basic flow. Each complete document is tagged `profile=core`
and validated by `tests/run-examples.mjs`. **Before using a pattern, check the selected profile's
support matrix** — several engines parse but do not execute some of these constructs.

Condition bodies are neutral placeholders; rewrite them in the profile's expression language.

| # | Pattern | Key elements |
|---|---|---|
| 1 | Multi-instance and loops | `multiInstanceLoopCharacteristics`, `standardLoopCharacteristics` |
| 2 | Errors, escalations, event sub-processes | error end/boundary, escalation, `subProcess triggeredByEvent` |
| 3 | Transaction, compensation, cancel | `transaction`, `compensateEventDefinition`, `isForCompensation`, `cancelEventDefinition` |
| 4 | Signals, conditions, links, inclusive split | `signalEventDefinition`, `conditionalEventDefinition`, `linkEventDefinition`, `inclusiveGateway` |
| 5 | Ad-hoc work, call activity, data and artifacts | `adHocSubProcess`, `callActivity`, `dataObjectReference`, `textAnnotation`, `group` |
| 6 | Complex gateway (snippet only) | `complexGateway` |

---

## 1. Multi-instance and loops

- **Parallel multi-instance** (`isSequential="false"`): N instances at once; `completionCondition` can end early.
- **Sequential multi-instance** (`isSequential="true"`): one instance after another.
- **Standard loop**: repeat while `loopCondition` holds (`testBefore` = while-do vs do-while; `loopMaximum` caps it).
- Looping over a *collection* is engine-specific (profile), the core only offers `loopCardinality`.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_board-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="board-approval" name="Board Approval" isExecutable="true">

    <startEvent id="start" name="Proposal Submitted">
      <outgoing>flow_start_to_collect_votes</outgoing>
    </startEvent>

    <!-- 5 board members vote in parallel; stop as soon as 3 approve -->
    <userTask id="collect_votes" name="Cast Vote">
      <incoming>flow_start_to_collect_votes</incoming>
      <outgoing>flow_collect_votes_to_sign_documents</outgoing>
      <multiInstanceLoopCharacteristics isSequential="false">
        <loopCardinality xsi:type="tFormalExpression">5</loopCardinality>
        <completionCondition xsi:type="tFormalExpression">approvals &gt;= 3</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>

    <!-- 2 signatures, one after the other -->
    <userTask id="sign_documents" name="Sign Documents">
      <incoming>flow_collect_votes_to_sign_documents</incoming>
      <outgoing>flow_sign_documents_to_publish_decision</outgoing>
      <multiInstanceLoopCharacteristics isSequential="true">
        <loopCardinality xsi:type="tFormalExpression">2</loopCardinality>
      </multiInstanceLoopCharacteristics>
    </userTask>

    <!-- retry publishing until it succeeds, at most 3 times -->
    <serviceTask id="publish_decision" name="Publish Decision">
      <incoming>flow_sign_documents_to_publish_decision</incoming>
      <outgoing>flow_publish_decision_to_end</outgoing>
      <standardLoopCharacteristics testBefore="false" loopMaximum="3">
        <loopCondition xsi:type="tFormalExpression">published = false</loopCondition>
      </standardLoopCharacteristics>
    </serviceTask>

    <endEvent id="end" name="Decision Published">
      <incoming>flow_publish_decision_to_end</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_collect_votes" sourceRef="start" targetRef="collect_votes"/>
    <sequenceFlow id="flow_collect_votes_to_sign_documents" sourceRef="collect_votes" targetRef="sign_documents"/>
    <sequenceFlow id="flow_sign_documents_to_publish_decision" sourceRef="sign_documents" targetRef="publish_decision"/>
    <sequenceFlow id="flow_publish_decision_to_end" sourceRef="publish_decision" targetRef="end"/>

  </process>

</definitions>
```

---

## 2. Errors, escalations and event sub-processes

- An **error end event** inside a sub-process is caught by an **error boundary** on that sub-process
  (match by `errorRef`; a boundary without `errorRef` catches any error). Error boundaries always interrupt.
- An **escalation** is non-critical: a non-interrupting escalation boundary (`cancelActivity="false"`) lets
  the sub-process continue while a parallel path reacts.
- An **event sub-process** (`triggeredByEvent="true"`, no incoming/outgoing) reacts to an event anywhere in
  its parent scope. Its start event is *typed*; `isInterrupting="false"` keeps the parent running.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_claim-handling"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <error id="err_fraud_suspected" name="Fraud Suspected" errorCode="FRAUD"/>
  <escalation id="esc_high_value" name="High Value Claim" escalationCode="HIGH_VALUE"/>
  <message id="msg_claim_withdrawn" name="claim_withdrawn"/>

  <process id="claim-handling" name="Claim Handling" isExecutable="true">

    <startEvent id="start" name="Claim Filed">
      <outgoing>flow_start_to_assess_claim</outgoing>
    </startEvent>

    <subProcess id="assess_claim" name="Assess Claim">
      <incoming>flow_start_to_assess_claim</incoming>
      <outgoing>flow_assess_claim_to_pay_claim</outgoing>

      <startEvent id="assess_claim_start" name="Assessment Started">
        <outgoing>flow_assess_claim_start_to_check_claim</outgoing>
      </startEvent>

      <userTask id="check_claim" name="Check Claim">
        <incoming>flow_assess_claim_start_to_check_claim</incoming>
        <outgoing>flow_check_claim_to_gw_check</outgoing>
      </userTask>

      <exclusiveGateway id="gw_check" name="Check Result?" default="flow_gw_check_to_assess_claim_end">
        <incoming>flow_check_claim_to_gw_check</incoming>
        <outgoing>flow_gw_check_to_throw_high_value</outgoing>
        <outgoing>flow_gw_check_to_end_fraud</outgoing>
        <outgoing>flow_gw_check_to_assess_claim_end</outgoing>
      </exclusiveGateway>

      <intermediateThrowEvent id="throw_high_value" name="High Value">
        <incoming>flow_gw_check_to_throw_high_value</incoming>
        <outgoing>flow_throw_high_value_to_assess_claim_end_high</outgoing>
        <escalationEventDefinition id="EscDef_throw_high_value" escalationRef="esc_high_value"/>
      </intermediateThrowEvent>

      <endEvent id="end_fraud" name="Fraud Suspected">
        <incoming>flow_gw_check_to_end_fraud</incoming>
        <errorEventDefinition id="ErrDef_end_fraud" errorRef="err_fraud_suspected"/>
      </endEvent>

      <endEvent id="assess_claim_end" name="Claim Assessed">
        <incoming>flow_gw_check_to_assess_claim_end</incoming>
      </endEvent>

      <endEvent id="assess_claim_end_high" name="High Value Assessed">
        <incoming>flow_throw_high_value_to_assess_claim_end_high</incoming>
      </endEvent>

      <sequenceFlow id="flow_assess_claim_start_to_check_claim" sourceRef="assess_claim_start" targetRef="check_claim"/>
      <sequenceFlow id="flow_check_claim_to_gw_check" sourceRef="check_claim" targetRef="gw_check"/>
      <sequenceFlow id="flow_gw_check_to_throw_high_value" name="Above limit" sourceRef="gw_check" targetRef="throw_high_value">
        <conditionExpression xsi:type="tFormalExpression">amount &gt; 10000</conditionExpression>
      </sequenceFlow>
      <sequenceFlow id="flow_gw_check_to_end_fraud" name="Fraud" sourceRef="gw_check" targetRef="end_fraud">
        <conditionExpression xsi:type="tFormalExpression">fraudScore &gt; 0.8</conditionExpression>
      </sequenceFlow>
      <sequenceFlow id="flow_gw_check_to_assess_claim_end" name="OK" sourceRef="gw_check" targetRef="assess_claim_end"/>
      <sequenceFlow id="flow_throw_high_value_to_assess_claim_end_high" sourceRef="throw_high_value" targetRef="assess_claim_end_high"/>
    </subProcess>

    <!-- interrupting: the error cancels the sub-process -->
    <boundaryEvent id="error_boundary_assess_claim" name="Fraud Suspected" attachedToRef="assess_claim">
      <outgoing>flow_error_boundary_assess_claim_to_investigate_fraud</outgoing>
      <errorEventDefinition id="ErrDef_boundary_fraud" errorRef="err_fraud_suspected"/>
    </boundaryEvent>

    <!-- non-interrupting: the assessment continues while a manager is informed -->
    <boundaryEvent id="escalation_boundary_assess_claim" name="High Value"
                   attachedToRef="assess_claim" cancelActivity="false">
      <outgoing>flow_escalation_boundary_assess_claim_to_inform_manager</outgoing>
      <escalationEventDefinition id="EscDef_boundary_high_value" escalationRef="esc_high_value"/>
    </boundaryEvent>

    <serviceTask id="pay_claim" name="Pay Claim">
      <incoming>flow_assess_claim_to_pay_claim</incoming>
      <outgoing>flow_pay_claim_to_end_paid</outgoing>
    </serviceTask>

    <userTask id="investigate_fraud" name="Investigate Fraud">
      <incoming>flow_error_boundary_assess_claim_to_investigate_fraud</incoming>
      <outgoing>flow_investigate_fraud_to_end_investigated</outgoing>
    </userTask>

    <userTask id="inform_manager" name="Inform Manager">
      <incoming>flow_escalation_boundary_assess_claim_to_inform_manager</incoming>
      <outgoing>flow_inform_manager_to_end_informed</outgoing>
    </userTask>

    <endEvent id="end_paid" name="Claim Paid">
      <incoming>flow_pay_claim_to_end_paid</incoming>
    </endEvent>

    <endEvent id="end_investigated" name="Fraud Investigated">
      <incoming>flow_investigate_fraud_to_end_investigated</incoming>
    </endEvent>

    <endEvent id="end_informed" name="Manager Informed">
      <incoming>flow_inform_manager_to_end_informed</incoming>
    </endEvent>

    <!-- event sub-process: a withdrawal message at any time cancels the whole claim -->
    <subProcess id="withdrawal_handler" name="Handle Withdrawal" triggeredByEvent="true">
      <startEvent id="withdrawal_start" name="Claim Withdrawn" isInterrupting="true">
        <outgoing>flow_withdrawal_start_to_close_claim</outgoing>
        <messageEventDefinition id="MsgDef_withdrawn" messageRef="msg_claim_withdrawn"/>
      </startEvent>

      <serviceTask id="close_claim" name="Close Claim">
        <incoming>flow_withdrawal_start_to_close_claim</incoming>
        <outgoing>flow_close_claim_to_withdrawal_end</outgoing>
      </serviceTask>

      <endEvent id="withdrawal_end" name="Claim Closed">
        <incoming>flow_close_claim_to_withdrawal_end</incoming>
      </endEvent>

      <sequenceFlow id="flow_withdrawal_start_to_close_claim" sourceRef="withdrawal_start" targetRef="close_claim"/>
      <sequenceFlow id="flow_close_claim_to_withdrawal_end" sourceRef="close_claim" targetRef="withdrawal_end"/>
    </subProcess>

    <sequenceFlow id="flow_start_to_assess_claim" sourceRef="start" targetRef="assess_claim"/>
    <sequenceFlow id="flow_assess_claim_to_pay_claim" sourceRef="assess_claim" targetRef="pay_claim"/>
    <sequenceFlow id="flow_pay_claim_to_end_paid" sourceRef="pay_claim" targetRef="end_paid"/>
    <sequenceFlow id="flow_error_boundary_assess_claim_to_investigate_fraud" sourceRef="error_boundary_assess_claim" targetRef="investigate_fraud"/>
    <sequenceFlow id="flow_investigate_fraud_to_end_investigated" sourceRef="investigate_fraud" targetRef="end_investigated"/>
    <sequenceFlow id="flow_escalation_boundary_assess_claim_to_inform_manager" sourceRef="escalation_boundary_assess_claim" targetRef="inform_manager"/>
    <sequenceFlow id="flow_inform_manager_to_end_informed" sourceRef="inform_manager" targetRef="end_informed"/>

  </process>

</definitions>
```

---

## 3. Transaction, compensation and cancel

- Activities inside a `<transaction>` that already completed are **compensated** when the transaction is cancelled.
- Each compensable activity gets a compensation boundary event linked by an `<association>` to a
  handler activity marked `isForCompensation="true"` (no sequence flows on the handler).
  Put the `<association>` in the **process-level** artifacts, even when the activities are nested.
- A **cancel end event** inside the transaction triggers compensation and leaves through the
  **cancel boundary** of the transaction.
- Outside transactions, trigger compensation explicitly with a throw/end event carrying
  `compensateEventDefinition` (optionally `activityRef` to compensate a single activity).

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_trip-booking"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="trip-booking" name="Trip Booking" isExecutable="true">

    <startEvent id="start" name="Trip Requested">
      <outgoing>flow_start_to_book_trip</outgoing>
    </startEvent>

    <transaction id="book_trip" name="Book Trip">
      <incoming>flow_start_to_book_trip</incoming>
      <outgoing>flow_book_trip_to_end_booked</outgoing>

      <startEvent id="book_trip_start" name="Booking Started">
        <outgoing>flow_book_trip_start_to_book_hotel</outgoing>
      </startEvent>

      <serviceTask id="book_hotel" name="Book Hotel">
        <incoming>flow_book_trip_start_to_book_hotel</incoming>
        <outgoing>flow_book_hotel_to_charge_card</outgoing>
      </serviceTask>

      <boundaryEvent id="compensation_boundary_book_hotel" name="Undo Hotel" attachedToRef="book_hotel">
        <compensateEventDefinition id="CompDef_book_hotel"/>
      </boundaryEvent>

      <serviceTask id="cancel_hotel" name="Cancel Hotel" isForCompensation="true"/>

      <serviceTask id="charge_card" name="Charge Card">
        <incoming>flow_book_hotel_to_charge_card</incoming>
        <outgoing>flow_charge_card_to_gw_payment</outgoing>
      </serviceTask>

      <exclusiveGateway id="gw_payment" name="Payment OK?" default="flow_gw_payment_to_end_cancel">
        <incoming>flow_charge_card_to_gw_payment</incoming>
        <outgoing>flow_gw_payment_to_book_trip_end</outgoing>
        <outgoing>flow_gw_payment_to_end_cancel</outgoing>
      </exclusiveGateway>

      <endEvent id="book_trip_end" name="Trip Booked">
        <incoming>flow_gw_payment_to_book_trip_end</incoming>
      </endEvent>

      <endEvent id="end_cancel" name="Payment Failed">
        <incoming>flow_gw_payment_to_end_cancel</incoming>
        <cancelEventDefinition id="CancelDef_payment"/>
      </endEvent>

      <sequenceFlow id="flow_book_trip_start_to_book_hotel" sourceRef="book_trip_start" targetRef="book_hotel"/>
      <sequenceFlow id="flow_book_hotel_to_charge_card" sourceRef="book_hotel" targetRef="charge_card"/>
      <sequenceFlow id="flow_charge_card_to_gw_payment" sourceRef="charge_card" targetRef="gw_payment"/>
      <sequenceFlow id="flow_gw_payment_to_book_trip_end" name="Yes" sourceRef="gw_payment" targetRef="book_trip_end">
        <conditionExpression xsi:type="tFormalExpression">paymentOk = true</conditionExpression>
      </sequenceFlow>
      <sequenceFlow id="flow_gw_payment_to_end_cancel" name="No" sourceRef="gw_payment" targetRef="end_cancel"/>
    </transaction>

    <boundaryEvent id="cancel_boundary_book_trip" name="Booking Cancelled" attachedToRef="book_trip">
      <outgoing>flow_cancel_boundary_book_trip_to_notify_customer</outgoing>
      <cancelEventDefinition id="CancelDef_boundary"/>
    </boundaryEvent>

    <sendTask id="notify_customer" name="Notify Customer">
      <incoming>flow_cancel_boundary_book_trip_to_notify_customer</incoming>
      <outgoing>flow_notify_customer_to_end_cancelled</outgoing>
    </sendTask>

    <endEvent id="end_booked" name="Trip Confirmed">
      <incoming>flow_book_trip_to_end_booked</incoming>
    </endEvent>

    <endEvent id="end_cancelled" name="Trip Cancelled">
      <incoming>flow_notify_customer_to_end_cancelled</incoming>
    </endEvent>

    <sequenceFlow id="flow_start_to_book_trip" sourceRef="start" targetRef="book_trip"/>
    <sequenceFlow id="flow_book_trip_to_end_booked" sourceRef="book_trip" targetRef="end_booked"/>
    <sequenceFlow id="flow_cancel_boundary_book_trip_to_notify_customer" sourceRef="cancel_boundary_book_trip" targetRef="notify_customer"/>
    <sequenceFlow id="flow_notify_customer_to_end_cancelled" sourceRef="notify_customer" targetRef="end_cancelled"/>

    <!-- compensation associations live in the process-level artifacts (bpmn-js / bpmnlint convention) -->
    <association id="assoc_compensation_book_hotel" associationDirection="One"
                 sourceRef="compensation_boundary_book_hotel" targetRef="cancel_hotel"/>

  </process>

</definitions>
```

---

## 4. Signals, conditions, links and inclusive split/join

- **Signal**: broadcast (one-to-many, no correlation) — throw with `intermediateThrowEvent`/`endEvent`,
  catch with start/intermediate/boundary events sharing the same `<signal>`.
- **Conditional catch**: waits until a condition over process data becomes true.
- **Link events**: an off-page connector inside one process level; the throw and the catch share the
  same `linkEventDefinition@name`. The throw has no outgoing flow, the catch no incoming flow.
- **Inclusive gateway**: activates every branch whose condition is true (default flow if none);
  the inclusive join waits only for the branches that were activated.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_incident-response"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <signal id="sig_incident_resolved" name="incident_resolved"/>

  <process id="incident-response" name="Incident Response" isExecutable="true">

    <startEvent id="start" name="Incident Reported">
      <outgoing>flow_start_to_gw_notify</outgoing>
    </startEvent>

    <inclusiveGateway id="gw_notify" name="Who to Notify?" default="flow_gw_notify_to_notify_team">
      <incoming>flow_start_to_gw_notify</incoming>
      <outgoing>flow_gw_notify_to_notify_team</outgoing>
      <outgoing>flow_gw_notify_to_notify_customers</outgoing>
      <outgoing>flow_gw_notify_to_notify_regulator</outgoing>
    </inclusiveGateway>

    <serviceTask id="notify_team" name="Notify On-call Team">
      <incoming>flow_gw_notify_to_notify_team</incoming>
      <outgoing>flow_notify_team_to_gw_notify_join</outgoing>
    </serviceTask>

    <serviceTask id="notify_customers" name="Notify Customers">
      <incoming>flow_gw_notify_to_notify_customers</incoming>
      <outgoing>flow_notify_customers_to_gw_notify_join</outgoing>
    </serviceTask>

    <serviceTask id="notify_regulator" name="Notify Regulator">
      <incoming>flow_gw_notify_to_notify_regulator</incoming>
      <outgoing>flow_notify_regulator_to_gw_notify_join</outgoing>
    </serviceTask>

    <inclusiveGateway id="gw_notify_join" name="Notifications Sent">
      <incoming>flow_notify_team_to_gw_notify_join</incoming>
      <incoming>flow_notify_customers_to_gw_notify_join</incoming>
      <incoming>flow_notify_regulator_to_gw_notify_join</incoming>
      <outgoing>flow_gw_notify_join_to_throw_link_mitigation</outgoing>
    </inclusiveGateway>

    <!-- link: jump to the mitigation part of the diagram -->
    <intermediateThrowEvent id="throw_link_mitigation" name="Go to Mitigation">
      <incoming>flow_gw_notify_join_to_throw_link_mitigation</incoming>
      <linkEventDefinition id="LinkDef_throw_mitigation" name="Mitigation"/>
    </intermediateThrowEvent>

    <intermediateCatchEvent id="catch_link_mitigation" name="Mitigation">
      <outgoing>flow_catch_link_mitigation_to_mitigate_incident</outgoing>
      <linkEventDefinition id="LinkDef_catch_mitigation" name="Mitigation"/>
    </intermediateCatchEvent>

    <userTask id="mitigate_incident" name="Mitigate Incident">
      <incoming>flow_catch_link_mitigation_to_mitigate_incident</incoming>
      <outgoing>flow_mitigate_incident_to_catch_error_rate_normal</outgoing>
    </userTask>

    <!-- wait until monitoring data says the error rate is back to normal -->
    <intermediateCatchEvent id="catch_error_rate_normal" name="Error Rate Normal">
      <incoming>flow_mitigate_incident_to_catch_error_rate_normal</incoming>
      <outgoing>flow_catch_error_rate_normal_to_end_resolved</outgoing>
      <conditionalEventDefinition id="CondDef_error_rate">
        <condition xsi:type="tFormalExpression">errorRate &lt; 0.01</condition>
      </conditionalEventDefinition>
    </intermediateCatchEvent>

    <!-- broadcast to every process waiting for this signal -->
    <endEvent id="end_resolved" name="Incident Resolved">
      <incoming>flow_catch_error_rate_normal_to_end_resolved</incoming>
      <signalEventDefinition id="SigDef_resolved" signalRef="sig_incident_resolved"/>
    </endEvent>

    <sequenceFlow id="flow_start_to_gw_notify" sourceRef="start" targetRef="gw_notify"/>
    <sequenceFlow id="flow_gw_notify_to_notify_team" name="Otherwise" sourceRef="gw_notify" targetRef="notify_team"/>
    <sequenceFlow id="flow_gw_notify_to_notify_customers" name="Customer impact" sourceRef="gw_notify" targetRef="notify_customers">
      <conditionExpression xsi:type="tFormalExpression">customerImpact = true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_notify_to_notify_regulator" name="Data breach" sourceRef="gw_notify" targetRef="notify_regulator">
      <conditionExpression xsi:type="tFormalExpression">dataBreach = true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_notify_team_to_gw_notify_join" sourceRef="notify_team" targetRef="gw_notify_join"/>
    <sequenceFlow id="flow_notify_customers_to_gw_notify_join" sourceRef="notify_customers" targetRef="gw_notify_join"/>
    <sequenceFlow id="flow_notify_regulator_to_gw_notify_join" sourceRef="notify_regulator" targetRef="gw_notify_join"/>
    <sequenceFlow id="flow_gw_notify_join_to_throw_link_mitigation" sourceRef="gw_notify_join" targetRef="throw_link_mitigation"/>
    <sequenceFlow id="flow_catch_link_mitigation_to_mitigate_incident" sourceRef="catch_link_mitigation" targetRef="mitigate_incident"/>
    <sequenceFlow id="flow_mitigate_incident_to_catch_error_rate_normal" sourceRef="mitigate_incident" targetRef="catch_error_rate_normal"/>
    <sequenceFlow id="flow_catch_error_rate_normal_to_end_resolved" sourceRef="catch_error_rate_normal" targetRef="end_resolved"/>

  </process>

</definitions>
```

> With an inclusive split, a default flow is taken **only** when no condition is true.
> To always run a branch, give it a condition that is always true instead of making it the default.
> (In the example the default is the team notification, so the team is notified only when neither
> customers nor the regulator are — adapt to the requirement.)

---

## 5. Ad-hoc work, call activity, data objects and artifacts

- `<adHocSubProcess>`: inner activities without sequence flows, performed in any order;
  `completionCondition` ends it; `ordering="Parallel"` (default) or `"Sequential"`.
- `<callActivity calledElement="other-process-key">`: reuses a separately deployed process.
  Variable passing is engine-specific (profile).
- Data objects document what a step reads/writes; `textAnnotation` + `association` add notes;
  `group` frames related elements (label via `category`/`categoryValue`).
- `<timerEventDefinition>` with `timeCycle` on the start event schedules recurring instances.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_monthly-audit"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <category id="cat_phases">
    <categoryValue id="cv_fieldwork" value="Fieldwork"/>
  </category>

  <process id="monthly-audit" name="Monthly Audit" isExecutable="true">

    <documentation>Runs on the first day of every month at 08:00 UTC.</documentation>

    <startEvent id="start_monthly" name="First Day of Month">
      <outgoing>flow_start_monthly_to_prepare_audit</outgoing>
      <timerEventDefinition id="TimerDef_monthly">
        <timeCycle xsi:type="tFormalExpression">R/2026-01-01T08:00:00Z/P1M</timeCycle>
      </timerEventDefinition>
    </startEvent>

    <callActivity id="prepare_audit" name="Prepare Audit" calledElement="audit-preparation">
      <incoming>flow_start_monthly_to_prepare_audit</incoming>
      <outgoing>flow_prepare_audit_to_fieldwork</outgoing>
      <dataOutputAssociation id="doa_prepare_audit_plan">
        <targetRef>ref_audit_plan</targetRef>
      </dataOutputAssociation>
    </callActivity>

    <adHocSubProcess id="fieldwork" name="Fieldwork" ordering="Parallel">
      <incoming>flow_prepare_audit_to_fieldwork</incoming>
      <outgoing>flow_fieldwork_to_end</outgoing>
      <userTask id="interview_staff" name="Interview Staff"/>
      <userTask id="sample_invoices" name="Sample Invoices"/>
      <userTask id="inspect_inventory" name="Inspect Inventory"/>
      <completionCondition xsi:type="tFormalExpression">findingsComplete = true</completionCondition>
    </adHocSubProcess>

    <endEvent id="end" name="Audit Done">
      <incoming>flow_fieldwork_to_end</incoming>
    </endEvent>

    <dataObject id="obj_audit_plan" name="Audit Plan"/>
    <dataObjectReference id="ref_audit_plan" name="Audit Plan" dataObjectRef="obj_audit_plan"/>

    <sequenceFlow id="flow_start_monthly_to_prepare_audit" sourceRef="start_monthly" targetRef="prepare_audit"/>
    <sequenceFlow id="flow_prepare_audit_to_fieldwork" sourceRef="prepare_audit" targetRef="fieldwork"/>
    <sequenceFlow id="flow_fieldwork_to_end" sourceRef="fieldwork" targetRef="end"/>

    <textAnnotation id="note_fieldwork">
      <text>Any order; stop when findings are complete.</text>
    </textAnnotation>
    <association id="assoc_note_fieldwork" sourceRef="fieldwork" targetRef="note_fieldwork"/>
    <group id="group_fieldwork" categoryValueRef="cv_fieldwork"/>

  </process>

</definitions>
```

---

## 6. Complex gateway (snippet only)

The complex gateway synchronizes on a custom `activationCondition` (e.g. "continue after 2 of 3
branches"). Very few engines execute it (none of the bundled profiles do) and bpmnlint discourages it;
prefer an inclusive gateway or a multi-instance activity with a `completionCondition`.

```xml
<complexGateway id="gw_two_of_three" name="2 of 3 Reviews" default="flow_gw_two_of_three_to_escalate">
  <incoming>flow_review_a_to_gw_two_of_three</incoming>
  <incoming>flow_review_b_to_gw_two_of_three</incoming>
  <incoming>flow_review_c_to_gw_two_of_three</incoming>
  <outgoing>flow_gw_two_of_three_to_decide</outgoing>
  <outgoing>flow_gw_two_of_three_to_escalate</outgoing>
  <activationCondition xsi:type="tFormalExpression">reviewsDone &gt;= 2</activationCondition>
</complexGateway>
```
