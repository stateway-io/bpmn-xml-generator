'use strict';

/**
 * Checks that expressions use the syntax of the selected engine profile.
 *
 * config = { style: 'stateway' | 'feel' | 'juel' }
 */

const STYLES = {
  stateway: {
    describe: '{{ ... }} (braces optional in conditions), never ${...}, #{...} or =FEEL',
    test: body => !/^\s*=/.test(body) && !/[$#]\{/.test(body)
  },
  feel: {
    describe: 'a FEEL expression prefixed with "=" (e.g. =amount > 1000)',
    test: body => /^\s*=/.test(body)
  },
  juel: {
    describe: 'a JUEL/UEL expression ${...} or #{...}',
    test: body => /^\s*[$#]\{[\s\S]*\}\s*$/.test(body) && !/\{\{/.test(body)
  }
};

function expressionsOf(node) {
  const found = [];

  if (node.$instanceOf('bpmn:SequenceFlow') && node.conditionExpression) {
    found.push([ 'conditionExpression', node.conditionExpression ]);
  }

  if (node.$instanceOf('bpmn:ConditionalEventDefinition') && node.condition) {
    found.push([ 'condition', node.condition ]);
  }

  if (node.$instanceOf('bpmn:MultiInstanceLoopCharacteristics') && node.completionCondition) {
    found.push([ 'completionCondition', node.completionCondition ]);
  }

  return found;
}

function ownerId(node) {
  let current = node;

  while (current && !current.id) {
    current = current.$parent;
  }

  return current && current.id;
}

module.exports = function(config = {}) {
  const style = STYLES[config.style];

  function check(node, reporter) {
    if (!style) {
      return;
    }

    for (const [ name, expression ] of expressionsOf(node)) {
      const body = (expression.body || '').trim();

      if (!body) {
        reporter.report(ownerId(node), `<${name}> is empty`);
      } else if (!style.test(body)) {
        reporter.report(ownerId(node), `<${name}> "${body}" must be ${style.describe}`);
      }
    }
  }

  return { check };
};
