import { MyIcons029 } from './components/MyIcons029';
import { DiagramFontFaces } from '@coral-viz/viz';
import { CommandPalette } from './CommandPalette';
import { AuthoringDialog } from './AuthoringDialog';
import { RecoveryBanner } from './RecoveryBanner';
import { AppHeader } from './components/AppHeader';
import { SequencePane } from './components/SequencePane';
import { CanvasPane } from './components/CanvasPane';
import { EditorPane } from './components/EditorPane';
import { InspectorPane } from './components/InspectorPane';
import { PreferencesDialog } from './components/PreferencesDialog';
import type { useEditorController } from './useEditorController';
import { AboutDialog, HelpDialog, OpenFailureList, WelcomeDialog } from './GuidanceDialogs';
import { BottomPanel } from './BottomPanel';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ON_DEVICE_MODEL_AVAILABLE } from './releaseFeatures029';

// The on-device model loads only by dynamic import behind the build constant
// (R-066 AC-2); when the constant is off, nothing imports it.
const OnDevicePanel = ON_DEVICE_MODEL_AVAILABLE ? lazy(() => import('./onDeviceModel/ui/OnDevicePanel')) : null;
const OnDevicePreference = ON_DEVICE_MODEL_AVAILABLE ? lazy(() => import('./onDeviceModel/ui/OnDevicePreference')) : null;

export interface AppViewProps {
  controller: ReturnType<typeof useEditorController>;
}

