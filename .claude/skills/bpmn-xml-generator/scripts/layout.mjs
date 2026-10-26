#!/usr/bin/env node
// Adds (or regenerates) the BPMNDiagram section with bpmn-auto-layout.
//
//   node layout.mjs <input.bpmn> [output.bpmn]     (in place when output is omitted)
//
// bpmn-auto-layout lays out each process (sub-processes are expanded); any
// existing diagram interchange (DI) section is replaced.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { layoutProcess } from 'bpmn-auto-layout';

export async function layout(xml) {
  return layoutProcess(xml);
}

async function main() {
  const [ input, output = input ] = process.argv.slice(2);

  if (!input) {
    console.log('usage: node layout.mjs <input.bpmn> [output.bpmn]');
    process.exit(2);
  }

  const result = await layout(readFileSync(input, 'utf8'));

  writeFileSync(output, result, 'utf8');
  console.log(`Layout applied: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Layout failed: ${error.message}`);
    process.exit(1);
  });
}
