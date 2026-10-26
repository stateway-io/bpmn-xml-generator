#!/usr/bin/env node
// Validates every XML code block in the skill's Markdown files.
//
//   ```xml profile=<core|stateway|camunda8|flowable>   complete document: validate.mjs
//                                                       with that profile (zero errors AND
//                                                       zero warnings) + layout smoke test
//   ```xml                                              snippet: must be well-formed XML
//
// Usage: node tests/run-examples.mjs   (after `npm ci` in the skill's scripts/ folder)

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, '.claude/skills/bpmn-xml-generator');
const SCRIPTS = path.join(SKILL, 'scripts');

const { validate } = await import(pathToFileURL(path.join(SCRIPTS, 'validate.mjs')));
const { layout } = await import(pathToFileURL(path.join(SCRIPTS, 'layout.mjs')));

const SNIPPET_NAMESPACES = [
  'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
  'xmlns:stateway="https://stateway.io/schema/bpmn/1.0"',
  'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"',
  'xmlns:modeler="http://camunda.org/schema/modeler/1.0"',
  'xmlns:flowable="http://flowable.org/bpmn"'
].join(' ');

const hasXmllint = !spawnSync('xmllint', [ '--version' ]).error;

function markdownFiles() {
  const files = [];

  for (const dir of [ SKILL, path.join(SKILL, 'references'), path.join(SKILL, 'profiles') ]) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.md')) {
        files.push(path.join(dir, name));
      }
    }
  }

  return files;
}

function codeBlocks(file) {
  const source = readFileSync(file, 'utf8');
  const blocks = [];
  const fence = /^```xml([^\n]*)\n([\s\S]*?)^```/gm;

  for (const match of source.matchAll(fence)) {
    const info = match[1].trim();
    const profile = /(?:^|\s)profile=([\w-]+)/.exec(info);
    const line = source.slice(0, match.index).split('\n').length;

    blocks.push({ file, line, profile: profile && profile[1], xml: match[2] });
  }

  return blocks;
}

const work = mkdtempSync(path.join(tmpdir(), 'bpmn-examples-'));
let failures = 0;
let documents = 0;
let snippets = 0;

for (const file of markdownFiles()) {
  for (const block of codeBlocks(file)) {
    const where = `${path.relative(ROOT, block.file)}:${block.line}`;
    const target = path.join(work, `block-${documents + snippets}.bpmn`);

    if (block.profile) {
      documents++;
      writeFileSync(target, block.xml);

      const result = await validate(target, { profile: block.profile });
      const problems = result.findings.filter(finding => finding.level !== 'info');

      try {
        await layout(block.xml);
      } catch (error) {
        problems.push({ level: 'error', source: 'layout', message: error.message });
      }

      if (problems.length) {
        failures++;
        console.log(`✖ ${where} [${block.profile}]`);
        problems.forEach(problem => console.log(`    ${problem.level} ${problem.source}${problem.id ? ' ' + problem.id + ':' : ''} ${problem.message}`));
      } else {
        console.log(`✔ ${where} [${block.profile}]`);
      }
    } else {
      snippets++;

      if (!hasXmllint) {
        continue;
      }

      const body = block.xml.replace(/^<\?xml[^>]*\?>\s*/, '');

      writeFileSync(target, `<snippet ${SNIPPET_NAMESPACES}>\n${body}\n</snippet>\n`);

      const result = spawnSync('xmllint', [ '--noout', target ], { encoding: 'utf8' });

      if (result.status !== 0) {
        failures++;
        console.log(`✖ ${where} [snippet]\n    ${result.stderr.trim().split('\n').join('\n    ')}`);
      }
    }
  }
}

console.log(`\n${documents} document(s), ${snippets} snippet(s)${hasXmllint ? '' : ' (snippets not checked: xmllint missing)'}, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
