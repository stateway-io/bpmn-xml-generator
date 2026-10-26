#!/usr/bin/env node
// Validates a BPMN 2.0 XML file against the core spec and an engine profile.
//
//   node validate.mjs <file.bpmn> [--profile core|stateway|camunda8|flowable]
//                     [--engine-version 8.8] [--require-di] [--no-xsd] [--json]
//
// Layers (all run; findings are merged):
//   1. namespaces  – only BPMN/DI namespaces plus the profile's own extension namespace
//   2. moddle      – bpmn-moddle parse with the profile's extension descriptor
//                    (unknown elements/attributes, unresolved references, duplicate ids)
//   3. xsd         – xmllint against the OMG BPMN 2.0 XSD (child order, required children);
//                    skipped with a notice when xmllint is not installed
//   4. lint        – bpmnlint "recommended" + profile rules (engine support matrix,
//                    expression syntax, engine configuration; camunda-compat for Camunda 8)
//
// Exit code: 0 when there are no errors (warnings allowed), 1 on errors, 2 on usage errors.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { BpmnModdle } from 'bpmn-moddle';
import { Linter } from 'bpmnlint';

import { CORE_NAMESPACES, PROFILES } from './profiles.mjs';

const require = createRequire(import.meta.url);
const NodeResolver = require('bpmnlint/lib/resolver/node-resolver');

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const XSD = path.join(SCRIPTS_DIR, 'xsd', 'BPMN20.xsd');

const LOCAL_RULES = {
  'engine-support': require('./lint-rules/engine-support.cjs'),
  'engine-support-caution': require('./lint-rules/engine-support.cjs'),
  'expression-syntax': require('./lint-rules/expression-syntax.cjs'),
  'data-io': require('./lint-rules/data-io.cjs'),
  'stateway-config': require('./lint-rules/stateway-config.cjs'),
  'flowable-config': require('./lint-rules/flowable-config.cjs')
};

// recommended rules that conflict with what the core layer deliberately supports
const CORE_RULE_OVERRIDES = {
  'no-inclusive-gateway': 'off',
  'no-complex-gateway': 'warn',
  'local/data-io': 'error'
};

function createResolver() {
  const nodeResolver = new NodeResolver({ require });

  return {
    resolveRule(pkg, ruleName) {
      if (pkg === 'bpmnlint-plugin-local') {
        const rule = LOCAL_RULES[ruleName];

        if (!rule) {
          throw new Error(`unknown local rule <${ruleName}>`);
        }

        return rule;
      }

      return nodeResolver.resolveRule(pkg, ruleName);
    },
    resolveConfig(pkg, configName) {
      return nodeResolver.resolveConfig(pkg, configName);
    }
  };
}

function checkNamespaces(xml, profileName, profile) {
  const findings = [];
  const allowed = new Set([ ...CORE_NAMESPACES, ...profile.namespaces ]);
  const declarations = xml.matchAll(/\sxmlns(?::([\w.-]+))?\s*=\s*["']([^"']*)["']/g);

  for (const [ , prefix = '(default)', uri ] of declarations) {
    if (!allowed.has(uri)) {
      findings.push({
        level: 'error',
        source: 'namespace',
        message: `${prefix}="${uri}" is not allowed for profile "${profileName}"` +
          (profileName === 'core' ? ' (core output must not contain engine extensions)' : '')
      });
    }
  }

  return findings;
}

async function checkModdle(xml, profile) {
  const moddle = new BpmnModdle(profile.moddleExtensions);

  try {
    const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');

    return {
      rootElement,
      findings: warnings.map(warning => ({
        level: 'error',
        source: 'moddle',
        message: warning.message.replace(/\s*\n\s*/g, ' ')
      }))
    };
  } catch (error) {
    return {
      rootElement: null,
      findings: [ { level: 'error', source: 'moddle', message: `cannot parse: ${error.message}` } ]
    };
  }
}

