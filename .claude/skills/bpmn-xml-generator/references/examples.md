# BPMN Examples (core)

Four complete, engine-agnostic BPMN 2.0 documents. They contain **no engine extensions**:
they show structure only. To make one executable, apply the selected profile
(`profiles/<engine>.md`): add its namespace, implementation details and expression syntax.
Engine-specific, ready-to-deploy examples live at the end of each profile file.

Condition bodies below (`approved = true`, `score >= 700` …) are neutral placeholders — rewrite them
in the profile's expression language (`{{...}}` for Stateway, `=...` FEEL for Camunda 8, `${...}` for Flowable).

Every block tagged `profile=core` is validated by `tests/run-examples.mjs`
(bpmn-moddle, OMG XSD, bpmnlint) — keep it that way when editing.

---

## Example 1 — Simple approval (userTask + exclusiveGateway + default flow)

**Use case:** a requester submits a request; a manager approves or rejects; rejection is the default path.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_simple-approval"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="simple-approval" name="Simple Approval" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Request Needed">
      <outgoing>flow_start_to_submit_request</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <userTask id="submit_request" name="Submit Request">
      <incoming>flow_start_to_submit_request</incoming>
      <outgoing>flow_submit_request_to_throw_in_review</outgoing>
    </userTask>

    <intermediateThrowEvent id="throw_in_review" name="Request in Review">
      <incoming>flow_submit_request_to_throw_in_review</incoming>
      <outgoing>flow_throw_in_review_to_review_request</outgoing>
      <messageEventDefinition id="MsgDef_in_review" messageRef="msg_request_in_review"/>
    </intermediateThrowEvent>

    <userTask id="review_request" name="Review Request">
      <incoming>flow_throw_in_review_to_review_request</incoming>
      <outgoing>flow_review_request_to_gw_decision</outgoing>
    </userTask>

    <serviceTask id="notify_approval" name="Notify Approval">
      <incoming>flow_gw_decision_to_notify_approval</incoming>
      <outgoing>flow_notify_approval_to_end_approved</outgoing>
    </serviceTask>

    <!-- ═══ GATEWAYS ═══ -->
    <exclusiveGateway id="gw_decision" name="Approved?" default="flow_gw_decision_to_end_rejected">
      <incoming>flow_review_request_to_gw_decision</incoming>
      <outgoing>flow_gw_decision_to_notify_approval</outgoing>
      <outgoing>flow_gw_decision_to_end_rejected</outgoing>
    </exclusiveGateway>

    <!-- ═══ END ═══ -->
    <endEvent id="end_approved" name="Request Approved">
      <incoming>flow_notify_approval_to_end_approved</incoming>
    </endEvent>

    <endEvent id="end_rejected" name="Request Rejected">
      <incoming>flow_gw_decision_to_end_rejected</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_submit_request" sourceRef="start" targetRef="submit_request"/>
    <sequenceFlow id="flow_submit_request_to_throw_in_review" sourceRef="submit_request" targetRef="throw_in_review"/>
    <sequenceFlow id="flow_throw_in_review_to_review_request" sourceRef="throw_in_review" targetRef="review_request"/>
    <sequenceFlow id="flow_review_request_to_gw_decision" sourceRef="review_request" targetRef="gw_decision"/>
    <sequenceFlow id="flow_gw_decision_to_notify_approval" name="Yes" sourceRef="gw_decision" targetRef="notify_approval">
      <conditionExpression xsi:type="tFormalExpression">approved = true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_decision_to_end_rejected" name="No" sourceRef="gw_decision" targetRef="end_rejected"/>
    <sequenceFlow id="flow_notify_approval_to_end_approved" sourceRef="notify_approval" targetRef="end_approved"/>

  </process>

  <message id="msg_request_in_review" name="request_in_review"/>

