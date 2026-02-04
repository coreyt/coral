/**
 * Tests for ArmadaConnectionDialog component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArmadaConnectionDialog, type ArmadaConnectionDialogProps } from '../src/components/ArmadaDialog/ArmadaConnectionDialog';
import type { GraphMode } from '../src/types';

const DEFAULT_MODES: GraphMode[] = [
  'call-graph',
  'dependency-graph',
  'inheritance-tree',
  'impact-graph',
  'full-graph',
];

function renderDialog(props: Partial<ArmadaConnectionDialogProps> = {}) {
  const defaultProps: ArmadaConnectionDialogProps = {
    isOpen: true,
    onClose: vi.fn(),
    initialServerUrl: 'http://localhost:8765',
    initialMode: 'call-graph',
    onConnect: vi.fn(),
    isConnecting: false,
    error: null,
    availableModes: DEFAULT_MODES,
  };

  return render(<ArmadaConnectionDialog {...defaultProps} {...props} />);
}

describe('ArmadaConnectionDialog', () => {
  describe('rendering', () => {
    it('should not render when closed', () => {
      renderDialog({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render with default server URL', () => {
      renderDialog();
      const input = screen.getByLabelText(/server url/i);
      expect(input).toHaveValue('http://localhost:8765');
    });

    it('should render with custom server URL', () => {
      renderDialog({ initialServerUrl: 'http://custom:9000' });
      const input = screen.getByLabelText(/server url/i);
      expect(input).toHaveValue('http://custom:9000');
    });

    it('should show mode selector', () => {
      renderDialog();
      const select = screen.getByLabelText(/graph mode/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('call-graph');
    });

    it('should show all available modes', () => {
      renderDialog();
      const select = screen.getByLabelText(/graph mode/i);

      DEFAULT_MODES.forEach(mode => {
        expect(select).toContainHTML(mode);
      });
    });
  });

  describe('interactions', () => {
    it('should call onConnect with config on submit', async () => {
      const onConnect = vi.fn();
      renderDialog({ onConnect });

      const connectBtn = screen.getByRole('button', { name: /connect/i });
      fireEvent.click(connectBtn);

      expect(onConnect).toHaveBeenCalledWith({
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      });
    });

    it('should call onConnect with updated URL', async () => {
      const onConnect = vi.fn();
      renderDialog({ onConnect });

      const input = screen.getByLabelText(/server url/i);
      fireEvent.change(input, { target: { value: 'http://new-server:8080' } });

      const connectBtn = screen.getByRole('button', { name: /connect/i });
      fireEvent.click(connectBtn);

      expect(onConnect).toHaveBeenCalledWith({
        serverUrl: 'http://new-server:8080',
        mode: 'call-graph',
      });
    });

    it('should call onConnect with updated mode', async () => {
      const onConnect = vi.fn();
      renderDialog({ onConnect });

      const select = screen.getByLabelText(/graph mode/i);
      fireEvent.change(select, { target: { value: 'dependency-graph' } });

      const connectBtn = screen.getByRole('button', { name: /connect/i });
      fireEvent.click(connectBtn);

      expect(onConnect).toHaveBeenCalledWith({
        serverUrl: 'http://localhost:8765',
        mode: 'dependency-graph',
      });
    });

    it('should call onClose when cancel button is clicked', () => {
      const onClose = vi.fn();
      renderDialog({ onClose });

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      renderDialog({ onClose });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onConnect when Enter is pressed', () => {
      const onConnect = vi.fn();
      renderDialog({ onConnect });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

      expect(onConnect).toHaveBeenCalled();
    });
  });

  describe('states', () => {
    it('should display error message', () => {
      renderDialog({ error: 'Connection failed' });
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should disable connect button when connecting', () => {
      renderDialog({ isConnecting: true });
      const connectBtn = screen.getByRole('button', { name: /connecting/i });
      expect(connectBtn).toBeDisabled();
    });

    it('should show loading state when connecting', () => {
      renderDialog({ isConnecting: true });
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });

    it('should disable connect button when URL is empty', () => {
      renderDialog({ initialServerUrl: '' });

      // The button should be disabled for empty URL
      const connectBtn = screen.getByRole('button', { name: /connect/i });
      expect(connectBtn).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should have accessible dialog role', () => {
      renderDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal attribute', () => {
      renderDialog();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have labeled inputs', () => {
      renderDialog();
      expect(screen.getByLabelText(/server url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/graph mode/i)).toBeInTheDocument();
    });
  });
});
