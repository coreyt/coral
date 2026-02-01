import { useState, useCallback, useEffect, useMemo } from 'react';
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

import { parseCoralDSL, parseMermaidDSL, type GraphNode, type GraphEdge } from './parsers';

const elk = new ELK();

// Sample Coral DSL
const sampleCoralDSL = `// Error Handling Flowchart
// Try editing this code!

service "Loading URL failed"
service "Check console for errors"
module "Is JSON correct?"
service "Raise GitHub issue"
module "Someone sent link?"
service "Ask for complete link"
module "Copied complete URL?"
service "Check browser Timeline"

loading_url_failed -> check_console_for_errors
check_console_for_errors -> is_json_correct
is_json_correct -> raise_github_issue
is_json_correct -> someone_sent_link
someone_sent_link -> ask_for_complete_link
someone_sent_link -> copied_complete_url
copied_complete_url -> raise_github_issue
copied_complete_url -> check_browser_timeline
`;

// Sample Mermaid DSL
const sampleMermaidDSL = `flowchart TD
    A[Loading URL failed] --> B[Check console for errors]
    B --> C{Is JSON correct?}
    C -->|Yes| D[Raise GitHub issue]
    C -->|No| E{Someone sent link?}
    E -->|Yes| F[Ask for complete link]
    E -->|No| G{Copied complete URL?}
    G -->|Yes| D
    G -->|No| H[Check browser Timeline]
`;

type DSLType = 'coral' | 'mermaid';

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
  group: {
    background: '#fafafa',
    border: '2px dashed #9e9e9e',
    borderRadius: '8px',
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
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[]
): Promise<Node[]> {
  if (graphNodes.length === 0) {
    console.log('No nodes to layout');
    return [];
  }

  console.log('Laying out', graphNodes.length, 'nodes and', graphEdges.length, 'edges');

  try {
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
    console.log('ELK layout complete:', layouted);

    return graphNodes.map((node) => {
      const elkNode = layouted.children?.find((n) => n.id === node.id);
      return {
        id: node.id,
        type: 'coral',
        position: { x: elkNode?.x || 0, y: elkNode?.y || 0 },
        data: { label: node.label, nodeType: node.type },
      };
    });
  } catch (err) {
    console.error('ELK layout error:', err);
    // Fallback: simple grid layout
    return graphNodes.map((node, i) => ({
      id: node.id,
      type: 'coral',
      position: { x: (i % 3) * 200, y: Math.floor(i / 3) * 100 },
      data: { label: node.label, nodeType: node.type },
    }));
  }
}

// Convert edges to React Flow format
function convertEdges(graphEdges: GraphEdge[]): Edge[] {
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

// Line numbers component
function LineNumbers({ count }: { count: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '40px',
        paddingTop: '12px',
        paddingRight: '8px',
        textAlign: 'right',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.5',
        color: '#999',
        backgroundColor: '#f8f8f8',
        borderRight: '1px solid #e0e0e0',
        userSelect: 'none',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i + 1}>{i + 1}</div>
      ))}
    </div>
  );
}

export default function App() {
  const [dslType, setDslType] = useState<DSLType>('mermaid');
  const [dsl, setDsl] = useState(sampleMermaidDSL);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [debugInfo, setDebugInfo] = useState('');

  // Switch DSL type
  const handleDslTypeChange = useCallback((newType: DSLType) => {
    setDslType(newType);
    setDsl(newType === 'coral' ? sampleCoralDSL : sampleMermaidDSL);
  }, []);

  // Parse DSL and layout
  const updateDiagram = useCallback(async (text: string, type: DSLType) => {
    setLoading(true);

    const result = type === 'coral' ? parseCoralDSL(text) : parseMermaidDSL(text);
    console.log('Parse result:', result);
    setParseErrors(result.errors);
    setDebugInfo(`Parsed: ${result.nodes.length} nodes, ${result.edges.length} edges`);

    if (result.nodes.length > 0) {
      const layoutedNodes = await layoutNodes(result.nodes, result.edges);
      console.log('Layouted nodes:', layoutedNodes);
      setNodes(layoutedNodes);
      setEdges(convertEdges(result.edges));
    } else {
      setNodes([]);
      setEdges([]);
    }
    setLoading(false);
  }, [setNodes, setEdges]);

  // Initial load
  useEffect(() => {
    updateDiagram(dsl, dslType);
  }, []);

  // Debounced update on DSL change
  useEffect(() => {
    const timeout = setTimeout(() => {
      updateDiagram(dsl, dslType);
    }, 300);
    return () => clearTimeout(timeout);
  }, [dsl, dslType, updateDiagram]);

  const lineCount = useMemo(() => dsl.split('\n').length, [dsl]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '18px', margin: 0 }}>Coral Split Editor Demo</h1>
          <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0' }}>
            Edit DSL on the left, see the diagram update on the right
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500 }}>DSL Format:</label>
          <select
            value={dslType}
            onChange={(e) => handleDslTypeChange(e.target.value as DSLType)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              background: '#fff',
            }}
          >
            <option value="mermaid">Mermaid</option>
            <option value="coral">Coral DSL</option>
          </select>
        </div>
      </div>

      {/* Split View */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Text Editor Pane */}
        <div
          style={{
            width: '40%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #ddd',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: '#fafafa',
              borderBottom: '1px solid #eee',
              fontSize: '12px',
              fontWeight: 500,
              color: '#666',
            }}
          >
            {dslType === 'coral' ? 'Coral DSL' : 'Mermaid Flowchart'}
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>
            <LineNumbers count={lineCount} />
            <textarea
              value={dsl}
              onChange={(e) => setDsl(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%',
                height: '100%',
                padding: '12px 12px 12px 52px',
                border: 'none',
                outline: 'none',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                resize: 'none',
                backgroundColor: '#fff',
              }}
            />
          </div>
          {/* Debug/Error Panel */}
          <div
            style={{
              padding: '8px 12px',
              background: parseErrors.length > 0 ? '#ffebee' : '#e8f5e9',
              borderTop: '1px solid #eee',
              fontSize: '12px',
              color: parseErrors.length > 0 ? '#c62828' : '#2e7d32',
            }}
          >
            {parseErrors.length > 0 ? (
              parseErrors.map((err, i) => (
                <div key={i}>Line {err.line}: {err.message}</div>
              ))
            ) : (
              <div>{debugInfo}</div>
            )}
          </div>
        </div>

        {/* Visual Editor Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '8px 12px',
              background: '#fafafa',
              borderBottom: '1px solid #eee',
              fontSize: '12px',
              fontWeight: 500,
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            Visual Diagram
            {loading && (
              <span style={{ color: '#999', fontWeight: 400 }}>
                (updating...)
              </span>
            )}
            <span style={{ marginLeft: 'auto', color: '#999', fontWeight: 400 }}>
              {nodes.length} nodes, {edges.length} edges
            </span>
          </div>
          <div style={{ flex: 1 }}>
            {nodes.length > 0 ? (
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
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#999',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div>No diagram to display</div>
                <div style={{ fontSize: '12px' }}>Check the DSL syntax or add some nodes</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