</definitions>
```

---

## Example 2 — Customer onboarding (parallel split/join + interrupting timer boundary)

**Use case:** welcome e-mail and KYC run in parallel; KYC has a 48 h deadline.
If the deadline fires, the escalation path ends in a **terminate** end event — otherwise the
token from the welcome branch would wait forever at the parallel join (see ERR-022).

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_customer-onboarding"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="customer-onboarding" name="Customer Onboarding" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Account Created">
      <outgoing>flow_start_to_gw_split</outgoing>
    </startEvent>

    <!-- ═══ PARALLEL SPLIT ═══ -->
    <parallelGateway id="gw_split" name="Start Onboarding">
      <incoming>flow_start_to_gw_split</incoming>
      <outgoing>flow_gw_split_to_send_welcome</outgoing>
      <outgoing>flow_gw_split_to_complete_kyc</outgoing>
    </parallelGateway>

    <!-- ═══ BRANCH A: welcome e-mail ═══ -->
    <serviceTask id="send_welcome" name="Send Welcome Email">
      <incoming>flow_gw_split_to_send_welcome</incoming>
      <outgoing>flow_send_welcome_to_gw_join</outgoing>
    </serviceTask>

    <!-- ═══ BRANCH B: KYC with a 48 h deadline ═══ -->
    <userTask id="complete_kyc" name="Complete KYC">
      <incoming>flow_gw_split_to_complete_kyc</incoming>
      <outgoing>flow_complete_kyc_to_gw_join</outgoing>
    </userTask>

    <boundaryEvent id="timeout_boundary_complete_kyc" name="48h Elapsed"
                   attachedToRef="complete_kyc" cancelActivity="true">
      <outgoing>flow_timeout_boundary_complete_kyc_to_escalate_kyc</outgoing>
      <timerEventDefinition id="TimerDef_kyc_deadline">
        <timeDuration xsi:type="tFormalExpression">PT48H</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>

    <userTask id="escalate_kyc" name="Escalate KYC">
      <incoming>flow_timeout_boundary_complete_kyc_to_escalate_kyc</incoming>
      <outgoing>flow_escalate_kyc_to_end_escalated</outgoing>
    </userTask>

    <!-- ═══ PARALLEL JOIN ═══ -->
    <parallelGateway id="gw_join" name="Onboarding Done">
      <incoming>flow_send_welcome_to_gw_join</incoming>
      <incoming>flow_complete_kyc_to_gw_join</incoming>
      <outgoing>flow_gw_join_to_activate_account</outgoing>
    </parallelGateway>

    <serviceTask id="activate_account" name="Activate Account">
      <incoming>flow_gw_join_to_activate_account</incoming>
      <outgoing>flow_activate_account_to_end_active</outgoing>
    </serviceTask>

    <!-- ═══ END ═══ -->
    <endEvent id="end_active" name="Account Active">
      <incoming>flow_activate_account_to_end_active</incoming>
    </endEvent>

    <!-- terminate: also removes the welcome-branch token waiting at gw_join -->
    <endEvent id="end_escalated" name="Onboarding Escalated">
      <incoming>flow_escalate_kyc_to_end_escalated</incoming>
      <terminateEventDefinition id="TermDef_escalated"/>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_gw_split" sourceRef="start" targetRef="gw_split"/>
    <sequenceFlow id="flow_gw_split_to_send_welcome" sourceRef="gw_split" targetRef="send_welcome"/>
    <sequenceFlow id="flow_gw_split_to_complete_kyc" sourceRef="gw_split" targetRef="complete_kyc"/>
    <sequenceFlow id="flow_send_welcome_to_gw_join" sourceRef="send_welcome" targetRef="gw_join"/>
    <sequenceFlow id="flow_complete_kyc_to_gw_join" sourceRef="complete_kyc" targetRef="gw_join"/>
    <sequenceFlow id="flow_timeout_boundary_complete_kyc_to_escalate_kyc" sourceRef="timeout_boundary_complete_kyc" targetRef="escalate_kyc"/>
    <sequenceFlow id="flow_escalate_kyc_to_end_escalated" sourceRef="escalate_kyc" targetRef="end_escalated"/>
    <sequenceFlow id="flow_gw_join_to_activate_account" sourceRef="gw_join" targetRef="activate_account"/>
    <sequenceFlow id="flow_activate_account_to_end_active" sourceRef="activate_account" targetRef="end_active"/>

  </process>

</definitions>
```

---

## Example 3 — Message correlation with a deadline (eventBasedGateway)

**Use case:** order placed → stock reserved → wait for the payment message **or** a 24 h timeout.

