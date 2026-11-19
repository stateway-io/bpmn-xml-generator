'use strict';

/**
 * Stateway-specific configuration checks. Each one mirrors a publish-time rule of the engine
 * (https://docs.stateway.io: Supported Elements & Fields, Service Tasks, Decision Models,
 * Variable Expressions, Timers, Multi-Instance), so a file that passes here is not refused by
 * `POST /v1/definitions` for these reasons.
 *
 * Extension placement (which `stateway:` element or attribute goes on which BPMN element) is read
 * from the `associations` block of ../moddle/stateway.json — a copy of the engine's own descriptor
 * (src/engine/parser/stateway-moddle.json in Stateway) plus one `DecisionAttributes` type that lets
 * bpmn-moddle know `stateway:decisionRef` / `decisionVersion` on a businessRuleTask. Placement is
 * not restated here.
 */

const descriptor = require('../moddle/stateway.json');

// Same grammar as the engine's timer parser: days/hours/minutes/whole seconds only.
const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const CYCLE = /^R(\d*)\/(?:([^/]+)\/)?([^/]+)$/;

const VARIABLE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_LOOP_NAMES = [ 'loopCounter', 'nrOfInstances', 'nrOfActiveInstances', 'nrOfCompletedInstances', 'countOf' ];

const LEGACY_TYPES = [ 'InputOutput', 'InputParameter', 'OutputParameter' ];

