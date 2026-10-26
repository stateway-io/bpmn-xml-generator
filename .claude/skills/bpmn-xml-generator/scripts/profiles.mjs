// Engine profiles used by validate.mjs.
//
// Each support matrix entry is one of:
//   supported   – documented as executable by the engine
//   parse-only  – accepted at deploy time but not executed
//   unverified  – not covered by the engine documentation; warn
//   unsupported – rejected or ignored by the engine; error
//
// Keys: '<ElementType>' or '<EventType>.<EventDefinition>' ('.None' for no definition),
// plus 'EventSubProcess', 'EventSubProcessStart.<Definition>' and 'CompensationHandler'.
// Keep the matrices in sync with the support tables in ../profiles/*.md.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

export const CORE_NAMESPACES = [
  'http://www.omg.org/spec/BPMN/20100524/MODEL',
  'http://www.omg.org/spec/BPMN/20100524/DI',
  'http://www.omg.org/spec/DD/20100524/DC',
  'http://www.omg.org/spec/DD/20100524/DI',
  'http://www.w3.org/2001/XMLSchema-instance',
  'http://www.w3.org/2001/XMLSchema'
];

const ARTIFACTS = {
  'TextAnnotation': 'supported',
  'Association': 'supported',
  'Group': 'supported'
};

const STATEWAY_MATRIX = {
  ...ARTIFACTS,
  'StartEvent.None': 'supported',
  'StartEvent.Timer': 'supported',
  'StartEvent.Message': 'unverified',
  'StartEvent.Signal': 'unverified',
  'EndEvent.None': 'supported',
  'EndEvent.Terminate': 'supported',
  'EndEvent.Signal': 'supported',
  'EndEvent.Message': 'supported',
  'IntermediateCatchEvent.Timer': 'supported',
  'IntermediateCatchEvent.Message': 'supported',
  'IntermediateCatchEvent.Signal': 'supported',
  'IntermediateThrowEvent.None': 'supported',
  'IntermediateThrowEvent.Message': 'supported',
  'IntermediateThrowEvent.Signal': 'supported',
  'BoundaryEvent.Timer': 'supported',
  'BoundaryEvent.Error': 'supported',
  'BoundaryEvent.Message': 'supported',
  'BoundaryEvent.Signal': 'supported',
  'Task': 'supported',
  'UserTask': 'supported',
  'ServiceTask': 'supported',
  'SendTask': 'supported',
  'BusinessRuleTask': 'supported',
  'ScriptTask': 'parse-only',
  'ReceiveTask': 'parse-only',
  'CallActivity': 'supported',
  'SubProcess': 'supported',
  'ExclusiveGateway': 'supported',
  'InclusiveGateway': 'supported',
  'ParallelGateway': 'supported',
  'EventBasedGateway': 'parse-only',
  'ComplexGateway': 'unsupported',
  'SequenceFlow': 'supported',
  'DataObject': 'supported',
  'DataObjectReference': 'supported',
  'DataStoreReference': 'supported'
};