> Not every engine executes `eventBasedGateway` (Stateway parses but does not execute it).
> Check the profile's support matrix; `profiles/stateway.md` shows the alternative.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_order-fulfillment"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <message id="msg_payment_confirmed" name="payment_confirmed"/>

  <process id="order-fulfillment" name="Order Fulfillment" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Order Placed">
      <outgoing>flow_start_to_reserve_stock</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <serviceTask id="reserve_stock" name="Reserve Stock">
      <incoming>flow_start_to_reserve_stock</incoming>
      <outgoing>flow_reserve_stock_to_gw_payment</outgoing>
    </serviceTask>

    <!-- ═══ GATEWAYS ═══ -->
    <eventBasedGateway id="gw_payment" name="Payment or Timeout?">
      <incoming>flow_reserve_stock_to_gw_payment</incoming>
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
      <outgoing>flow_catch_timeout_to_cancel_order</outgoing>
      <timerEventDefinition id="TimerDef_payment_timeout">
        <timeDuration xsi:type="tFormalExpression">PT24H</timeDuration>
      </timerEventDefinition>
    </intermediateCatchEvent>

    <serviceTask id="ship_order" name="Ship Order">
      <incoming>flow_catch_payment_to_ship_order</incoming>
      <outgoing>flow_ship_order_to_end_shipped</outgoing>
    </serviceTask>

    <serviceTask id="cancel_order" name="Cancel Order">
      <incoming>flow_catch_timeout_to_cancel_order</incoming>
      <outgoing>flow_cancel_order_to_end_cancelled</outgoing>
    </serviceTask>

    <!-- ═══ END ═══ -->
    <endEvent id="end_shipped" name="Order Shipped">
      <incoming>flow_ship_order_to_end_shipped</incoming>
    </endEvent>

    <endEvent id="end_cancelled" name="Order Cancelled">
      <incoming>flow_cancel_order_to_end_cancelled</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_reserve_stock" sourceRef="start" targetRef="reserve_stock"/>
    <sequenceFlow id="flow_reserve_stock_to_gw_payment" sourceRef="reserve_stock" targetRef="gw_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_payment" sourceRef="gw_payment" targetRef="catch_payment"/>
    <sequenceFlow id="flow_gw_payment_to_catch_timeout" sourceRef="gw_payment" targetRef="catch_timeout"/>
    <sequenceFlow id="flow_catch_payment_to_ship_order" sourceRef="catch_payment" targetRef="ship_order"/>
    <sequenceFlow id="flow_catch_timeout_to_cancel_order" sourceRef="catch_timeout" targetRef="cancel_order"/>
    <sequenceFlow id="flow_ship_order_to_end_shipped" sourceRef="ship_order" targetRef="end_shipped"/>
    <sequenceFlow id="flow_cancel_order_to_end_cancelled" sourceRef="cancel_order" targetRef="end_cancelled"/>

  </process>

