/**
 * Shape Registry - Loads and provides access to shape definitions
 *
 * Shapes are the pure geometry layer: SVG paths, viewBox, port anchors.
 * They have no semantic meaning - that's added by symbols.
 *
 * Each shape includes sizing metadata (CORAL-REQ-011) for adaptive node sizing:
 * - textBoundsRatio: How much larger the shape needs to be than the text
 * - minSize: Minimum dimensions to prevent tiny nodes
 * - padding: Space between text and shape edges
 */

import type { ShapeDefinition, ShapeRegistry } from '../types.js';
import { freezeCatalog028 } from '../catalogFreeze028.js';

// Shape definitions with sizing metadata for adaptive node sizing
const shapes: ShapeDefinition[] = [
  {
    id: 'rectangle',
    name: 'Rectangle',
    type: 'polygon',
    viewBox: '0 0 100 60',
    path: 'M 0,0 L 100,0 L 100,60 L 0,60 Z',
    defaultSize: { width: 100, height: 60 },
    parameters: {
      cornerRadius: { type: 'number', default: 0, min: 0, max: 20, description: 'Radius for rounded corners' },
    },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.0, y: 1.0 },
      minSize: { width: 60, height: 30 },
      padding: { x: 16, y: 12 },
    },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    type: 'polygon',
    viewBox: '0 0 100 100',
    path: 'M 50,0 L 100,50 L 50,100 L 0,50 Z',
    defaultSize: { width: 100, height: 100 },
    parameters: {
      aspectRatio: { type: 'number', default: 1.0, min: 0.5, max: 2.0, description: 'Width to height ratio' },
    },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.45, y: 1.45 },
      minSize: { width: 80, height: 80 },
      padding: { x: 24, y: 24 },
    },
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    type: 'ellipse',
    viewBox: '0 0 100 60',
    path: 'M 50,0 A 50,30 0 1 1 50,60 A 50,30 0 1 1 50,0 Z',
    defaultSize: { width: 100, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.3, y: 1.3 },
      minSize: { width: 70, height: 40 },
      padding: { x: 20, y: 16 },
    },
  },
  {
    id: 'cylinder',
    name: 'Cylinder',
    type: 'compound',
    viewBox: '0 0 100 80',
    path: 'M 0,15 A 50,15 0 1 1 100,15 L 100,65 A 50,15 0 1 1 0,65 L 0,15 M 0,15 A 50,15 0 1 0 100,15',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.3 },
      minSize: { width: 60, height: 50 },
      padding: { x: 16, y: 20 },
    },
  },
  {
    id: 'parallelogram',
    name: 'Parallelogram',
    type: 'polygon',
    viewBox: '0 0 120 60',
    path: 'M 20,0 L 120,0 L 100,60 L 0,60 Z',
    defaultSize: { width: 120, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.25, y: 1.0 },
      minSize: { width: 80, height: 40 },
      padding: { x: 24, y: 12 },
    },
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    type: 'polygon',
    viewBox: '0 0 100 86',
    path: 'M 25,0 L 75,0 L 100,43 L 75,86 L 25,86 L 0,43 Z',
    defaultSize: { width: 100, height: 86 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
      { side: 'NORTH_EAST', position: 0.5 },
      { side: 'NORTH_WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.2, y: 1.1 },
      minSize: { width: 70, height: 60 },
      padding: { x: 20, y: 16 },
    },
  },
  {
    id: 'document',
    name: 'Document',
    type: 'path',
    viewBox: '0 0 100 70',
    path: 'M 0,0 L 100,0 L 100,55 Q 75,70 50,55 Q 25,40 0,55 L 0,0 Z',
    defaultSize: { width: 100, height: 70 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.0, y: 1.2 },
      minSize: { width: 60, height: 50 },
      padding: { x: 16, y: 16 },
    },
  },
  {
    id: 'stadium',
    name: 'Stadium',
    type: 'path',
    viewBox: '0 0 120 40',
    path: 'M 20,0 L 100,0 A 20,20 0 0 1 100,40 L 20,40 A 20,20 0 0 1 20,0 Z',
    defaultSize: { width: 120, height: 40 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.2, y: 1.0 },
      minSize: { width: 80, height: 30 },
      padding: { x: 24, y: 10 },
    },
  },
  {
    id: 'trapezoid',
    name: 'Trapezoid',
    type: 'polygon',
    viewBox: '0 0 100 60',
    path: 'M 10,0 L 90,0 L 100,60 L 0,60 Z',
    defaultSize: { width: 100, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.15, y: 1.0 },
      minSize: { width: 70, height: 40 },
      padding: { x: 20, y: 12 },
    },
  },
  {
    id: 'triangle',
    name: 'Triangle',
    type: 'polygon',
    viewBox: '0 0 100 86',
    path: 'M 50,0 L 100,86 L 0,86 Z',
    defaultSize: { width: 100, height: 86 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.25 },
      { side: 'SOUTH', position: 0.75 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.5, y: 1.5 },
      minSize: { width: 80, height: 70 },
      padding: { x: 24, y: 30 },
    },
  },
  {
    id: 'cloud',
    name: 'Cloud',
    type: 'path',
    viewBox: '0 0 120 80',
    path: 'M 25,60 A 25,25 0 1 1 25,20 A 30,30 0 0 1 60,10 A 25,25 0 0 1 95,25 A 25,25 0 0 1 100,60 A 20,20 0 0 1 80,70 L 40,70 A 20,20 0 0 1 25,60 Z',
    defaultSize: { width: 120, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.4, y: 1.4 },
      minSize: { width: 80, height: 60 },
      padding: { x: 24, y: 20 },
    },
  },
  {
    id: 'note',
    name: 'Note',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 0,0 L 80,0 L 100,20 L 100,80 L 0,80 Z M 80,0 L 80,20 L 100,20',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.4 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.6 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.1 },
      minSize: { width: 60, height: 50 },
      padding: { x: 16, y: 16 },
    },
  },
  {
    id: 'text-box',
    name: 'Text Box',
    type: 'polygon',
    viewBox: '0 0 100 40',
    path: 'M 0,0 L 100,0 L 100,40 L 0,40 Z',
    defaultSize: { width: 100, height: 40 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.0, y: 1.0 },
      minSize: { width: 60, height: 24 },
      padding: { x: 8, y: 4 },
    },
  },
  {
    id: 'actor',
    name: 'Actor',
    type: 'compound',
    viewBox: '0 0 60 100',
    path: 'M 30,20 A 10,10 0 1 1 30,0 A 10,10 0 1 1 30,20 M 30,20 L 30,60 M 10,35 L 50,35 M 30,60 L 10,100 M 30,60 L 50,100',
    defaultSize: { width: 60, height: 100 },
    strokeOnly: true,
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.25 },
      { side: 'SOUTH', position: 0.75 },
      { side: 'EAST', position: 0.35 },
      { side: 'WEST', position: 0.35 },
    ],
    // Actor is stroke-only, text typically goes below not inside
    sizing: {
      textBoundsRatio: { x: 1.0, y: 1.0 },
      minSize: { width: 50, height: 80 },
      padding: { x: 8, y: 8 },
    },
  },
  {
    id: 'subroutine',
    name: 'Subroutine',
    type: 'compound',
    viewBox: '0 0 100 60',
    path: 'M 0,0 L 100,0 L 100,60 L 0,60 Z M 10,0 L 10,60 M 90,0 L 90,60',
    defaultSize: { width: 100, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.15, y: 1.0 },
      minSize: { width: 70, height: 40 },
      padding: { x: 24, y: 12 },
    },
  },
  // ========================================================================
  // AI/ML Shapes
  // ========================================================================
  {
    id: 'brain',
    name: 'Brain',
    type: 'path',
    viewBox: '0 0 100 90',
    path: 'M 50,0 C 25,0 10,15 10,35 C 5,38 0,45 0,55 C 0,70 12,80 25,80 L 25,85 C 25,88 28,90 30,90 L 70,90 C 72,90 75,88 75,85 L 75,80 C 88,80 100,70 100,55 C 100,45 95,38 90,35 C 90,15 75,0 50,0 M 50,0 L 50,90',
    defaultSize: { width: 100, height: 90 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.3, y: 1.2 },
      minSize: { width: 80, height: 70 },
      padding: { x: 20, y: 20 },
    },
  },
  {
    id: 'cube',
    name: 'Cube',
    type: 'path',
    viewBox: '0 0 100 100',
    path: 'M 20,25 L 80,25 L 100,0 L 40,0 Z M 80,25 L 80,85 L 100,60 L 100,0 Z M 20,25 L 80,25 L 80,85 L 20,85 Z',
    defaultSize: { width: 100, height: 100 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.3, y: 1.3 },
      minSize: { width: 80, height: 80 },
      padding: { x: 20, y: 24 },
    },
  },
  {
    id: 'chip',
    name: 'Chip',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 15,0 L 15,5 L 25,5 L 25,0 M 35,0 L 35,5 L 45,5 L 45,0 M 55,0 L 55,5 L 65,5 L 65,0 M 75,0 L 75,5 L 85,5 L 85,0 M 15,80 L 15,75 L 25,75 L 25,80 M 35,80 L 35,75 L 45,75 L 45,80 M 55,80 L 55,75 L 65,75 L 65,80 M 75,80 L 75,75 L 85,75 L 85,80 M 0,15 L 5,15 L 5,25 L 0,25 M 0,35 L 5,35 L 5,45 L 0,45 M 0,55 L 5,55 L 5,65 L 0,65 M 100,15 L 95,15 L 95,25 L 100,25 M 100,35 L 95,35 L 95,45 L 100,45 M 100,55 L 95,55 L 95,65 L 100,65 M 5,5 L 95,5 L 95,75 L 5,75 Z',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.1 },
      minSize: { width: 80, height: 60 },
      padding: { x: 16, y: 16 },
    },
  },
  {
    id: 'chat-bubble',
    name: 'Chat Bubble',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 10,0 L 90,0 C 95,0 100,5 100,10 L 100,55 C 100,60 95,65 90,65 L 30,65 L 10,80 L 15,65 L 10,65 C 5,65 0,60 0,55 L 0,10 C 0,5 5,0 10,0 Z',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.4 },
      { side: 'WEST', position: 0.4 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.25 },
      minSize: { width: 70, height: 55 },
      padding: { x: 16, y: 14 },
    },
  },
  {
    id: 'shield',
    name: 'Shield',
    type: 'path',
    viewBox: '0 0 80 100',
    path: 'M 40,0 C 25,0 10,5 0,15 L 0,45 C 0,70 15,88 40,100 C 65,88 80,70 80,45 L 80,15 C 70,5 55,0 40,0 Z',
    defaultSize: { width: 80, height: 100 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.35 },
      { side: 'WEST', position: 0.35 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.35, y: 1.3 },
      minSize: { width: 60, height: 75 },
      padding: { x: 16, y: 20 },
    },
  },
  {
    id: 'neural-net',
    name: 'Neural Net',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 10,10 L 90,10 M 10,30 L 90,30 M 10,50 L 90,50 M 10,70 L 90,70 M 30,10 L 20,30 M 30,10 L 40,30 M 50,10 L 40,30 M 50,10 L 60,30 M 70,10 L 60,30 M 70,10 L 80,30 M 20,30 L 30,50 M 40,30 L 30,50 M 40,30 L 50,50 M 60,30 L 50,50 M 60,30 L 70,50 M 80,30 L 70,50 M 30,50 L 40,70 M 50,50 L 40,70 M 50,50 L 60,70 M 70,50 L 60,70 M 0,0 L 100,0 L 100,80 L 0,80 Z',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.1 },
      minSize: { width: 80, height: 60 },
      padding: { x: 16, y: 14 },
    },
  },
  {
    id: 'gear',
    name: 'Gear',
    type: 'path',
    viewBox: '0 0 100 100',
    path: 'M 43,0 L 57,0 L 60,12 L 72,6 L 80,16 L 70,25 L 82,32 L 100,43 L 100,57 L 88,60 L 94,72 L 84,80 L 75,70 L 68,82 L 57,100 L 43,100 L 40,88 L 28,94 L 20,84 L 30,75 L 18,68 L 0,57 L 0,43 L 12,40 L 6,28 L 16,20 L 25,30 L 32,18 Z M 50,30 A 20,20 0 1 0 50,70 A 20,20 0 1 0 50,30 Z',
    defaultSize: { width: 100, height: 100 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.6, y: 1.6 },
      minSize: { width: 70, height: 70 },
      padding: { x: 24, y: 24 },
    },
  },
  // ========================================================================
  // Data Engineering Shapes
  // ========================================================================
  {
    id: 'funnel',
    name: 'Funnel',
    type: 'path',
    viewBox: '0 0 100 90',
    path: 'M 0,0 L 100,0 L 100,15 L 60,60 L 60,90 L 40,90 L 40,60 L 0,15 Z',
    defaultSize: { width: 100, height: 90 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.3 },
      { side: 'WEST', position: 0.3 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.2, y: 1.3 },
      minSize: { width: 70, height: 60 },
      padding: { x: 20, y: 16 },
    },
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 0,25 L 50,0 L 100,25 L 100,80 L 0,80 Z M 0,25 L 100,25',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.65 },
      { side: 'WEST', position: 0.65 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.3 },
      minSize: { width: 70, height: 55 },
      padding: { x: 16, y: 20 },
    },
  },
  {
    id: 'lake',
    name: 'Lake',
    type: 'path',
    viewBox: '0 0 100 80',
    path: 'M 0,15 C 10,10 20,20 30,15 C 40,10 50,20 60,15 C 70,10 80,20 90,15 C 95,12 100,15 100,15 L 100,65 A 50,15 0 1 1 0,65 L 0,15 Z',
    defaultSize: { width: 100, height: 80 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.3 },
      minSize: { width: 60, height: 50 },
      padding: { x: 16, y: 20 },
    },
  },
  {
    id: 'pipe',
    name: 'Pipe',
    type: 'path',
    viewBox: '0 0 120 40',
    path: 'M 0,0 L 10,0 L 10,5 L 110,5 L 110,0 L 120,0 L 120,40 L 110,40 L 110,35 L 10,35 L 10,40 L 0,40 Z',
    defaultSize: { width: 120, height: 40 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.15, y: 1.0 },
      minSize: { width: 80, height: 30 },
      padding: { x: 20, y: 10 },
    },
  },
  {
    id: 'wave',
    name: 'Wave',
    type: 'path',
    viewBox: '0 0 120 50',
    path: 'M 0,25 C 15,5 30,5 45,25 C 60,45 75,45 90,25 C 97,15 105,10 120,15 L 120,35 C 105,40 97,35 90,25 C 75,45 60,45 45,25 C 30,5 15,5 0,25 Z',
    defaultSize: { width: 120, height: 50 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.2, y: 1.3 },
      minSize: { width: 80, height: 35 },
      padding: { x: 20, y: 12 },
    },
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    type: 'compound',
    viewBox: '0 0 100 70',
    path: 'M 0,0 L 100,0 L 100,70 L 0,70 Z M 10,55 L 10,35 L 25,35 L 25,55 M 35,55 L 35,20 L 50,20 L 50,55 M 60,55 L 60,40 L 75,40 L 75,55 M 80,55 L 80,25 L 95,25 L 95,55',
    defaultSize: { width: 100, height: 70 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.0, y: 1.2 },
      minSize: { width: 70, height: 50 },
      padding: { x: 16, y: 14 },
    },
  },
  // ========================================================================
  // Sketch (Hand-Drawn) Shapes
  // ========================================================================
  {
    id: 'sketch-rounded-rect',
    name: 'Sketch Rounded Rectangle',
    type: 'path',
    viewBox: '0 0 120 50',
    path: 'M 12,1 C 40,-1 80,2 108,1 C 114,1 119,5 119,11 C 120,18 119,32 119,39 C 119,45 115,49 109,49 C 80,50 40,48 12,49 C 6,49 1,45 1,39 C 0,32 1,18 1,11 C 1,5 5,0 12,1 Z',
    defaultSize: { width: 120, height: 50 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.1, y: 1.1 },
      minSize: { width: 80, height: 36 },
      padding: { x: 20, y: 14 },
    },
  },
  {
    id: 'sketch-rect',
    name: 'Sketch Rectangle',
    type: 'path',
    viewBox: '0 0 100 60',
    path: 'M 1,2 C 25,0 75,1 99,1 C 100,15 99,45 99,59 C 75,60 25,59 1,59 C 0,45 1,15 1,2 Z',
    defaultSize: { width: 100, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.05, y: 1.05 },
      minSize: { width: 70, height: 40 },
      padding: { x: 16, y: 12 },
    },
  },
  {
    id: 'sketch-oval',
    name: 'Sketch Oval',
    type: 'path',
    viewBox: '0 0 100 60',
    path: 'M 50,1 C 75,0 98,12 99,30 C 100,48 77,60 50,59 C 23,60 1,48 0,30 C -1,12 24,0 50,1 Z',
    defaultSize: { width: 100, height: 60 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.3, y: 1.3 },
      minSize: { width: 70, height: 40 },
      padding: { x: 20, y: 16 },
    },
  },
  {
    id: 'sketch-diamond',
    name: 'Sketch Diamond',
    type: 'path',
    viewBox: '0 0 100 100',
    path: 'M 50,1 C 55,10 75,25 99,49 C 90,55 75,75 51,99 C 45,90 25,75 1,51 C 10,45 25,25 50,1 Z',
    defaultSize: { width: 100, height: 100 },
    portAnchors: [
      { side: 'NORTH', position: 0.5 },
      { side: 'SOUTH', position: 0.5 },
      { side: 'EAST', position: 0.5 },
      { side: 'WEST', position: 0.5 },
    ],
    sizing: {
      textBoundsRatio: { x: 1.45, y: 1.45 },
      minSize: { width: 80, height: 80 },
      padding: { x: 24, y: 24 },
    },
  },
];

// Build shape map for fast lookup
const shapeMap = new Map<string, ShapeDefinition>();
shapes.forEach((shape) => shapeMap.set(shape.id, shape));
freezeCatalog028(shapes);

/**
 * Shape registry implementation
 */
export const shapeRegistry: ShapeRegistry = {
  get(id: string): ShapeDefinition | undefined {
    return shapeMap.get(id);
  },

  getAll(): ShapeDefinition[] {
    return shapes;
  },

  has(id: string): boolean {
    return shapeMap.has(id);
  },
};

/**
 * Get a shape by ID (convenience function)
 */
export function getShape(id: string): ShapeDefinition | undefined {
  return shapeRegistry.get(id);
}

/**
 * Get all available shapes
 */
export function getAllShapes(): ShapeDefinition[] {
  return shapeRegistry.getAll();
}

export default shapeRegistry;
