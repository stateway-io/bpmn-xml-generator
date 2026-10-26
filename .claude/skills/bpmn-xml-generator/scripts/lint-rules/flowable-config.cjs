'use strict';

/**
 * Flowable-specific configuration checks, derived from the Flowable Open Source
 * BPMN user guide (BPMN constructs: service, http, external worker, DMN tasks).
 */

function fields(node) {
  const values = (node.extensionElements && node.extensionElements.values) || [];
  const result = {};

  for (const field of values.filter(value => value.$instanceOf('flowable:Field'))) {
    result[field.name] = field.stringValue || field.expression || field.string || '';
  }

  return result;
}

const REQUIRED_FIELDS = {
  http: [ 'requestMethod', 'requestUrl' ],
  mail: [ 'to' ]
};

module.exports = function() {

  function check(node, reporter) {
    if (!node.$instanceOf('bpmn:ServiceTask') && !node.$instanceOf('bpmn:SendTask')) {
      return;
    }

    const kind = node.$type.replace('bpmn:', '');
    const type = node.get('flowable:type');
    const implementations = [ 'flowable:class', 'flowable:delegateExpression', 'flowable:expression', 'flowable:type' ]
      .filter(name => node.get(name));

    if (implementations.length !== 1) {
      reporter.report(node.id, `${kind} needs exactly one of flowable:class, flowable:delegateExpression, flowable:expression or flowable:type (found ${implementations.length})`);
    }

    const taskFields = fields(node);

    for (const name of REQUIRED_FIELDS[type] || []) {
      if (!(name in taskFields)) {
        reporter.report(node.id, `flowable:type="${type}" requires <flowable:field name="${name}">`);
      }
    }

    if (type === 'dmn' && !('decisionTableReferenceKey' in taskFields) && !('decisionServiceReferenceKey' in taskFields)) {
      reporter.report(node.id, 'flowable:type="dmn" requires a decisionTableReferenceKey (or decisionServiceReferenceKey) field');
    }

    if (type === 'external-worker' && !node.get('flowable:topic')) {
      reporter.report(node.id, 'flowable:type="external-worker" requires flowable:topic');
    }
  }

  return { check };
};
