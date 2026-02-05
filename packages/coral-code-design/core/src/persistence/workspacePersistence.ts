/**
 * Workspace Persistence Utilities
 *
 * Functions for saving and loading workspace configuration to the filesystem.
 * All files are stored in .coral-code-design/ directory within the workspace root.
 */

import type { FileSystemAdapter } from '../providers/WorkspaceProvider';
import type { Workspace, NamedLayout, AnnotationStore } from '../types';

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = '.coral-code-design';
const WORKSPACE_FILE = 'workspace.json';
const LAYOUTS_DIR = 'layouts';
const ANNOTATIONS_FILE = 'annotations.json';
const SCHEMA_VERSION = '1.0.0';

// ============================================================================
// Workspace Config
// ============================================================================

/**
 * Persisted workspace config with schema version for migrations.
 */
interface PersistedWorkspace extends Workspace {
  schemaVersion: string;
}

/**
 * Save workspace configuration to .coral-code-design/workspace.json
 */
export async function saveWorkspaceConfig(
  fs: FileSystemAdapter,
  workspace: Workspace
): Promise<void> {
  const configDir = `${workspace.rootPath}/${CONFIG_DIR}`;
  const configPath = `${configDir}/${WORKSPACE_FILE}`;

  // Ensure directory exists
  if (!(await fs.exists(configDir))) {
    await fs.mkdir(configDir);
  }

  // Add schema version
  const persistedWorkspace: PersistedWorkspace = {
    ...workspace,
    schemaVersion: SCHEMA_VERSION,
  };

  await fs.writeFile(configPath, JSON.stringify(persistedWorkspace, null, 2));
}

/**
 * Load workspace configuration from .coral-code-design/workspace.json
 * Returns null if file doesn't exist or is corrupted.
 */
export async function loadWorkspaceConfig(
  fs: FileSystemAdapter,
  rootPath: string
): Promise<Workspace | null> {
  const configPath = `${rootPath}/${CONFIG_DIR}/${WORKSPACE_FILE}`;

  if (!(await fs.exists(configPath))) {
    return null;
  }

  try {
    const content = await fs.readFile(configPath);
    const parsed = JSON.parse(content) as PersistedWorkspace;

    // Strip schema version for internal use (migrations would go here)
    const { schemaVersion, ...workspace } = parsed;

    return workspace;
  } catch {
    // Corrupted or invalid JSON
    return null;
  }
}

// ============================================================================
// Layout Persistence
// ============================================================================

/**
 * Save a named layout to .coral-code-design/layouts/<id>.json
 */
export async function saveLayout(
  fs: FileSystemAdapter,
  rootPath: string,
  layout: NamedLayout
): Promise<void> {
  const layoutsDir = `${rootPath}/${CONFIG_DIR}/${LAYOUTS_DIR}`;

  // Ensure directories exist
  const configDir = `${rootPath}/${CONFIG_DIR}`;
  if (!(await fs.exists(configDir))) {
    await fs.mkdir(configDir);
  }
  if (!(await fs.exists(layoutsDir))) {
    await fs.mkdir(layoutsDir);
  }

  const layoutPath = `${layoutsDir}/${layout.id}.json`;
  await fs.writeFile(layoutPath, JSON.stringify(layout, null, 2));
}

/**
 * Delete a named layout file
 */
export async function deleteLayout(
  fs: FileSystemAdapter,
  rootPath: string,
  layoutId: string
): Promise<void> {
  const layoutPath = `${rootPath}/${CONFIG_DIR}/${LAYOUTS_DIR}/${layoutId}.json`;

  // We don't have a delete method in FileSystemAdapter, so we'll just write empty
  // In a real implementation, we'd need to add a delete method
  // For now, this is a no-op (layouts are managed in memory)
}

/**
 * Load all layouts from .coral-code-design/layouts/
 */
export async function loadLayouts(
  fs: FileSystemAdapter,
  rootPath: string
): Promise<NamedLayout[]> {
  const layoutsDir = `${rootPath}/${CONFIG_DIR}/${LAYOUTS_DIR}`;

  if (!(await fs.exists(layoutsDir))) {
    return [];
  }

  const layouts: NamedLayout[] = [];

  try {
    const entries = await fs.readDir(layoutsDir);

    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        try {
          const content = await fs.readFile(`${layoutsDir}/${entry}`);
          const layout = JSON.parse(content) as NamedLayout;
          layouts.push(layout);
        } catch {
          // Skip corrupted layout files
        }
      }
    }
  } catch {
    // readDir might fail if directory is inaccessible
  }

  return layouts;
}

// ============================================================================
// Annotation Persistence
// ============================================================================

/**
 * Save annotations to .coral-code-design/annotations.json
 */
export async function saveAnnotations(
  fs: FileSystemAdapter,
  rootPath: string,
  annotations: AnnotationStore
): Promise<void> {
  const configDir = `${rootPath}/${CONFIG_DIR}`;
  const annotationsPath = `${configDir}/${ANNOTATIONS_FILE}`;

  // Ensure directory exists
  if (!(await fs.exists(configDir))) {
    await fs.mkdir(configDir);
  }

  await fs.writeFile(annotationsPath, JSON.stringify(annotations, null, 2));
}

/**
 * Load annotations from .coral-code-design/annotations.json
 * Returns null if file doesn't exist.
 */
export async function loadAnnotations(
  fs: FileSystemAdapter,
  rootPath: string
): Promise<AnnotationStore | null> {
  const annotationsPath = `${rootPath}/${CONFIG_DIR}/${ANNOTATIONS_FILE}`;

  if (!(await fs.exists(annotationsPath))) {
    return null;
  }

  try {
    const content = await fs.readFile(annotationsPath);
    return JSON.parse(content) as AnnotationStore;
  } catch {
    return null;
  }
}
