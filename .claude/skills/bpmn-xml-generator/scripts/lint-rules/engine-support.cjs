'use strict';

/**
 * Checks every element against the support matrix of the selected engine profile.
 *
 * config = {
 *   profile: 'stateway',
 *   matrix: { 'UserTask': 'supported', 'StartEvent.Timer': 'supported', ... },
 *   fallback: 'unverified',
 *   report: [ 'unsupported' ]          // statuses this instance reports
 * }
 */

const MESSAGES = {
  'unsupported': 'is not supported by the {profile} engine',
  'parse-only': 'is accepted but NOT executed by the {profile} engine',
  'unverified': 'is not documented as supported by the {profile} engine; confirm before relying on it'
};

function eventDefinitionName(definition) {
  return definition.$type.replace(/^bpmn:/, '').replace(/EventDefinition$/, '');
}

function keysFor(node) {
  const type = node.$type.replace(/^bpmn:/, '');

  if (node.$instanceOf('bpmn:Event')) {
    const definitions = node.eventDefinitions || [];
    let eventType = type;

    if (type === 'StartEvent' && node.$parent && node.$parent.triggeredByEvent) {
      eventType = 'EventSubProcessStart';
    }

    if (!definitions.length) {
      return [ `${eventType}.None` ];
    }

    return definitions.map(definition => `${eventType}.${eventDefinitionName(definition)}`);
  }

  if (type === 'SubProcess' && node.triggeredByEvent) {
    return [ 'EventSubProcess' ];
  }

  const keys = [ type ];

  if (node.$instanceOf('bpmn:Activity') && node.isForCompensation) {
    keys.push('CompensationHandler');
  }

  return keys;
}

module.exports = function(config = {}) {
  const matrix = config.matrix || {};
  const fallback = config.fallback || 'unverified';
  const report = config.report || [ 'unsupported' ];
  const profile = config.profile || 'selected';

  function check(node, reporter) {
    if (!node.$instanceOf('bpmn:FlowElement') &&
        !node.$instanceOf('bpmn:Artifact') &&
        !node.$instanceOf('bpmn:LoopCharacteristics')) {
      return;
    }

    for (const key of keysFor(node)) {
      const status = key in matrix ? matrix[key] : fallback;

      if (report.includes(status)) {
        const id = node.id || (node.$parent && node.$parent.id);

        reporter.report(id, `<${key}> ${MESSAGES[status].replace('{profile}', profile)}`);
      }
    }
  }

  return { check };
};

module.exports.keysFor = keysFor;