/** Presentational shell; state and transitions belong to useEditorController. */
export function AppView({ controller }: AppViewProps) {
  const {
    edgeStyles,
    fontSettings,
    rasterExportError,
    recovery,
    header,
    themeName,
    workspace,
    editorWidthPct,
    editor,
    canvas,
    inspector,
    sequence,
    commandPalette,
    welcome,
    help,
    about,
    authoring,
    preferences,
  } = controller;
  const sourceGroupRef = useGroupRef();
  const sourcePanelRef = usePanelRef();
  const bottomPanelRef = usePanelRef();
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const propertiesInvokerRef = useRef<HTMLElement | null>(null);
  const [effectivePropertiesWidth, setEffectivePropertiesWidth] = useState(0);
  const bottomHeight = editor.diagnosticsCollapsed ? 30 : workspace.preferences.bottomHeightPx;

  useEffect(() => {
    sourceGroupRef.current?.setLayout({ source: editorWidthPct, canvas: 100 - editorWidthPct });
  }, [editorWidthPct, sourceGroupRef]);

  useEffect(() => {
    if (editor.diagnosticsCollapsed) bottomPanelRef.current?.collapse();
    else bottomPanelRef.current?.resize(workspace.preferences.bottomHeightPx);
  }, [bottomPanelRef, editor.diagnosticsCollapsed, workspace.preferences.bottomHeightPx]);

  useEffect(() => {
    const stage = canvasStageRef.current;
    if (!stage || !inspector) {
      setEffectivePropertiesWidth(0);
      return;
    }
    const update = () => setEffectivePropertiesWidth(
      stage.querySelector<HTMLElement>('[aria-label="Properties panel"]')?.getBoundingClientRect().width ?? 0,
    );
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    const panel = stage.querySelector<HTMLElement>('[aria-label="Properties panel"]');
    if (panel) observer.observe(panel);
    update();
    return () => observer.disconnect();
  }, [Boolean(inspector), workspace.preferences.propertiesWidthPx]);

  const closeProperties = (invoker?: HTMLElement) => {
    const restoreTarget = invoker ?? propertiesInvokerRef.current ?? inspector?.restoreFocusTo;
    header.onToggleInspector();
    propertiesInvokerRef.current = null;
    if (restoreTarget) queueMicrotask(() => restoreTarget.isConnected && restoreTarget.focus());
  };

  const toggleProperties = (invoker?: HTMLElement) => {
    if (inspector) {
      closeProperties(invoker);
      return;
    }
    propertiesInvokerRef.current = invoker ?? (document.activeElement as HTMLElement);
    header.onToggleInspector();
  };

  const resizePanelFromKeyboard = (
    event: ReactKeyboardEvent,
    panel: typeof sourcePanelRef,
    shrinkingKey: string,
    growingKey: string,
    persist: (size: { asPercentage: number; inPixels: number }) => void,
  ) => {
    if (event.key !== shrinkingKey && event.key !== growingKey) return;
    const handle = panel.current;
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const current = handle.getSize();
    const direction = event.key === shrinkingKey ? -1 : 1;
    handle.resize(`${current.inPixels + direction * (event.shiftKey ? 4 : 16)}px`);
    window.requestAnimationFrame(() => panel.current && persist(panel.current.getSize()));
  };

  const bottomTheme = {
    bg: editor.theme.editorBg,
    text: editor.theme.editorText,
    textMuted: editor.theme.lineNumbersText,
    border: editor.theme.lineNumbersBorder,
    errorText: editor.theme.errorText,
    warningText: editor.theme.warningText,
    hoverBg: editor.theme.controlBgHover,
    inputBg: editor.theme.editorBg,
    inputText: editor.theme.editorText,
    buttonBg: editor.theme.controlBgActive,
    buttonText: editor.theme.controlText,
    successText: 'var(--coral-success)',
    infoBg: editor.theme.lineNumbersBg,
    userBg: 'transparent',
    assistantBg: editor.theme.lineNumbersBg,
    codeBg: 'var(--coral-surface-subtle)',
  };

  return (
    <div
      data-coral-theme={themeName}
      className="coral-app-shell"
      style={{ display: 'flex', flexDirection: 'column' }}
      onDragOver={controller.shell.onDragOver}
      onDrop={controller.shell.onDrop}
    >
      <style>{edgeStyles}</style>
      <DiagramFontFaces settings={fontSettings} />
      {rasterExportError && (
        <div role="alert" className="coral-notice coral-notice--error" style={{ padding: '8px 16px' }}>
          {rasterExportError}
        </div>
      )}
      {controller.openFailure && !controller.welcome.isOpen && (
        <OpenFailureList failure={controller.openFailure} onDismiss={controller.onDismissOpenFailure} />
      )}
      <div
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
      >
        {controller.guidanceAnnouncement}
      </div>

      {recovery.hasData && recovery.data && (
        <RecoveryBanner
          recoveryData={recovery.data}
          onRecover={recovery.onRecover}
          onDiscard={recovery.onDiscard}
        />
      )}

      <AppHeader {...header} onToggleInspector={toggleProperties} />

      <Group
        orientation="vertical"
        className="coral-workspace"
        id="workspace-vertical"
        onLayoutChanged={(_layout, meta) => {
          if (!meta.isUserInteraction || !bottomPanelRef.current) return;
          const collapsed = bottomPanelRef.current.isCollapsed();
          if (collapsed !== editor.diagnosticsCollapsed) editor.onToggleDiagnostics();
          if (!collapsed) workspace.onBottomHeightChange(bottomPanelRef.current.getSize().inPixels);
        }}
      >
        <Panel id="upper" minSize={320}>
          <Group
            orientation="horizontal"
            className="coral-upper-workspace"
            id="workspace-horizontal"
            groupRef={sourceGroupRef}
            defaultLayout={{ source: editorWidthPct, canvas: 100 - editorWidthPct }}
            onLayoutChanged={(layout, meta) => {
              if (meta.isUserInteraction) workspace.onSourceWidthChange(layout.source);
            }}
          >
            <Panel id="source" panelRef={sourcePanelRef} minSize={240} maxSize={520}>
              <EditorPane {...editor} />
            </Panel>
            <Separator
              id="source-separator"
              aria-label="Resize source"
              className="coral-splitter coral-splitter--vertical"
              onKeyDownCapture={(event) => resizePanelFromKeyboard(
                event,
                sourcePanelRef,
                'ArrowLeft',
                'ArrowRight',
                (size) => workspace.onSourceWidthChange(size.asPercentage),
              )}
            />
            <Panel id="canvas" minSize={224}>
              <div
                ref={canvasStageRef}
                className="coral-canvas-stage"
                style={{ '--coral-properties-safe-width': `${effectivePropertiesWidth}px` } as CSSProperties}
              >
                {sequence
                  ? <SequencePane graph={sequence.graph} selected={sequence.selected} error={sequence.error}
                    onSelect={sequence.onSelect} theme={canvas.theme} themeMode={themeName === 'dark' ? 'dark' : 'light'} fontSettings={fontSettings}
                    renderStyle028={sequence.renderStyle028}
                    onRenderStyle028Change={sequence.onRenderStyle028Change}
                    updateStatus={canvas.updateStatus} />
                  : <CanvasPane {...canvas} />}
                {inspector && <InspectorPane
                  {...inspector}
                  sequence={sequence ?? undefined}
                  activeTab={workspace.preferences.propertiesTab}
                  onTabChange={workspace.onPropertiesTabChange}
                  widthPx={workspace.preferences.propertiesWidthPx}
                  onWidthChange={workspace.onPropertiesWidthChange}
                  onClose={closeProperties}
                />}
              </div>
            </Panel>
          </Group>
        </Panel>
        <Separator
          id="bottom-separator"
          aria-label="Resize bottom panel"
          className="coral-splitter coral-splitter--horizontal"
          onKeyDownCapture={(event) => resizePanelFromKeyboard(
            event,
            bottomPanelRef,
            'ArrowDown',
            'ArrowUp',
            (size) => workspace.onBottomHeightChange(size.inPixels),
          )}
        />
        <Panel
          id="bottom"
          panelRef={bottomPanelRef}
          defaultSize={bottomHeight}
          minSize={120}
          collapsedSize={30}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
        >
          <BottomPanel
            activeTab={editor.bottomPanelTab}
            onTabChange={editor.onBottomPanelTabChange}
            collapsed={editor.diagnosticsCollapsed}
            onToggleCollapsed={editor.onToggleDiagnostics}
            diagnosticEntries={editor.diagnosticEntries}
            onDiagnosticHover={editor.onDiagnosticHover}
            onAskAboutDiagnostic={editor.onAskAboutDiagnostic}
            canCheckConformance={editor.canCheckConformance}
            onCheckConformance={editor.onCheckConformance}
            notificationLevel={editor.notificationLevel}
            onNotificationLevelChange={editor.onNotificationLevelChange}
            conformanceReport={editor.conformanceReport}
            conformanceCheckError={editor.conformanceCheckError}
            conformanceNotChecked={editor.conformanceNotChecked}
            chatEntries={editor.chatEntries}
            turnCount={editor.turnCount}
            activityEntries={editor.activityEntries}
            isGenerating={editor.isGenerating}
            hasApiKey={editor.hasApiKey}
            onSubmit={editor.onPromptSubmit}
            submitDisabledReason={editor.promptDisabledReason}
            onCancelGeneration={editor.onCancelGeneration}
            onConfirmChatAction={editor.onConfirmChatAction}
            onCancelChatAction={editor.onCancelChatAction}
            onDevicePanel={OnDevicePanel && controller.onDevice.enabled
              ? <Suspense fallback={null}><OnDevicePanel host={controller.onDevice.host} /></Suspense> : undefined}
            theme={bottomTheme}
          />
        </Panel>
      </Group>

      <div role="status" className="coral-document-summary">
        {editor.dslType === 'coral' ? 'Coral DSL' : editor.dslType === 'mermaid'
          ? editor.sourceOwnedImport ? 'Mermaid source' : 'Mermaid'
          : editor.dslType === 'dot' ? 'DOT source' : 'PlantUML source'} · {canvas.nodes.length} nodes · {canvas.edges.length} edges · {canvas.notation} notation
      </div>

      <CommandPalette {...commandPalette} themeName={themeName} />
      {authoring && <AuthoringDialog {...authoring} themeName={themeName} />}
      <MyIcons029 {...controller.myIcons} />
      <PreferencesDialog {...preferences} themeName={themeName}
        onDeviceSection={OnDevicePreference ? <Suspense fallback={null}>
          <OnDevicePreference enabled={controller.onDevice.enabled} onEnabledChange={controller.onDevice.onEnabledChange}
            themeName={themeName} />
        </Suspense> : undefined} />
      <WelcomeDialog {...welcome} themeName={themeName} />
      <HelpDialog {...help} themeName={themeName} />
      <AboutDialog {...about} themeName={themeName} />
    </div>
  );
}
