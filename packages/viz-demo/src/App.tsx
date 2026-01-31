import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Sample Mermaid-style diagram data (the error handling flowchart)
const sampleGraph = {
  nodes: [
    { id: 'A', type: 'service', label: 'Loading URL failed' },
    { id: 'B', type: 'service', label: 'Check console for errors' },
    { id: 'C', type: 'module', label: 'Is JSON correct?' },
    { id: 'D', type: 'service', label: 'Raise GitHub issue' },
    { id: 'E', type: 'module', label: 'Someone sent link?' },
    { id: 'F', type: 'service', label: 'Ask for complete link' },
    { id: 'G', type: 'module', label: 'Copied complete URL?' },
    { id: 'H', type: 'service', label: 'Check browser Timeline' },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', label: 'Decode JSON' },
    { id: 'e2', source: 'B', target: 'C' },
    { id: 'e3', source: 'C', target: 'D', label: 'Yes' },
    { id: 'e4', source: 'C', target: 'E', label: 'No' },
    { id: 'e5', source: 'E', target: 'F', label: 'Yes' },
    { id: 'e6', source: 'E', target: 'G', label: 'No' },
    { id: 'e7', source: 'G', target: 'D', label: 'Yes' },
    { id: 'e8', source: 'G', target: 'H', label: 'No' },
  ],
};

// Node type styles
const nodeStyles: Record<string, React.CSSProperties> = {
  service: {
    background: '#e3f2fd',
    border: '2px solid #1976d2',
    borderRadius: '8px',
  },
  database: {
    background: '#fff3e0',
    border: '2px solid #f57c00',
    borderRadius: '8px 8px 16px 16px',
  },
  module: {
    background: '#f3e5f5',
    border: '2px solid #7b1fa2',
    borderRadius: '4px',
    transform: 'rotate(0deg)',
  },
  external_api: {
    background: '#ffebee',
    border: '2px solid #c62828',
    borderRadius: '8px',
    borderStyle: 'dashed',
  },
  actor: {
    background: '#e8f5e9',
    border: '2px solid #388e3c',
    borderRadius: '50%',
  },
};

// Custom node component
function CoralNode({ data }: NodeProps) {
  const nodeType = (data as any).nodeType || 'service';
  const style = nodeStyles[nodeType] || nodeStyles.service;

  return (
    <div
      style={{
        padding: '12px 16px',
        minWidth: '120px',
        textAlign: 'center',
        fontSize: '12px',
        fontWeight: 500,
        ...style,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div>{(data as any).label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  coral: CoralNode,
};

// ELK layout function
async function layoutNodes(
  graphNodes: typeof sampleGraph.nodes,
  graphEdges: typeof sampleGraph.edges
): Promise<Node[]> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
    },
    children: graphNodes.map((n) => ({
      id: n.id,
      width: 150,
      height: 50,
    })),
    edges: graphEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layouted = await elk.layout(elkGraph);

  return graphNodes.map((node) => {
    const elkNode = layouted.children?.find((n) => n.id === node.id);
    return {
      id: node.id,
      type: 'coral',
      position: { x: elkNode?.x || 0, y: elkNode?.y || 0 },
      data: { label: node.label, nodeType: node.type },
    };
  });
}

// Convert edges to React Flow format
function convertEdges(graphEdges: typeof sampleGraph.edges): Edge[] {
  return graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#666' },
    labelStyle: { fontSize: 11, fill: '#666' },
  }));
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const layoutedNodes = await layoutNodes(sampleGraph.nodes, sampleGraph.edges);
      setNodes(layoutedNodes);
      setEdges(convertEdges(sampleGraph.edges));
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Computing layout...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ padding: '12px 16px', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <h1 style={{ fontSize: '18px', margin: 0 }}>Coral Visual Editor Demo</h1>
        <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0' }}>
          Mermaid flowchart → ELK layout → React Flow rendering
        </p>
      </div>
      <div style={{ width: '100%', height: 'calc(100vh - 60px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
