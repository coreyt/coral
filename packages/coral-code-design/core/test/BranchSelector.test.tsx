/**
 * Tests for BranchSelector component
 *
 * Issue #18: Branch Selection UI for Armada
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BranchSelector } from '../src/components/BranchSelector/BranchSelector';
import type { BranchProjectionConfig } from '../src/providers/ArmadaProvider';

describe('BranchSelector', () => {
  const mockBranches = ['main', 'dev', 'feature/auth', 'feature/api'];
  const mockOnChange = vi.fn();
  const mockOnFetchBranches = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnFetchBranches.mockResolvedValue(mockBranches);
  });

  describe('rendering', () => {
    it('should render with no branches selected', () => {
      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={null}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      expect(screen.getByText('Branch Projection')).toBeInTheDocument();
    });

    it('should show current projection when set', () => {
      const projection: BranchProjectionConfig = {
        baseBranch: 'dev',
        includeBranches: ['feature/auth'],
      };

      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={projection}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      expect(screen.getByText('dev')).toBeInTheDocument();
    });

    it('should show available branches in dropdown', async () => {
      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={null}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      // Click to open base branch dropdown
      const baseBranchSelect = screen.getByLabelText(/base branch/i);
      fireEvent.click(baseBranchSelect);

      // Should show all branches
      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
        expect(screen.getByText('dev')).toBeInTheDocument();
      });
    });
  });

  describe('branch selection', () => {
    it('should call onChange when base branch is selected', async () => {
      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={null}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      const baseBranchSelect = screen.getByLabelText(/base branch/i);
      fireEvent.change(baseBranchSelect, { target: { value: 'dev' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        baseBranch: 'dev',
        includeBranches: [],
      });
    });

    it('should call onChange when include branches are toggled', async () => {
      const projection: BranchProjectionConfig = {
        baseBranch: 'dev',
        includeBranches: [],
      };

      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={projection}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      // Find and click the feature/auth checkbox
      const checkbox = screen.getByLabelText('feature/auth');
      fireEvent.click(checkbox);

      expect(mockOnChange).toHaveBeenCalledWith({
        baseBranch: 'dev',
        includeBranches: ['feature/auth'],
      });
    });

    it('should remove branch from includeBranches when unchecked', async () => {
      const projection: BranchProjectionConfig = {
        baseBranch: 'dev',
        includeBranches: ['feature/auth', 'feature/api'],
      };

      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={projection}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      // Find and click the feature/auth checkbox to uncheck it
      const checkbox = screen.getByLabelText('feature/auth');
      fireEvent.click(checkbox);

      expect(mockOnChange).toHaveBeenCalledWith({
        baseBranch: 'dev',
        includeBranches: ['feature/api'],
      });
    });
  });

  describe('clear projection', () => {
    it('should show clear button when projection is active', () => {
      const projection: BranchProjectionConfig = {
        baseBranch: 'dev',
        includeBranches: ['feature/auth'],
      };

      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={projection}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });

    it('should call onChange with null when clear is clicked', () => {
      const projection: BranchProjectionConfig = {
        baseBranch: 'dev',
        includeBranches: ['feature/auth'],
      };

      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={projection}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      const clearButton = screen.getByRole('button', { name: /clear/i });
      fireEvent.click(clearButton);

      expect(mockOnChange).toHaveBeenCalledWith(null);
    });
  });

  describe('refresh branches', () => {
    it('should call onFetchBranches when refresh button is clicked', async () => {
      render(
        <BranchSelector
          availableBranches={mockBranches}
          currentProjection={null}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      expect(mockOnFetchBranches).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('should show message when no branches available', () => {
      render(
        <BranchSelector
          availableBranches={[]}
          currentProjection={null}
          onChange={mockOnChange}
          onFetchBranches={mockOnFetchBranches}
        />
      );

      expect(screen.getByText(/no branches available/i)).toBeInTheDocument();
    });
  });
});
