#!/usr/bin/env node
// Adds (or regenerates) the BPMNDiagram section.
//
//   node layout.mjs <input.bpmn> [output.bpmn]     (in place when output is omitted)
//
// 1. bpmn-auto-layout lays out every process (sub-processes become drill-down planes);
//    any existing diagram interchange (DI) section is replaced.
// 2. Post-processing fills the gaps of bpmn-auto-layout:
//    - several boundary events on one activity are spread along its bottom edge
//      (bpmn-auto-layout stacks them on top of each other);
//    - data objects/stores are moved next to the activity that uses them and data
//      associations get edges;
//    - text annotations, associations and groups get shapes/edges
//      (bpmn-auto-layout ignores artifacts). A group is drawn around the flow node whose
//      name equals the group's category value, otherwise around the whole process.
//    Known limit: elements inside sub-processes are drawn in drill-down planes, so an
//    association between nested elements declared at process level (e.g. compensation)
//    is not rendered by bpmn-js until the sub-process is expanded in a modeler.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BpmnModdle } from 'bpmn-moddle';
import { layoutProcess } from 'bpmn-auto-layout';

const ANNOTATION = { width: 140, height: 50, gap: 60 };
const GROUP_PADDING = 25;
const BOUNDARY_GAP = 10;
const DATA_GAP = 40;

function center(bounds) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function indexDiagram(definitions) {
  const shapes = new Map();
  const edges = new Map();

  for (const diagram of definitions.diagrams || []) {
    const plane = diagram.plane;

    for (const element of plane.planeElement || []) {
      const id = element.bpmnElement && element.bpmnElement.id;

      if (!id) {
        continue;
      }

      if (element.$instanceOf('bpmndi:BPMNShape')) {
        shapes.set(id, { shape: element, plane });
      } else {
        edges.set(id, { edge: element, plane });
      }
    }
  }

  return { shapes, edges };
}

function allElements(container, result = []) {
  for (const element of [ ...(container.flowElements || []), ...(container.artifacts || []) ]) {
    result.push(element);

    if (element.flowElements) {
      allElements(element, result);
    }
  }

  return result;
}

function spreadBoundaryEvents(elements, index) {
  const byHost = new Map();

  for (const element of elements) {
    if (element.$instanceOf('bpmn:BoundaryEvent') && element.attachedToRef && index.shapes.has(element.id)) {
      const hostId = element.attachedToRef.id;

      byHost.set(hostId, [ ...(byHost.get(hostId) || []), element ]);
    }
  }

  for (const [ hostId, boundaries ] of byHost) {
    const host = index.shapes.get(hostId);

    if (!host || boundaries.length < 2) {
      continue;
    }

    const hostBounds = host.shape.bounds;
    const hostCenterX = hostBounds.x + hostBounds.width / 2;
    const size = index.shapes.get(boundaries[0].id).shape.bounds.width;
    const spacing = Math.max(hostBounds.width / (boundaries.length + 1), size + BOUNDARY_GAP);

    boundaries.forEach((boundary, i) => {
      const bounds = index.shapes.get(boundary.id).shape.bounds;
      const oldCenterX = bounds.x + bounds.width / 2;
      const newCenterX = hostCenterX + (i - (boundaries.length - 1) / 2) * spacing;

      bounds.x = newCenterX - bounds.width / 2;
      bounds.y = hostBounds.y + hostBounds.height - bounds.height / 2;

      for (const flow of boundary.outgoing || []) {
        const entry = index.edges.get(flow.id);
        const points = entry && entry.edge.waypoint;

        if (!points || !points.length) {
          continue;
        }

        // keep orthogonal routes orthogonal: move every leading point on the old vertical line
        for (const point of points) {
          if (Math.abs(point.x - oldCenterX) > 0.5) {
            break;
          }

          point.x = newCenterX;
        }

        points[0].y = bounds.y + bounds.height;
      }
    });
  }
}

function addShape(moddle, plane, element, bounds) {
  const shape = moddle.create('bpmndi:BPMNShape', {
    id: `${element.id}_di`,
    bpmnElement: element,
    bounds: moddle.create('dc:Bounds', bounds)
  });

  plane.get('planeElement').push(shape);

  return shape;
}

function addEdge(moddle, plane, element, points) {
  const edge = moddle.create('bpmndi:BPMNEdge', {
    id: `${element.id}_di`,
    bpmnElement: element,
    waypoint: points.map(point => moddle.create('dc:Point', point))
  });

  plane.get('planeElement').push(edge);

  return edge;
}