const FLOWABLE_MATRIX = {
  ...ARTIFACTS,
  'StartEvent.None': 'supported',
  'StartEvent.Timer': 'supported',
  'StartEvent.Message': 'supported',
  'StartEvent.Signal': 'supported',
  'StartEvent.Conditional': 'unverified',
  'EventSubProcessStart.Timer': 'supported',
  'EventSubProcessStart.Message': 'supported',
  'EventSubProcessStart.Signal': 'supported',
  'EventSubProcessStart.Error': 'supported',
  'EventSubProcessStart.Escalation': 'unverified',
  'EventSubProcessStart.Conditional': 'unverified',
  'EndEvent.None': 'supported',
  'EndEvent.Terminate': 'supported',
  'EndEvent.Error': 'supported',
  'EndEvent.Cancel': 'supported',
  'EndEvent.Escalation': 'unverified',
  'EndEvent.Message': 'unverified',
  'EndEvent.Signal': 'unverified',
  'IntermediateCatchEvent.Timer': 'supported',
  'IntermediateCatchEvent.Message': 'supported',
  'IntermediateCatchEvent.Signal': 'supported',
  'IntermediateCatchEvent.Conditional': 'unverified',
  'IntermediateCatchEvent.Link': 'unverified',
  'IntermediateThrowEvent.None': 'supported',
  'IntermediateThrowEvent.Signal': 'supported',
  'IntermediateThrowEvent.Compensate': 'supported',
  'IntermediateThrowEvent.Escalation': 'unverified',
  'IntermediateThrowEvent.Message': 'unverified',
  'IntermediateThrowEvent.Link': 'unverified',
  'BoundaryEvent.Timer': 'supported',
  'BoundaryEvent.Error': 'supported',
  'BoundaryEvent.Message': 'supported',
  'BoundaryEvent.Signal': 'supported',
  'BoundaryEvent.Cancel': 'supported',
  'BoundaryEvent.Compensate': 'supported',
  'BoundaryEvent.Escalation': 'unverified',
  'BoundaryEvent.Conditional': 'unverified',
  'Task': 'supported',
  'UserTask': 'supported',
  'ServiceTask': 'supported',
  'SendTask': 'supported',
  'ReceiveTask': 'supported',
  'ScriptTask': 'supported',
  'ManualTask': 'supported',
  'BusinessRuleTask': 'supported',
  'CallActivity': 'supported',
  'SubProcess': 'supported',
  'EventSubProcess': 'supported',
  'Transaction': 'supported',
  'AdHocSubProcess': 'unverified',
  'CompensationHandler': 'supported',
  'MultiInstanceLoopCharacteristics': 'supported',
  'StandardLoopCharacteristics': 'unsupported',
  'ExclusiveGateway': 'supported',
  'InclusiveGateway': 'supported',
  'ParallelGateway': 'supported',
  'EventBasedGateway': 'supported',
  'ComplexGateway': 'unsupported',
  'SequenceFlow': 'supported',
  'DataObject': 'supported',
  'DataObjectReference': 'supported',
  'DataStoreReference': 'unverified'
};

function supportRules(profile, matrix) {
  return {
    'local/engine-support': [ 'error', { profile, matrix, fallback: 'unsupported', report: [ 'unsupported' ] } ],
    'local/engine-support-caution': [ 'warn', { profile, matrix, fallback: 'unsupported', report: [ 'parse-only', 'unverified' ] } ]
  };
}

export const PROFILES = {
  core: {
    label: 'BPMN 2.0 core (no engine extensions)',
    namespaces: [],
    moddleExtensions: {},
    extends: [],
    rules: {}
  },

  stateway: {
    label: 'Stateway',
    namespaces: [ 'https://stateway.io/schema/bpmn/1.0' ],
    moddleExtensions: { stateway: readJson('./moddle/stateway.json') },
    extends: [],
    rules: {
      ...supportRules('Stateway', STATEWAY_MATRIX),
      'local/expression-syntax': [ 'error', { style: 'stateway' } ],
      'local/stateway-config': 'error'
    }
  },

  camunda8: {
    label: 'Camunda 8 (Zeebe)',
    namespaces: [
      'http://camunda.org/schema/zeebe/1.0',
      'http://camunda.org/schema/modeler/1.0'
    ],
    moddleExtensions: { zeebe: require('zeebe-bpmn-moddle/resources/zeebe.json') },
    // the camunda-compat config is resolved per target version, see configFor()
    extends: version => [ `plugin:camunda-compat/camunda-cloud-${version.replace('.', '-')}` ],
    rules: {
      'local/expression-syntax': [ 'error', { style: 'feel' } ]
    },
    defaultVersion: '8.8'
  },

  flowable: {
    label: 'Flowable',
    namespaces: [ 'http://flowable.org/bpmn' ],
    moddleExtensions: { flowable: readJson('./moddle/flowable.json') },
    extends: [],
    rules: {
      ...supportRules('Flowable', FLOWABLE_MATRIX),
      'local/expression-syntax': [ 'error', { style: 'juel' } ],
      'local/flowable-config': 'error'
    }
  }
};
