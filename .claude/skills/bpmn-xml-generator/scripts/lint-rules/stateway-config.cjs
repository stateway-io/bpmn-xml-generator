'use strict';

/**
 * Stateway-specific configuration checks, derived from https://docs.stateway.io
 * (Supported Elements, Service Tasks, Decision Models, Variable Expressions,
 * Frontend Gateway > BPMN assignment, Timers).
 */

const ISO_DURATION = /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_CYCLE = /^R\d*\/(.+)$/;

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

function checkTimer(node, reporter) {
  const owner = node.$parent && node.$parent.id;

  for (const [ name, expression, valid ] of [
    [ 'timeDuration', node.timeDuration, body => ISO_DURATION.test(body) ],
    [ 'timeDate', node.timeDate, body => ISO_DATE_TIME.test(body) ],
    [ 'timeCycle', node.timeCycle, body => {
      const match = ISO_CYCLE.exec(body);

      return !!match && match[1].split('/').every(part => ISO_DURATION.test(part) || ISO_DATE_TIME.test(part));
    } ]
  ]) {
    if (!expression) {
      continue;
    }

    const body = (expression.body || '').trim();

    if (!valid(body)) {
      reporter.report(owner, `<${name}> "${body}" must be a literal ISO 8601 value (Stateway does not accept expressions or cron in timers)`);
    }
  }
}

function checkIoMapping(node, reporter) {
  for (const ioMapping of extensions(node, 'stateway:IoMapping')) {
    const parameters = [ ...(ioMapping.inputParameters || []), ...(ioMapping.outputParameters || []) ];

    for (const parameter of parameters) {
      if (!parameter.target) {
        reporter.report(node.id, '<stateway:ioMapping> entry without a target');
      } else if (/^variables\./.test(parameter.target)) {
        reporter.report(node.id, `ioMapping target "${parameter.target}" must be a bare name (drop the "variables." prefix)`);
      }
    }

    if (node.$instanceOf('bpmn:StartEvent') && (ioMapping.inputParameters || []).length) {
      reporter.report(node.id, 'a startEvent ioMapping may only declare outputs (inputs are rejected at publish)');
    }

    if (node.$instanceOf('bpmn:SendTask')) {
      for (const output of ioMapping.outputParameters || []) {
        if (/\{\{/.test(output.source || '')) {
          reporter.report(node.id, 'sendTask ioMapping output sources are literal field names; {{...}} is rejected at publish');
        }
      }
    }
  }
}

module.exports = function() {

  function check(node, reporter) {

    if (node.$instanceOf('bpmn:TimerEventDefinition')) {
      return checkTimer(node, reporter);
    }

    if (!node.$instanceOf('bpmn:FlowNode')) {
      return;
    }

    checkIoMapping(node, reporter);

    if (node.$instanceOf('bpmn:BusinessRuleTask')) {
      const taskHeaders = headers(node);

      if (!node.get('stateway:decisionRef') && !taskHeaders.decisionKey) {
        reporter.report(node.id, 'businessRuleTask needs stateway:decisionRef (or a decisionKey task header)');
      }

      if (taskHeaders.executionMode === 'async') {
        reporter.report(node.id, 'businessRuleTask evaluation is always synchronous; executionMode="async" errors the instance');
      }

      return;
    }

    if (node.$instanceOf('bpmn:ServiceTask') || node.$instanceOf('bpmn:SendTask')) {
      const definitions = extensions(node, 'stateway:TaskDefinition');
      const taskHeaders = headers(node);

      if (!definitions.length || !definitions[0].type) {
        reporter.report(node.id, `${node.$type.replace('bpmn:', '')} needs <stateway:taskDefinition type="http"/>`);
      }

      if (definitions.some(definition => definition.type === 'http') && !taskHeaders.url) {
        reporter.report(node.id, 'http task needs a "url" task header');
      }

      if (taskHeaders.executionMode === 'async' && !taskHeaders.callbackEvent) {
        reporter.report(node.id, 'executionMode="async" requires a "callbackEvent" task header');
      }

      if (taskHeaders.executionMode && ![ 'sync', 'async' ].includes(taskHeaders.executionMode)) {
        reporter.report(node.id, `executionMode must be "sync" or "async", got "${taskHeaders.executionMode}"`);
      }

      if (taskHeaders.retries !== undefined) {
        reporter.report(node.id, 'Stateway has no retry policy; the "retries" header is not supported');
      }
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
