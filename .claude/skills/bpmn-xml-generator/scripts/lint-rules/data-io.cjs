'use strict';

/**
 * Structural checks on BPMN data I/O that bpmn-moddle accepts silently but the
 * BPMN 2.0 XSD / semantics reject.
 */
module.exports = function() {

  function check(node, reporter) {
    if (node.$instanceOf('bpmn:InputOutputSpecification')) {
      const owner = node.$parent && node.$parent.id;

      if (!(node.inputSets || []).length) {
        reporter.report(owner, '<ioSpecification> must contain at least one <inputSet>');
      }

      if (!(node.outputSets || []).length) {
        reporter.report(owner, '<ioSpecification> must contain at least one <outputSet>');
      }
    }

    if (node.$instanceOf('bpmn:DataAssociation')) {
      const owner = node.$parent && node.$parent.id;

      if (!node.targetRef) {
        reporter.report(owner, `<${node.$type.replace('bpmn:', '')}> has no resolvable <targetRef>`);
      }

      if (node.$instanceOf('bpmn:DataInputAssociation') && !(node.sourceRef || []).length &&
          !(node.assignment || []).length && !node.transformation) {
        reporter.report(owner, '<dataInputAssociation> needs a <sourceRef>, <transformation> or <assignment>');
      }
    }
  }

  return { check };
};
