/**
 * useAxisConstrain — Shift+drag axis-locked node movement
 *
 * Wraps React Flow's onNodesChange to constrain drag movement to a single
 * axis (horizontal or vertical) when the Shift key is held. The dominant
 * axis is detected after a small movement threshold.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { NodeChange, XYPosition, NodeBase } from '@xyflow/system';

/** Threshold in diagram-space units before locking to an axis */
const AXIS_LOCK_THRESHOLD = 5;

interface DragState {
  nodeId: string;
  startPos: XYPosition;
  axis: 'x' | 'y' | null;
}

export interface UseAxisConstrainResult<NodeType extends NodeBase = NodeBase> {
  /** Wrapped onNodesChange that applies axis constraints when Shift is held */
  onNodesChange: (changes: NodeChange<NodeType>[]) => void;
}

/**
 * Wraps onNodesChange to add Shift+drag axis constraint.
 *
 * @param originalOnNodesChange - The onNodesChange from useNodesState
 * @param nodes - Current nodes array (to read start positions)
 */
export function useAxisConstrain<NodeType extends NodeBase = NodeBase>(
  originalOnNodesChange: (changes: NodeChange<NodeType>[]) => void,
  nodes: NodeType[],
): UseAxisConstrainResult<NodeType> {
  const shiftHeld = useRef(false);
  const dragStates = useRef(new Map<string, DragState>());

  // Track Shift key globally
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { shiftHeld.current = false; dragStates.current.clear(); }
    };
    const onBlur = () => { shiftHeld.current = false; dragStates.current.clear(); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<NodeType>[]) => {
      if (!shiftHeld.current) {
        // No Shift held — pass through unmodified, reset drag state
        dragStates.current.clear();
        originalOnNodesChange(changes);
        return;
      }

      const modified = changes.map((change) => {
        if (change.type !== 'position') return change;

        const posChange = change as NodeChange<NodeType> & {
          type: 'position';
          id: string;
          position?: XYPosition;
          dragging?: boolean;
        };

        // Programmatic positions are not gestures. The terminal drag event
        // still uses the existing lock before that lock is released.
        if (posChange.dragging === undefined) return change;
        let state = dragStates.current.get(posChange.id);
        if (posChange.dragging === false) dragStates.current.delete(posChange.id);
        if (!posChange.position) return change;
        if (!state) {
          if (posChange.dragging === false) return change;
          const node = nodes.find((n) => n.id === posChange.id);
          if (!node) return change;
          state = { nodeId: posChange.id, startPos: { ...node.position }, axis: null };
          dragStates.current.set(posChange.id, state);
        }

        const dx = posChange.position.x - state.startPos.x;
        const dy = posChange.position.y - state.startPos.y;

        // Detect axis if not yet locked
        if (!state.axis) {
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx > AXIS_LOCK_THRESHOLD || absDy > AXIS_LOCK_THRESHOLD) {
            state.axis = absDx >= absDy ? 'x' : 'y';
          } else {
            // Below threshold — freeze in place
            return {
              ...posChange,
              position: { ...state.startPos },
            };
          }
        }

        // Apply axis constraint
        if (state.axis === 'x') {
          return {
            ...posChange,
            position: { x: posChange.position.x, y: state.startPos.y },
          };
        } else {
          return {
            ...posChange,
            position: { x: state.startPos.x, y: posChange.position.y },
          };
        }
      });

      originalOnNodesChange(modified as NodeChange<NodeType>[]);
    },
    [originalOnNodesChange, nodes],
  );

  return { onNodesChange };
}
