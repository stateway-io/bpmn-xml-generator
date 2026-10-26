#!/usr/bin/env node
// Fails when install.sh does not download exactly the files that make up the skill.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, '.claude/skills/bpmn-xml-generator');

function walk(dir, result = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') {
      continue;
    }

    const full = path.join(dir, name);

    if (statSync(full).isDirectory()) {
      walk(full, result);
    } else {
      result.push(path.relative(SKILL, full).split(path.sep).join('/'));
    }
  }

  return result;
}

const installer = readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
const manifest = /FILES="\n([\s\S]*?)\n"/.exec(installer)[1].split('\n').map(line => line.trim()).filter(Boolean);

const onDisk = new Set(walk(SKILL));
const listed = new Set(manifest);

const missing = [ ...onDisk ].filter(file => !listed.has(file));
const stale = [ ...listed ].filter(file => !onDisk.has(file));

missing.forEach(file => console.log(`✖ not installed by install.sh: ${file}`));
stale.forEach(file => console.log(`✖ listed in install.sh but missing: ${file}`));

if (missing.length || stale.length) {
  process.exit(1);
}

console.log(`✔ install.sh manifest matches the skill (${listed.size} files)`);
