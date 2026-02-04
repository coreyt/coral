/**
 * Coral Code Design - VS Code Extension
 *
 * Phase 4 placeholder. This extension will embed @coral-code-design/core
 * in a webview and provide VS Code integration.
 */

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Coral Code Design extension activated');

  // Register commands
  const openDiagramCommand = vscode.commands.registerCommand(
    'coral.openDiagram',
    () => {
      vscode.window.showInformationMessage(
        'Coral Code Design: Phase 4 (VS Code Extension) not yet implemented'
      );
    }
  );

  const revealInDiagramCommand = vscode.commands.registerCommand(
    'coral.revealInDiagram',
    () => {
      vscode.window.showInformationMessage(
        'Coral Code Design: Reveal in Diagram not yet implemented'
      );
    }
  );

  context.subscriptions.push(openDiagramCommand, revealInDiagramCommand);
}

export function deactivate() {
  console.log('Coral Code Design extension deactivated');
}
