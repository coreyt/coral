/**
 * BPMN Symbols (Business Process Model and Notation)
 */

import type { SymbolLibrary } from '../types';

export const bpmnSymbols: SymbolLibrary = {
  id: 'bpmn',
  name: 'BPMN Symbols',
  version: '1.0.0',
  description: 'Business Process Model and Notation 2.0 symbols',
  symbols: [
    // Events
    {
      id: 'bpmn-start-event',
      name: 'Start Event',
      description: 'Beginning of a process',
      shape: 'ellipse',
      tags: ['event', 'start'],
      defaults: { fill: '#ffffff', stroke: '#4caf50', strokeWidth: 2, width: 36, height: 36 },
      ports: [{ id: 'out', anchor: 'EAST', direction: 'out' }],
    },
    {
      id: 'bpmn-end-event',
      name: 'End Event',
      description: 'End of a process',
      shape: 'ellipse',
      tags: ['event', 'end'],
      defaults: { fill: '#ffffff', stroke: '#f44336', strokeWidth: 4, width: 36, height: 36 },
      ports: [{ id: 'in', anchor: 'WEST', direction: 'in' }],
    },
    {
      id: 'bpmn-intermediate-event',
      name: 'Intermediate Event',
      description: 'Event occurring during process execution',
      shape: 'ellipse',
      tags: ['event', 'intermediate'],
      variants: {
        catch: { name: 'Catch Event', defaults: { stroke: '#ff9800' } },
        throw: { name: 'Throw Event', defaults: { stroke: '#9c27b0' } },
      },
      defaults: { fill: '#ffffff', stroke: '#2196f3', strokeWidth: 2, width: 36, height: 36 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out', anchor: 'EAST', direction: 'out' },
      ],
    },
    // Activities
    {
      id: 'bpmn-task',
      name: 'Task',
      description: 'A unit of work',
      shape: 'rectangle',
      tags: ['activity', 'task'],
      variants: {
        user: { name: 'User Task', icon: 'user', defaults: { fill: '#e3f2fd' } },
        service: { name: 'Service Task', icon: 'gear', defaults: { fill: '#f3e5f5' } },
        script: { name: 'Script Task', icon: 'code', defaults: { fill: '#fff3e0' } },
        manual: { name: 'Manual Task', icon: 'hand', defaults: { fill: '#e8f5e9' } },
      },
      defaults: { fill: '#ffffff', stroke: '#1976d2', strokeWidth: 2, cornerRadius: 10 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out', anchor: 'EAST', direction: 'out' },
      ],
    },
    {
      id: 'bpmn-subprocess',
      name: 'Sub-Process',
      description: 'A compound activity containing other activities',
      shape: 'rectangle',
      tags: ['activity', 'subprocess', 'container'],
      isContainer: true,
      defaults: { fill: '#fafafa', stroke: '#1976d2', strokeWidth: 2, cornerRadius: 10, width: 200, height: 120 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out', anchor: 'EAST', direction: 'out' },
      ],
    },
    // Gateways
    {
      id: 'bpmn-gateway-exclusive',
      name: 'Exclusive Gateway',
      description: 'XOR split/join - one path only',
      shape: 'diamond',
      tags: ['gateway', 'branching', 'exclusive', 'xor'],
      marker: 'X',
      defaults: { fill: '#ffffff', stroke: '#ff9800', strokeWidth: 2, width: 50, height: 50 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out1', anchor: 'EAST', direction: 'out' },
        { id: 'out2', anchor: 'SOUTH', direction: 'out' },
        { id: 'out3', anchor: 'NORTH', direction: 'out' },
      ],
    },
    {
      id: 'bpmn-gateway-parallel',
      name: 'Parallel Gateway',
      description: 'AND split/join - all paths',
      shape: 'diamond',
      tags: ['gateway', 'parallel', 'and'],
      marker: '+',
      defaults: { fill: '#ffffff', stroke: '#4caf50', strokeWidth: 2, width: 50, height: 50 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out1', anchor: 'EAST', direction: 'out' },
        { id: 'out2', anchor: 'SOUTH', direction: 'out' },
        { id: 'out3', anchor: 'NORTH', direction: 'out' },
      ],
    },
    {
      id: 'bpmn-gateway-inclusive',
      name: 'Inclusive Gateway',
      description: 'OR split/join - one or more paths',
      shape: 'diamond',
      tags: ['gateway', 'inclusive', 'or'],
      marker: 'O',
      defaults: { fill: '#ffffff', stroke: '#9c27b0', strokeWidth: 2, width: 50, height: 50 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out1', anchor: 'EAST', direction: 'out' },
        { id: 'out2', anchor: 'SOUTH', direction: 'out' },
        { id: 'out3', anchor: 'NORTH', direction: 'out' },
      ],
    },
    {
      id: 'bpmn-gateway-event',
      name: 'Event-Based Gateway',
      description: 'Path determined by events',
      shape: 'diamond',
      tags: ['gateway', 'event'],
      marker: 'pentagon',
      defaults: { fill: '#ffffff', stroke: '#2196f3', strokeWidth: 2, width: 50, height: 50 },
      ports: [
        { id: 'in', anchor: 'WEST', direction: 'in' },
        { id: 'out1', anchor: 'EAST', direction: 'out' },
        { id: 'out2', anchor: 'SOUTH', direction: 'out' },
      ],
    },
    // Data Objects
    {
      id: 'bpmn-data-object',
      name: 'Data Object',
      description: 'Data used or produced by activities',
      shape: 'document',
      tags: ['data', 'artifact'],
      defaults: { fill: '#ffffff', stroke: '#607d8b', strokeWidth: 1 },
      ports: [{ id: 'ref', anchor: 'WEST', direction: 'inout' }],
    },
    {
      id: 'bpmn-data-store',
      name: 'Data Store',
      description: 'Persistent data storage',
      shape: 'cylinder',
      tags: ['data', 'storage', 'artifact'],
      defaults: { fill: '#ffffff', stroke: '#607d8b', strokeWidth: 1 },
      ports: [{ id: 'ref', anchor: 'NORTH', direction: 'inout' }],
    },
    // Swimlanes
    {
      id: 'bpmn-pool',
      name: 'Pool',
      description: 'A participant in a process',
      shape: 'rectangle',
      tags: ['container', 'participant', 'pool'],
      isContainer: true,
      defaults: { fill: '#fafafa', stroke: '#424242', strokeWidth: 2, width: 600, height: 200 },
      ports: [],
    },
    {
      id: 'bpmn-lane',
      name: 'Lane',
      description: 'A subdivision of a pool',
      shape: 'rectangle',
      tags: ['container', 'lane'],
      isContainer: true,
      defaults: { fill: '#ffffff', stroke: '#bdbdbd', strokeWidth: 1, width: 600, height: 100 },
      ports: [],
    },
  ],
};