function addArtifacts(moddle, process, elements, index) {
  const artifacts = elements.filter(element => element.$instanceOf('bpmn:Artifact'));
  const rootPlane = index.processPlane;

  // text annotations: above the element they annotate
  for (const annotation of artifacts.filter(element => element.$instanceOf('bpmn:TextAnnotation'))) {
    if (index.shapes.has(annotation.id)) {
      continue;
    }

    const association = artifacts.find(element =>
      element.$instanceOf('bpmn:Association') &&
      (element.targetRef === annotation || element.sourceRef === annotation));
    const other = association && (association.sourceRef === annotation ? association.targetRef : association.sourceRef);
    const anchor = other && index.shapes.get(other.id);
    const plane = anchor ? anchor.plane : rootPlane;
    const base = anchor ? anchor.shape.bounds : { x: 0, y: ANNOTATION.gap * 2, width: 0, height: 0 };

    let y = base.y - ANNOTATION.height - ANNOTATION.gap;

    if (y < 0) {
      y = base.y + base.height + ANNOTATION.gap;
    }

    const shape = addShape(moddle, plane, annotation, {
      x: base.x + base.width / 2 + 20, y, width: ANNOTATION.width, height: ANNOTATION.height
    });

    index.shapes.set(annotation.id, { shape, plane });
  }

  // associations: straight line between the two shapes (same plane only)
  for (const association of artifacts.filter(element => element.$instanceOf('bpmn:Association'))) {
    if (index.edges.has(association.id) || !association.sourceRef || !association.targetRef) {
      continue;
    }

    const source = index.shapes.get(association.sourceRef.id);
    const target = index.shapes.get(association.targetRef.id);

    if (!source || !target || source.plane !== target.plane) {
      continue;
    }

    const from = source.shape.bounds;
    const to = target.shape.bounds;
    const fromCenter = center(from);
    const toCenter = center(to);

    const start = { x: fromCenter.x, y: toCenter.y < from.y ? from.y : from.y + from.height };
    const end = { x: toCenter.x, y: start.y > to.y + to.height ? to.y + to.height : to.y };

    if (toCenter.y >= from.y && toCenter.y <= from.y + from.height) {
      start.y = fromCenter.y;
      end.y = toCenter.y;
      start.x = toCenter.x > fromCenter.x ? from.x + from.width : from.x;
      end.x = toCenter.x > fromCenter.x ? to.x : to.x + to.width;
    }

    const edge = addEdge(moddle, source.plane, association, [ start, end ]);

    index.edges.set(association.id, { edge, plane: source.plane });
  }

  // groups: around the node named like the group's category value, else around the process
  for (const group of artifacts.filter(element => element.$instanceOf('bpmn:Group'))) {
    if (index.shapes.has(group.id)) {
      continue;
    }

    const label = group.categoryValueRef && group.categoryValueRef.value;
    const named = label && elements.find(element =>
      element.$instanceOf('bpmn:FlowNode') && element.name === label && index.shapes.has(element.id));
    const members = named ? [ index.shapes.get(named.id).shape ] :
      (process.flowElements || []).map(element => index.shapes.get(element.id))
        .filter(entry => entry && entry.plane === rootPlane)
        .map(entry => entry.shape);

    if (!members.length) {
      continue;
    }

    const minX = Math.min(...members.map(shape => shape.bounds.x));
    const minY = Math.min(...members.map(shape => shape.bounds.y));
    const maxX = Math.max(...members.map(shape => shape.bounds.x + shape.bounds.width));
    const maxY = Math.max(...members.map(shape => shape.bounds.y + shape.bounds.height));

    const shape = addShape(moddle, rootPlane, group, {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_PADDING,
      width: maxX - minX + 2 * GROUP_PADDING,
      height: maxY - minY + 2 * GROUP_PADDING
    });

    index.shapes.set(group.id, { shape, plane: rootPlane });
  }
}

function addDataAssociations(moddle, elements, index) {
  const placed = new Set();

  for (const activity of elements.filter(element => element.$instanceOf('bpmn:Activity'))) {
    const host = index.shapes.get(activity.id);

    if (!host) {
      continue;
    }

    const links = [
      ...(activity.dataOutputAssociations || []).map(association => [ association, association.targetRef, 'out' ]),
      ...(activity.dataInputAssociations || []).map(association => [ association, (association.sourceRef || [])[0], 'in' ])
    ];

    links.forEach(([ association, data, direction ], i) => {
      const entry = data && index.shapes.get(data.id);

      if (!entry || entry.plane !== host.plane || index.edges.has(association.id)) {
        return;
      }

      const hostBounds = host.shape.bounds;
      const dataBounds = entry.shape.bounds;

      // move the data object/store next to the first activity that uses it
      if (!placed.has(data.id)) {
        placed.add(data.id);
        dataBounds.x = hostBounds.x + hostBounds.width / 2 - dataBounds.width / 2 + i * (dataBounds.width + 20);
        dataBounds.y = hostBounds.y - dataBounds.height - DATA_GAP;

        if (dataBounds.y < 0) {
          dataBounds.y = hostBounds.y + hostBounds.height + DATA_GAP;
        }

        const label = entry.shape.label && entry.shape.label.bounds;

        if (label) {
          label.x = dataBounds.x + dataBounds.width / 2 - label.width / 2;
          label.y = dataBounds.y + dataBounds.height + 5;
        }
      }

      const above = dataBounds.y + dataBounds.height <= hostBounds.y;
      const hostPoint = {
        x: hostBounds.x + hostBounds.width / 2,
        y: above ? hostBounds.y : hostBounds.y + hostBounds.height
      };
      const dataPoint = {
        x: dataBounds.x + dataBounds.width / 2,
        y: above ? dataBounds.y + dataBounds.height : dataBounds.y
      };
      const points = direction === 'out' ? [ hostPoint, dataPoint ] : [ dataPoint, hostPoint ];
      const edge = addEdge(moddle, host.plane, association, points);

      index.edges.set(association.id, { edge, plane: host.plane });
    });
  }
}

export async function layout(xml) {
  const laidOut = await layoutProcess(xml);

  const moddle = new BpmnModdle();
  const { rootElement: definitions } = await moddle.fromXML(laidOut);

  for (const process of definitions.rootElements.filter(element => element.$instanceOf('bpmn:Process'))) {
    const index = indexDiagram(definitions);
    const diagram = (definitions.diagrams || []).find(candidate => candidate.plane.bpmnElement === process);

    if (!diagram) {
      continue;
    }

    index.processPlane = diagram.plane;

    const elements = allElements(process);

    spreadBoundaryEvents(elements, index);
    addDataAssociations(moddle, elements, index);
    addArtifacts(moddle, process, elements, index);
  }

  const { xml: result } = await moddle.toXML(definitions, { format: true });

  return result;
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
