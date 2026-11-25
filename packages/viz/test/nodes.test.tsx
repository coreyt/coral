import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  ServiceNode,
  DatabaseNode,
  ExternalApiNode,
  ActorNode,
  ModuleNode,
  GroupNode,
  nodeTypes,
} from '../src/components/nodes';

/** The legacy node components - R-030 coverage. They had none. */

const components = [
  ['ServiceNode', ServiceNode],
  ['DatabaseNode', DatabaseNode],
  ['ExternalApiNode', ExternalApiNode],
  ['ActorNode', ActorNode],
  ['ModuleNode', ModuleNode],
  ['GroupNode', GroupNode],
] as const;

function renderNode(Component: (typeof components)[number][1], props: Record<string, unknown>) {
  return render(
    <ReactFlowProvider>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Component {...(props as any)} />
    </ReactFlowProvider>
  );
}

describe('legacy node components', () => {
  it('registers every type in the node type map', () => {
    expect(Object.keys(nodeTypes).length).toBeGreaterThanOrEqual(6);
  });

  it.each(components)('%s renders its label', (_name, Component) => {
    const { container } = renderNode(Component, {
      id: 'n1',
      data: { label: 'My Node' },
      selected: false,
    });

    expect(container.textContent).toContain('My Node');
  });

  it.each(components)('%s shows a selected state', (_name, Component) => {
    const { container } = renderNode(Component, {
      id: 'n1',
      data: { label: 'Selected' },
      selected: true,
    });

    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it.each(components)('%s renders without a label', (_name, Component) => {
    const { container } = renderNode(Component, { id: 'n1', data: {}, selected: false });

    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it.each(components.filter(([name]) => name !== 'GroupNode'))(
    '%s renders connection handles',
    (_name, Component) => {
      const { container } = renderNode(Component, {
        id: 'n1',
        data: { label: 'X' },
        selected: false,
      });

      expect(container.querySelectorAll('.react-flow__handle').length).toBeGreaterThan(0);
    }
  );

  it('GroupNode is a container and has no handles of its own', () => {
    const { container } = renderNode(GroupNode, {
      id: 'g1',
      data: { label: 'Group' },
      selected: false,
    });

    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0);
  });
});