function checkXsd(file) {
  const probe = spawnSync('xmllint', [ '--version' ], { encoding: 'utf8' });

  if (probe.error) {
    return [ { level: 'info', source: 'xsd', message: 'xmllint not installed; XSD validation skipped' } ];
  }

  const result = spawnSync('xmllint', [ '--noout', '--schema', XSD, file ], { encoding: 'utf8' });

  return result.stderr
    .split('\n')
    .filter(line => line.trim() && !/ (validates|fails to validate)$/.test(line))
    .map(line => ({
      level: 'error',
      source: 'xsd',
      message: line
        .replace(/^.*?:(\d+):\s*element [\w:]+: Schemas validity error : /, 'line $1: ')
        .replace(/\{http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL\}/g, 'bpmn:')
    }));
}

async function checkLint(rootElement, profile, options) {
  const extendsList = [ 'bpmnlint:recommended' ];

  if (typeof profile.extends === 'function') {
    extendsList.push(...profile.extends(options.engineVersion || profile.defaultVersion));
  } else {
    extendsList.push(...profile.extends);
  }

  const hasDi = (rootElement.diagrams || []).length > 0;

  const config = {
    extends: extendsList,
    rules: {
      ...CORE_RULE_OVERRIDES,
      'no-bpmndi': hasDi || options.requireDi ? 'error' : 'off',
      ...profile.rules
    }
  };

  const linter = new Linter({ config, resolver: createResolver() });
  const results = await linter.lint(rootElement);
  const findings = [];

  for (const [ rule, reports ] of Object.entries(results)) {
    for (const report of reports) {
      findings.push({
        level: report.category === 'error' || report.category === 'rule-error' ? 'error' :
          report.category === 'warn' ? 'warning' : 'info',
        source: `lint:${rule}`,
        id: report.id,
        message: report.message
      });
    }
  }

  return findings;
}

export async function validate(file, options = {}) {
  const profileName = options.profile || 'core';
  const profile = PROFILES[profileName];

  if (!profile) {
    throw new Error(`unknown profile "${profileName}" (expected one of: ${Object.keys(PROFILES).join(', ')})`);
  }

  const xml = readFileSync(file, 'utf8');
  const findings = [ ...checkNamespaces(xml, profileName, profile) ];

  const { rootElement, findings: moddleFindings } = await checkModdle(xml, profile);
  findings.push(...moddleFindings);

  if (options.xsd !== false) {
    findings.push(...checkXsd(file));
  }

  if (rootElement) {
    findings.push(...await checkLint(rootElement, profile, options));
  }

  return {
    file,
    profile: profileName,
    errors: findings.filter(finding => finding.level === 'error').length,
    warnings: findings.filter(finding => finding.level === 'warning').length,
    findings
  };
}

function parseArgs(argv) {
  const options = { xsd: true };
  const files = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--profile') options.profile = argv[++i];
    else if (arg === '--engine-version') options.engineVersion = argv[++i];
    else if (arg === '--require-di') options.requireDi = true;
    else if (arg === '--no-xsd') options.xsd = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else files.push(arg);
  }

  return { options, files };
}

function print(result) {
  const icons = { error: '✖', warning: '⚠', info: 'ℹ' };

  console.log(`${result.file} [profile: ${result.profile}]`);

  for (const finding of result.findings) {
    const where = finding.id ? ` ${finding.id}:` : '';

    console.log(`  ${icons[finding.level]} ${finding.level.padEnd(7)} ${finding.source}${where} ${finding.message}`);
  }

  console.log(`  → ${result.errors} error(s), ${result.warnings} warning(s)\n`);
}

async function main() {
  const { options, files } = parseArgs(process.argv.slice(2));

  if (options.help || !files.length) {
    console.log('usage: node validate.mjs <file.bpmn>... [--profile core|stateway|camunda8|flowable] ' +
      '[--engine-version 8.8] [--require-di] [--no-xsd] [--json]');
    process.exit(options.help ? 0 : 2);
  }

  const results = [];

  for (const file of files) {
    results.push(await validate(file, options));
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    results.forEach(print);
  }

  process.exit(results.some(result => result.errors) ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exit(2);
  });
}
