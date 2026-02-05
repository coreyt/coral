/**
 * BranchSelector Component
 *
 * UI for selecting branches for Armada branch projection.
 * Issue #18
 */

import { useCallback } from 'react';
import type { BranchProjectionConfig } from '../../providers/ArmadaProvider';

export interface BranchSelectorProps {
  /** Available branches from Armada */
  availableBranches: string[];
  /** Current branch projection config (null = single branch view) */
  currentProjection: BranchProjectionConfig | null;
  /** Called when projection changes */
  onChange: (projection: BranchProjectionConfig | null) => void;
  /** Called to refresh available branches */
  onFetchBranches: () => Promise<string[]>;
  /** Whether currently loading branches */
  isLoading?: boolean;
}

export function BranchSelector({
  availableBranches,
  currentProjection,
  onChange,
  onFetchBranches,
  isLoading = false,
}: BranchSelectorProps) {
  // Handle base branch change
  const handleBaseBranchChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const baseBranch = e.target.value;
      onChange({
        baseBranch,
        includeBranches: currentProjection?.includeBranches ?? [],
      });
    },
    [onChange, currentProjection]
  );

  // Handle include branch toggle
  const handleIncludeBranchToggle = useCallback(
    (branch: string) => {
      if (!currentProjection) return;

      const includeBranches = currentProjection.includeBranches.includes(branch)
        ? currentProjection.includeBranches.filter((b) => b !== branch)
        : [...currentProjection.includeBranches, branch];

      onChange({
        baseBranch: currentProjection.baseBranch,
        includeBranches,
      });
    },
    [onChange, currentProjection]
  );

  // Handle clear projection
  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Handle refresh branches
  const handleRefresh = useCallback(async () => {
    await onFetchBranches();
  }, [onFetchBranches]);

  // Filter out base branch from include options
  const includeBranchOptions = currentProjection
    ? availableBranches.filter((b) => b !== currentProjection.baseBranch)
    : [];

  // Empty state
  if (availableBranches.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.label}>Branch Projection</span>
          <button
            onClick={handleRefresh}
            style={styles.iconButton}
            aria-label="Refresh branches"
            disabled={isLoading}
          >
            ↻
          </button>
        </div>
        <div style={styles.emptyState}>No branches available</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Branch Projection</span>
        <button
          onClick={handleRefresh}
          style={styles.iconButton}
          aria-label="Refresh branches"
          disabled={isLoading}
        >
          ↻
        </button>
      </div>

      {/* Base branch selector */}
      <div style={styles.field}>
        <label htmlFor="base-branch" style={styles.fieldLabel}>
          Base Branch
        </label>
        <select
          id="base-branch"
          aria-label="Base Branch"
          value={currentProjection?.baseBranch ?? ''}
          onChange={handleBaseBranchChange}
          style={styles.select}
        >
          <option value="" disabled>
            Select base branch...
          </option>
          {availableBranches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </div>

      {/* Include branches (only shown when base branch is selected) */}
      {currentProjection && includeBranchOptions.length > 0 && (
        <div style={styles.field}>
          <span style={styles.fieldLabel}>Include Branches</span>
          <div style={styles.checkboxList}>
            {includeBranchOptions.map((branch) => (
              <label key={branch} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  aria-label={branch}
                  checked={currentProjection.includeBranches.includes(branch)}
                  onChange={() => handleIncludeBranchToggle(branch)}
                  style={styles.checkbox}
                />
                {branch}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Current projection display */}
      {currentProjection && (
        <div style={styles.projectionDisplay}>
          <span style={styles.projectionText}>
            {currentProjection.baseBranch}
            {currentProjection.includeBranches.length > 0 && (
              <> + {currentProjection.includeBranches.length} branch(es)</>
            )}
          </span>
          <button
            onClick={handleClear}
            style={styles.clearButton}
            aria-label="Clear projection"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
    borderTop: '1px solid var(--border-color, #e0e0e0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-color, #333)',
  },
  iconButton: {
    padding: '4px 8px',
    fontSize: '14px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted, #666)',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  field: {
    marginBottom: '12px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-muted, #666)',
    marginBottom: '4px',
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid var(--border-color, #e0e0e0)',
    borderRadius: '4px',
    background: 'var(--input-bg, #fff)',
    color: 'var(--text-color, #333)',
  },
  checkboxList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-color, #333)',
    cursor: 'pointer',
  },
  checkbox: {
    margin: 0,
  },
  projectionDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    background: 'var(--highlight-bg, #f0f7ff)',
    borderRadius: '4px',
    marginTop: '8px',
  },
  projectionText: {
    fontSize: '12px',
    color: 'var(--primary-color, #2563eb)',
    fontWeight: 500,
  },
  clearButton: {
    padding: '4px 8px',
    fontSize: '11px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted, #666)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  emptyState: {
    fontSize: '12px',
    color: 'var(--text-muted, #666)',
    fontStyle: 'italic',
  },
};
