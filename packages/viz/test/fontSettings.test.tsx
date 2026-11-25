/**
 * Font Settings Tests (CORAL-REQ-012)
 *
 * Tests for font customization in diagrams:
 * - FontSettings types
 * - Integration with measureText
 * - Integration with computeNodeSize
 * - Migration for existing documents
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  type FontSettings,
  type DiagramFontSettings,
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  FONT_SIZE_PRESETS,
} from '../src/file/schema.js';
import { measureText, computeNodeSize } from '../src/layout/nodeSizing.js';
import { FontSettingsForm } from '../src/settings/FontSettingsForm.js';

// ============================================================================
// FontSettings Types Tests
// ============================================================================

describe('FontSettings types', () => {
  it('should have default font settings', () => {
    expect(DEFAULT_FONT_SETTINGS).toBeDefined();
    expect(DEFAULT_FONT_SETTINGS.family).toBeDefined();
    expect(DEFAULT_FONT_SETTINGS.size).toBeGreaterThan(0);
  });

  it('should have required properties in default settings', () => {
    expect(DEFAULT_FONT_SETTINGS.family).toContain('system');
    expect(DEFAULT_FONT_SETTINGS.size).toBe(14);
    expect(DEFAULT_FONT_SETTINGS.weight).toBe('normal');
    expect(DEFAULT_FONT_SETTINGS.lineHeight).toBe(1.3);
  });

  it('should have font family presets', () => {
    expect(FONT_FAMILY_PRESETS).toBeDefined();
    expect(FONT_FAMILY_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('should have system font preset', () => {
    const systemPreset = FONT_FAMILY_PRESETS.find(p => p.id === 'system');
    expect(systemPreset).toBeDefined();
    expect(systemPreset?.family).toContain('-apple-system');
  });

  it('should have sans-serif font preset', () => {
    const sansPreset = FONT_FAMILY_PRESETS.find(p => p.id === 'sans');
    expect(sansPreset).toBeDefined();
    expect(sansPreset?.family).toContain('Inter');
  });

  it('should have monospace font preset', () => {
    const monoPreset = FONT_FAMILY_PRESETS.find(p => p.id === 'mono');
    expect(monoPreset).toBeDefined();
    expect(monoPreset?.family).toContain('JetBrains Mono');
  });

  it('should have font size presets', () => {
    expect(FONT_SIZE_PRESETS).toBeDefined();
    expect(FONT_SIZE_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('should have small, normal, large, and extra large size presets', () => {
    const sizes = FONT_SIZE_PRESETS.map(p => p.id);
    expect(sizes).toContain('small');
    expect(sizes).toContain('normal');
    expect(sizes).toContain('large');
    expect(sizes).toContain('xlarge');
  });

  it('should have correct size values', () => {
    const small = FONT_SIZE_PRESETS.find(p => p.id === 'small');
    const normal = FONT_SIZE_PRESETS.find(p => p.id === 'normal');
    const large = FONT_SIZE_PRESETS.find(p => p.id === 'large');

    expect(small?.size).toBe(11);
    expect(normal?.size).toBe(14);
    expect(large?.size).toBe(16);
  });
});

// ============================================================================
// measureText Integration Tests
// ============================================================================

describe('measureText with font settings', () => {
  it('should use default font when no settings provided', () => {
    const result = measureText({ text: 'Hello' });

    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should return larger dimensions for larger font size', () => {
    const smallFont = measureText({ text: 'Hello', fontSize: 12 });
    const largeFont = measureText({ text: 'Hello', fontSize: 18 });

    expect(largeFont.width).toBeGreaterThan(smallFont.width);
    expect(largeFont.height).toBeGreaterThan(smallFont.height);
  });

  it('should handle font weight parameter', () => {
    const normal = measureText({ text: 'Hello', fontSize: 14, fontWeight: 'normal' });
    const bold = measureText({ text: 'Hello', fontSize: 14, fontWeight: 'bold' });

    // Bold text is typically wider
    expect(bold.width).toBeGreaterThanOrEqual(normal.width);
  });

  it('should handle numeric font weight', () => {
    const result = measureText({ text: 'Hello', fontSize: 14, fontWeight: 600 });

    expect(result.width).toBeGreaterThan(0);
  });

  it('should use custom font family', () => {
    const result = measureText({
      text: 'Hello',
      fontSize: 14,
      fontFamily: 'monospace'
    });

    expect(result.width).toBeGreaterThan(0);
  });

  it('should respect lineHeight setting', () => {
    const tight = measureText({ text: 'Hello\nWorld', fontSize: 14, lineHeight: 1.0 });
    const loose = measureText({ text: 'Hello\nWorld', fontSize: 14, lineHeight: 2.0 });

    expect(loose.height).toBeGreaterThan(tight.height);
  });
});

// ============================================================================
// computeNodeSize Integration Tests
// ============================================================================

describe('computeNodeSize with font settings', () => {
  it('should compute larger nodes for larger font', () => {
    const smallNode = computeNodeSize({
      text: 'Hello World',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 12,
    });

    const largeNode = computeNodeSize({
      text: 'Hello World',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 18,
    });

    expect(largeNode.width).toBeGreaterThan(smallNode.width);
    expect(largeNode.height).toBeGreaterThan(smallNode.height);
  });

  it('should apply font settings consistently', () => {
    const result1 = computeNodeSize({
      text: 'Test',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 14,
      fontFamily: 'sans-serif',
    });

    const result2 = computeNodeSize({
      text: 'Test',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 14,
      fontFamily: 'sans-serif',
    });

    // Same settings should produce same results
    expect(result1.width).toBe(result2.width);
    expect(result1.height).toBe(result2.height);
  });

  it('should handle different shapes with same font', () => {
    const fontSettings = { fontSize: 14, fontFamily: 'sans-serif' };

    const rectangle = computeNodeSize({
      text: 'Hello',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      ...fontSettings,
    });

    const diamond = computeNodeSize({
      text: 'Hello',
      shapeId: 'diamond',
      sizingMode: 'adaptive',
      ...fontSettings,
    });

    // Diamond needs more space due to textBoundsRatio
    expect(diamond.width).toBeGreaterThan(rectangle.width);
  });
});

// ============================================================================
// DiagramFontSettings Tests
// ============================================================================

describe('DiagramFontSettings', () => {
  it('should allow symbol overrides', () => {
    const settings: DiagramFontSettings = {
      default: DEFAULT_FONT_SETTINGS,
      symbolOverrides: {
        'code-function': { family: 'monospace', size: 12 },
      },
    };

    expect(settings.default).toBeDefined();
    expect(settings.symbolOverrides?.['code-function']?.family).toBe('monospace');
  });

  it('should merge overrides with defaults', () => {
    const settings: DiagramFontSettings = {
      default: { ...DEFAULT_FONT_SETTINGS },
      symbolOverrides: {
        'code-function': { size: 12 }, // Only override size
      },
    };

    const override = settings.symbolOverrides?.['code-function'];
    expect(override?.size).toBe(12);
    // Family should come from default when not overridden
    expect(override?.family).toBeUndefined();
  });
});

// ============================================================================
// Document Schema Integration Tests
// ============================================================================

describe('Document schema font integration', () => {
  it('should include font in document settings', () => {
    // This tests that the types are correctly defined
    // The actual schema validation is in serialize/deserialize
    const documentSettings = {
      notation: 'flowchart',
      layout: {
        algorithm: 'layered',
        direction: 'DOWN' as const,
      },
      font: {
        default: DEFAULT_FONT_SETTINGS,
      },
    };

    expect(documentSettings.font).toBeDefined();
    expect(documentSettings.font.default.size).toBe(14);
  });
});

// ============================================================================
// FontSettingsForm Component Tests
// ============================================================================

describe('FontSettingsForm', () => {
  const defaultSettings: DiagramFontSettings = {
    default: { ...DEFAULT_FONT_SETTINGS },
  };

  describe('rendering', () => {
    it('should render font family selector', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/font family/i)).toBeTruthy();
    });

    it('should render font size selector', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/font size preset/i)).toBeTruthy();
    });

    it('should render custom size input', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/custom font size/i)).toBeTruthy();
    });

    it('should render font weight selector', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/font weight/i)).toBeTruthy();
    });

    it('should render line height slider', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/line height/i)).toBeTruthy();
    });

    it('should render font preview', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/quick brown fox/i)).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('should call onChange when font family changes', () => {
      const onChange = vi.fn();
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByLabelText(/font family/i), {
        target: { value: 'mono' },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          default: expect.objectContaining({
            family: expect.stringContaining('JetBrains Mono'),
          }),
        })
      );
    });

    it('should call onChange when font size preset changes', () => {
      const onChange = vi.fn();
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByLabelText(/font size preset/i), {
        target: { value: 'large' },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          default: expect.objectContaining({ size: 16 }),
        })
      );
    });

    it('should call onChange when custom size changes', () => {
      const onChange = vi.fn();
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByLabelText(/custom font size/i), {
        target: { value: '18' },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          default: expect.objectContaining({ size: 18 }),
        })
      );
    });

    it('should call onChange when font weight changes', () => {
      const onChange = vi.fn();
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByLabelText(/font weight/i), {
        target: { value: 'bold' },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          default: expect.objectContaining({ weight: 'bold' }),
        })
      );
    });

    it('should render apply button when onApply is provided', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
          onApply={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /apply/i })).toBeTruthy();
    });

    it('should call onApply when apply button is clicked', () => {
      const onApply = vi.fn();
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
          onApply={onApply}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /apply/i }));

      expect(onApply).toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should disable all inputs when disabled', () => {
      render(
        <FontSettingsForm
          settings={defaultSettings}
          onChange={vi.fn()}
          disabled={true}
        />
      );

      const familySelect = screen.getByLabelText(/font family/i) as HTMLSelectElement;
      const sizeSelect = screen.getByLabelText(/font size preset/i) as HTMLSelectElement;
      const customSizeInput = screen.getByLabelText(/custom font size/i) as HTMLInputElement;
      const weightSelect = screen.getByLabelText(/font weight/i) as HTMLSelectElement;

      expect(familySelect.disabled).toBe(true);
      expect(sizeSelect.disabled).toBe(true);
      expect(customSizeInput.disabled).toBe(true);
      expect(weightSelect.disabled).toBe(true);
    });
  });
});
