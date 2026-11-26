import { useEffect, useRef } from 'react';
import { useEditorController } from '../../src/useEditorController';

/** Explicitly open Properties for historical tests of its editing controls. */
export function useEditorControllerWithProperties() {
  const controller = useEditorController();
  const opened = useRef(false);
  const open = controller.header.onToggleInspector;
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    open();
  }, [open]);
  return controller;
}