</definitions>
```

---

## Example 4 — Credit analysis (businessRuleTask + embedded sub-process + decision after review)

**Use case:** documents are validated; a decision evaluates the credit score; good scores are
auto-approved, the rest go through a manual-review sub-process whose outcome is checked afterwards.

```xml profile=core
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_loan-application"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="bpmn-xml-generator"
             exporterVersion="2.0">

  <process id="loan-application" name="Loan Application" isExecutable="true">

    <!-- ═══ START ═══ -->
    <startEvent id="start" name="Application Received">
      <outgoing>flow_start_to_validate_documents</outgoing>
    </startEvent>

    <!-- ═══ ACTIVITIES ═══ -->
    <userTask id="validate_documents" name="Validate Documents">
      <incoming>flow_start_to_validate_documents</incoming>
      <outgoing>flow_validate_documents_to_gw_documents</outgoing>
    </userTask>

    <businessRuleTask id="evaluate_credit" name="Evaluate Credit Score">
      <incoming>flow_gw_documents_to_evaluate_credit</incoming>
      <outgoing>flow_evaluate_credit_to_gw_score</outgoing>
    </businessRuleTask>

    <serviceTask id="approve_loan" name="Approve Loan">
      <incoming>flow_gw_approve_merge_to_approve_loan</incoming>
      <outgoing>flow_approve_loan_to_end_approved</outgoing>
    </serviceTask>

    <subProcess id="manual_review" name="Manual Review">
      <incoming>flow_gw_score_to_manual_review</incoming>
      <outgoing>flow_manual_review_to_gw_review</outgoing>

      <startEvent id="manual_review_start" name="Review Requested">
        <outgoing>flow_manual_review_start_to_senior_review</outgoing>
      </startEvent>

      <userTask id="senior_review" name="Senior Analyst Review">
        <incoming>flow_manual_review_start_to_senior_review</incoming>
        <outgoing>flow_senior_review_to_manual_review_end</outgoing>
      </userTask>

      <endEvent id="manual_review_end" name="Review Done">
        <incoming>flow_senior_review_to_manual_review_end</incoming>
      </endEvent>

      <sequenceFlow id="flow_manual_review_start_to_senior_review" sourceRef="manual_review_start" targetRef="senior_review"/>
      <sequenceFlow id="flow_senior_review_to_manual_review_end" sourceRef="senior_review" targetRef="manual_review_end"/>
    </subProcess>

    <!-- ═══ GATEWAYS ═══ -->
    <exclusiveGateway id="gw_documents" name="Documents Valid?" default="flow_gw_documents_to_end_rejected">
      <incoming>flow_validate_documents_to_gw_documents</incoming>
      <outgoing>flow_gw_documents_to_evaluate_credit</outgoing>
      <outgoing>flow_gw_documents_to_end_rejected</outgoing>
    </exclusiveGateway>

    <exclusiveGateway id="gw_score" name="Auto-Approve?" default="flow_gw_score_to_manual_review">
      <incoming>flow_evaluate_credit_to_gw_score</incoming>
      <outgoing>flow_gw_score_to_gw_approve_merge</outgoing>
      <outgoing>flow_gw_score_to_manual_review</outgoing>
    </exclusiveGateway>

    <exclusiveGateway id="gw_review" name="Review Approved?" default="flow_gw_review_to_end_review_rejected">
      <incoming>flow_manual_review_to_gw_review</incoming>
      <outgoing>flow_gw_review_to_gw_approve_merge</outgoing>
      <outgoing>flow_gw_review_to_end_review_rejected</outgoing>
    </exclusiveGateway>

    <!-- merge: a gateway, never two incoming flows straight into a task (fake join) -->
    <exclusiveGateway id="gw_approve_merge" name="Approve">
      <incoming>flow_gw_score_to_gw_approve_merge</incoming>
      <incoming>flow_gw_review_to_gw_approve_merge</incoming>
      <outgoing>flow_gw_approve_merge_to_approve_loan</outgoing>
    </exclusiveGateway>

    <!-- ═══ END ═══ -->
    <endEvent id="end_approved" name="Loan Approved">
      <incoming>flow_approve_loan_to_end_approved</incoming>
    </endEvent>

    <endEvent id="end_rejected" name="Documents Rejected">
      <incoming>flow_gw_documents_to_end_rejected</incoming>
    </endEvent>

    <endEvent id="end_review_rejected" name="Credit Rejected">
      <incoming>flow_gw_review_to_end_review_rejected</incoming>
    </endEvent>

    <!-- ═══ SEQUENCE FLOWS ═══ -->
    <sequenceFlow id="flow_start_to_validate_documents" sourceRef="start" targetRef="validate_documents"/>
    <sequenceFlow id="flow_validate_documents_to_gw_documents" sourceRef="validate_documents" targetRef="gw_documents"/>
    <sequenceFlow id="flow_gw_documents_to_evaluate_credit" name="Valid" sourceRef="gw_documents" targetRef="evaluate_credit">
      <conditionExpression xsi:type="tFormalExpression">documentsValid = true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_documents_to_end_rejected" name="Invalid" sourceRef="gw_documents" targetRef="end_rejected"/>
    <sequenceFlow id="flow_evaluate_credit_to_gw_score" sourceRef="evaluate_credit" targetRef="gw_score"/>
    <sequenceFlow id="flow_gw_score_to_gw_approve_merge" name="Score ≥ 700 and ≤ 50k" sourceRef="gw_score" targetRef="gw_approve_merge">
      <conditionExpression xsi:type="tFormalExpression">creditScore &gt;= 700 and requestedAmount &lt;= 50000</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_score_to_manual_review" name="Otherwise" sourceRef="gw_score" targetRef="manual_review"/>
    <sequenceFlow id="flow_manual_review_to_gw_review" sourceRef="manual_review" targetRef="gw_review"/>
    <sequenceFlow id="flow_gw_review_to_gw_approve_merge" name="Approved" sourceRef="gw_review" targetRef="gw_approve_merge">
      <conditionExpression xsi:type="tFormalExpression">seniorDecision = "approve"</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_gw_review_to_end_review_rejected" name="Rejected" sourceRef="gw_review" targetRef="end_review_rejected"/>
    <sequenceFlow id="flow_gw_approve_merge_to_approve_loan" sourceRef="gw_approve_merge" targetRef="approve_loan"/>
    <sequenceFlow id="flow_approve_loan_to_end_approved" sourceRef="approve_loan" targetRef="end_approved"/>

  </process>

</definitions>
```

> **XML escaping:** inside element content and attribute values write `&lt;` for `<` and `&amp;` for `&`
> (so `&&` becomes `&amp;&amp;`). `>` may stay literal but `&gt;` is safer.