// Supported task headers per element type (the engine rejects any other key).
const HEADERS = {
  'bpmn:ServiceTask': [ 'url', 'headers', 'authorization', 'method', 'timeout', 'executionMode', 'callbackEvent', 'callbackTimeout', 'callbackCorrelation' ],
  'bpmn:SendTask': [ 'url', 'headers', 'authorization', 'method', 'timeout', 'callbackEvent' ],
  'bpmn:BusinessRuleTask': [ 'decisionKey', 'decisionVersion', 'executionMode', 'timeout' ]
};
const METHODS = [ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS' ];
const DURATION_HEADERS = [ 'timeout', 'callbackTimeout' ];
const DECISION_VERSION = /^[1-9][0-9]*$/;

// Elements whose ioMapping may only declare outputs.
const OUTPUTS_ONLY = [ 'bpmn:StartEvent', 'bpmn:Task', 'bpmn:BoundaryEvent', 'bpmn:IntermediateCatchEvent' ];

/** `{ 'bpmn:ServiceTask': { elements: Set<'TaskDefinition'…>, attrs: Set<'decisionRef'…> } }` */
const PLACEMENT = {};
for (const association of descriptor.associations || []) {
  const entry = PLACEMENT[association.type] = { elements: new Set(), attrs: new Set() };

  for (const property of association.properties) {
    if (property.isAttr) {
      entry.attrs.add(property.name);
    } else {
      entry.elements.add(property.type);
    }
  }
}

function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function shortType(node) {
  return lowerFirst(node.$type.replace(/^bpmn:/, ''));
}

function extensions(node, type) {
  const values = (node.extensionElements && node.extensionElements.values) || [];

  return values.filter(value => value.$instanceOf(type));
}

function headers(node) {
  const result = {};

  for (const taskHeaders of extensions(node, 'stateway:TaskHeaders')) {
    for (const header of taskHeaders.values || []) {
      result[header.key] = header.value;
    }
  }

  return result;
}

function isBadDuration(body) {
  return !DURATION.test(body) || body === 'P' || body.endsWith('T');
}

function durationMs(body) {
  const [ , d = '0', h = '0', m = '0', s = '0' ] = DURATION.exec(body);

  return Number(d) * 86400000 + Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000;
}

function isBadDate(body) {
  return !DATE.test(body) || Number.isNaN(new Date(body).getTime());
}

function timerError(name, body) {
  if (name === 'timeDuration') {
    return isBadDuration(body) && 'use days, hours, minutes and whole seconds (e.g. PT30M, P1DT2H); years, months, weeks and fractions are not supported';
  }

  if (name === 'timeDate') {
    return isBadDate(body) && 'use an ISO 8601 date-time such as 2026-12-31T09:00:00Z';
  }

  const match = CYCLE.exec(body);

  if (!match) {
    return 'use an ISO 8601 repeating interval such as R3/PT1H, R/PT10M or R/2026-12-31T09:00:00Z/P1D';
  }

  const [ , count, start, interval ] = match;

  if (count !== '' && Number(count) < 1) {
    return 'the number of repetitions must be at least 1';
  }

  if (start !== undefined && isBadDate(start)) {
    return `the start "${start}" must be an ISO 8601 date-time`;
  }

  if (isBadDuration(interval)) {
    return `the interval "${interval}" must be a duration with days, hours, minutes and seconds`;
  }

  return durationMs(interval) === 0 && 'the interval must be longer than zero';
}

function checkTimer(node, reporter) {
  const owner = node.$parent && node.$parent.id;

  for (const name of [ 'timeDuration', 'timeDate', 'timeCycle' ]) {
    const expression = node[name];

    if (!expression) {
      continue;
    }

    const body = (expression.body || '').trim();
    const error = timerError(name, body);

    if (error) {
      reporter.report(owner, `<${name}> "${body}" is not a valid Stateway timer: ${error} (no expressions or cron)`);
    }
  }
}

function checkPlacement(node, reporter) {
  const allowed = PLACEMENT[node.$type] || { elements: new Set(), attrs: new Set() };

  for (const value of (node.extensionElements && node.extensionElements.values) || []) {
    if (!value.$type.startsWith('stateway:')) {
      continue;
    }

    const name = value.$type.replace(/^stateway:/, '');

    if (LEGACY_TYPES.includes(name)) {
      reporter.report(node.id, `<stateway:${lowerFirst(name)}> is a legacy alias; emit <stateway:ioMapping> instead`);
    } else if (!allowed.elements.has(name)) {
      reporter.report(node.id, `<stateway:${lowerFirst(name)}> is not allowed on a ${shortType(node)} (rejected at publish)`);
    }
  }

  for (const attr of Object.keys(node.$attrs || {})) {
    if (attr.startsWith('stateway:') && !allowed.attrs.has(attr.replace(/^stateway:/, ''))) {
      reporter.report(node.id, `${attr} is not allowed on a ${shortType(node)} (rejected at publish)`);
    }
  }
}

function checkIoMapping(node, reporter) {
  for (const ioMapping of extensions(node, 'stateway:IoMapping')) {
    const entries = [ ...(ioMapping.inputs || []), ...(ioMapping.outputs || []), ...(ioMapping.accepted || []) ];

    for (const entry of entries) {
      if (!entry.target) {
        reporter.report(node.id, '<stateway:ioMapping> entry without a target');
      } else if (!VARIABLE_NAME.test(entry.target)) {
        reporter.report(node.id, `ioMapping target "${entry.target}" must be a bare variable name (letters, digits, _ and $; no "variables." prefix, no dots)`);
      }

      if (entry.source === undefined) {
        reporter.report(node.id, '<stateway:ioMapping> entry without a source');
      }
    }

    if (OUTPUTS_ONLY.includes(node.$type) && (ioMapping.inputs || []).length) {
      reporter.report(node.id, `a ${shortType(node)} ioMapping may only declare outputs (inputs are rejected at publish)`);
    }

    if ((ioMapping.accepted || []).length) {
      const asyncService = node.$type === 'bpmn:ServiceTask' && headers(node).executionMode === 'async';

      if (!asyncService) {
        reporter.report(node.id, '<stateway:accepted> applies only to a serviceTask with executionMode="async"');
      }
    }
  }
}

function checkTaskHeaders(node, reporter) {
  const supported = HEADERS[node.$type];

  if (!supported) {
    return;
  }

  const taskHeaders = headers(node);

  for (const key of Object.keys(taskHeaders)) {
    if (key === 'retries') {
      reporter.report(node.id, 'Stateway has no automatic retry; remove the "retries" header (catch failures with an error boundary)');
    } else if (!supported.includes(key)) {
      reporter.report(node.id, `task header "${key}" is not supported on a ${shortType(node)}; supported: ${supported.join(', ')}`);
    }
  }

  for (const key of DURATION_HEADERS) {
    const value = taskHeaders[key];
    const positiveMs = /^\d+$/.test(value || '') && Number(value) > 0;

    if (value !== undefined && !positiveMs && (isBadDuration(value) || durationMs(value) === 0)) {
      reporter.report(node.id, `task header "${key}" "${value}" must be a positive number of milliseconds or an ISO 8601 duration (e.g. PT30S)`);
    }
  }

  if (node.$type === 'bpmn:BusinessRuleTask') {
    if (!node.get('stateway:decisionRef') && !taskHeaders.decisionKey) {
      reporter.report(node.id, 'businessRuleTask needs stateway:decisionRef (or a decisionKey task header)');
    }

    const version = node.get('stateway:decisionVersion') || taskHeaders.decisionVersion;

    if (version !== undefined && !DECISION_VERSION.test(version)) {
      reporter.report(node.id, `decisionVersion "${version}" must be a positive integer`);
    }

    if (taskHeaders.executionMode !== undefined && taskHeaders.executionMode !== 'sync') {
      reporter.report(node.id, 'businessRuleTask evaluation is always synchronous; executionMode may only be "sync"');
    }

    return;
  }

  if (!taskHeaders.url) {
    reporter.report(node.id, `${shortType(node)} needs a "url" task header`);
  }

  if (taskHeaders.method !== undefined && !METHODS.includes(taskHeaders.method)) {
    reporter.report(node.id, `task header "method" must be one of ${METHODS.join(', ')}`);
  }

  if (node.$type !== 'bpmn:ServiceTask') {
    return;
  }

  const mode = taskHeaders.executionMode;

  if (mode !== undefined && ![ 'sync', 'async' ].includes(mode)) {
    reporter.report(node.id, `executionMode must be "sync" or "async", got "${mode}"`);
  }

  if (mode === 'async') {
    if (!taskHeaders.callbackEvent) {
      reporter.report(node.id, 'executionMode="async" requires a "callbackEvent" task header');
    }
  } else {
    for (const key of [ 'callbackEvent', 'callbackTimeout', 'callbackCorrelation' ]) {
      if (taskHeaders[key] !== undefined) {
        reporter.report(node.id, `task header "${key}" applies only with executionMode="async"`);
      }
    }
  }
}

function checkTaskDefinition(node, reporter) {
  for (const definition of extensions(node, 'stateway:TaskDefinition')) {
    if ('retries' in (definition.$attrs || {})) {
      reporter.report(node.id, 'retries on <stateway:taskDefinition> is rejected: Stateway has no automatic retry');
    }

    if (definition.type !== 'http') {
      reporter.report(node.id, `<stateway:taskDefinition> type must be "http", got "${definition.type}"`);
    }
  }
}

function checkMultiInstance(node, reporter) {
  const id = node.$parent && node.$parent.id;

  if (node.$parent && node.$parent.$type === 'bpmn:SubProcess') {
    reporter.report(id, 'multi-instance is not supported on an embedded subProcess; use a callActivity');
  }

  const declaresBehavior = (node.behavior && node.behavior !== 'All') ||
    (node.complexBehaviorDefinition || []).length > 0 ||
    node.oneBehaviorEventRef || node.noneBehaviorEventRef;

  if (declaresBehavior) {
    reporter.report(id, 'multi-instance behavior, complexBehaviorDefinition and behavior events are not supported');
  }

  if (!node.loopCardinality && !node.loopDataInputRef) {
    reporter.report(id, 'multi-instance needs <loopCardinality> or <loopDataInputRef>');
  }

  if (!node.loopDataOutputRef !== !node.outputDataItem) {
    reporter.report(id, 'multi-instance must declare <loopDataOutputRef> and <outputDataItem> together');
  }

  if (node.inputDataItem && !node.loopDataInputRef) {
    reporter.report(id, 'multi-instance <inputDataItem> needs <loopDataInputRef>');
  }

  for (const key of [ 'loopDataInputRef', 'loopDataOutputRef' ]) {
    const ref = node[key];

    if (ref && !ref.$instanceOf('bpmn:DataObject') && !ref.$instanceOf('bpmn:DataObjectReference')) {
      reporter.report(id, `multi-instance <${key}> must reference a dataObject or dataObjectReference by id`);
    }
  }

  for (const key of [ 'inputDataItem', 'outputDataItem' ]) {
    if (!node[key]) {
      continue;
    }

    const name = node[key].name;

    if (!name || !VARIABLE_NAME.test(name)) {
      reporter.report(id, `multi-instance <${key}> needs a name that is a valid variable name`);
    } else if (RESERVED_LOOP_NAMES.includes(name)) {
      reporter.report(id, `multi-instance <${key}> "${name}" is reserved (${RESERVED_LOOP_NAMES.join(', ')})`);
    }
  }

  if (node.inputDataItem && node.outputDataItem && node.inputDataItem.name === node.outputDataItem.name) {
    reporter.report(id, 'multi-instance <inputDataItem> and <outputDataItem> must be different variables');
  }
}

module.exports = function() {

  function check(node, reporter) {

    if (node.$instanceOf('bpmn:TimerEventDefinition')) {
      return checkTimer(node, reporter);
    }

    if (node.$instanceOf('bpmn:MultiInstanceLoopCharacteristics')) {
      return checkMultiInstance(node, reporter);
    }

    if (node.$instanceOf('bpmn:SequenceFlow')) {
      if (node.conditionExpression && node.sourceRef && node.sourceRef.$instanceOf('bpmn:ParallelGateway')) {
        reporter.report(node.id, 'a sequence flow leaving a parallelGateway cannot have a condition');
      }

      return;
    }

    if (!node.$instanceOf('bpmn:FlowNode')) {
      return;
    }

    checkPlacement(node, reporter);
    checkIoMapping(node, reporter);
    checkTaskHeaders(node, reporter);
    checkTaskDefinition(node, reporter);

    const errorBoundaryOnSendTask = node.$instanceOf('bpmn:BoundaryEvent') &&
      node.attachedToRef && node.attachedToRef.$instanceOf('bpmn:SendTask') &&
      (node.eventDefinitions || []).some(definition => definition.$instanceOf('bpmn:ErrorEventDefinition'));

    if (errorBoundaryOnSendTask) {
      reporter.report(node.id, 'an error boundary on a sendTask is rejected: a send task completes on dispatch; use a serviceTask to catch failures');
    }

    if (node.$instanceOf('bpmn:UserTask')) {
      for (const assignment of extensions(node, 'stateway:AssignmentDefinition')) {
        if (!assignment.assignee && !assignment.candidateUsers && !assignment.candidateGroups) {
          reporter.report(node.id, '<stateway:assignmentDefinition> must set assignee, candidateUsers or candidateGroups (or be omitted)');
        }
      }
    }
  }

  return { check };
};
