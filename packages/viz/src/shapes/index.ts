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

import type { ShapeDefinition, ShapeRegistry } from '../types';

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
];

// Build shape map for fast lookup
const shapeMap = new Map<string, ShapeDefinition>();
shapes.forEach((shape) => shapeMap.set(shape.id, shape));

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
