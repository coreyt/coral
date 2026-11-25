/**
 * Edit Context
 *
 * Provides label editing callbacks to React Flow nodes.
 * This is necessary because React Flow doesn't pass custom callbacks directly to nodes.
 */

import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from 'react';

/**
 * Callback type for label edits
 */
export type OnLabelEditCallback = (nodeId: string, newLabel: string) => void;

/**
 * Edit context value
 */
interface EditContextValue {
  /** Callback when a node label is edited */
  onLabelEdit?: OnLabelEditCallback;
  /** ID of the node currently being edited (only one at a time) */
  editingNodeId: string | null;
  /** Start editing a node */
  startEditing: (nodeId: string) => void;
  /** Stop editing */
  stopEditing: () => void;
}

const EditContext = createContext<EditContextValue>({
  onLabelEdit: undefined,
  editingNodeId: null,
  startEditing: () => {},
  stopEditing: () => {},
});

/**
 * Props for EditProvider
 */
export interface EditProviderProps {
  children: ReactNode;
  onLabelEdit?: OnLabelEditCallback;
}

/**
 * Provider component for edit context
 */
export function EditProvider({ children, onLabelEdit }: EditProviderProps): React.ReactElement {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const startEditing = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingNodeId(null);
  }, []);
  const value = useMemo(() => ({ onLabelEdit, editingNodeId, startEditing, stopEditing }),
    [onLabelEdit, editingNodeId, startEditing, stopEditing]);

  return (
    <EditContext.Provider value={value}>
      {children}
    </EditContext.Provider>
  );
}

/**
 * Hook to access edit context
 */
export function useEditContext(): EditContextValue {
  return useContext(EditContext);
}

/**
 * Hook to check if a specific node is being edited
 */
export function useIsEditing(nodeId: string): boolean {
  const { editingNodeId } = useEditContext();
  return editingNodeId === nodeId;
}
