/**
 * Tests for Codebase Overview and Armada Breadcrumbs
 *
 * Issue #32: CCD-REQ-003 Codebase Overview and Armada Breadcrumbs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodebaseOverview } from '../src/hooks/useCodebaseOverview';
import { useArmadaBreadcrumbs } from '../src/hooks/useArmadaBreadcrumbs';

// ============================================================================
// useCodebaseOverview Hook Tests
// ============================================================================

describe('useCodebaseOverview', () => {
  describe('C4 abstraction levels', () => {
    it('should start at system context level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      expect(result.current.currentLevel).toBe('system');
    });

    it('should have all C4 levels available', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      expect(result.current.levels).toEqual([
        'system',
        'container',
        'component',
        'code',
      ]);
    });

    it('should navigate to container level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api-gateway' });
      });

      expect(result.current.currentLevel).toBe('container');
    });

    it('should navigate to component level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api-gateway' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth-service' });
      });

      expect(result.current.currentLevel).toBe('component');
    });

    it('should navigate to code level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth' });
      });

      act(() => {
        result.current.drillDown('code', { id: 'login-handler' });
      });

      expect(result.current.currentLevel).toBe('code');
    });
  });

  describe('navigation context', () => {
    it('should track context for current level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api-gateway', name: 'API Gateway' });
      });

      expect(result.current.context).toEqual({ id: 'api-gateway', name: 'API Gateway' });
    });

    it('should maintain navigation path', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api', name: 'API' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth', name: 'Auth' });
      });

      expect(result.current.path).toHaveLength(2);
      expect(result.current.path[0]).toMatchObject({ level: 'container', context: { id: 'api' } });
      expect(result.current.path[1]).toMatchObject({ level: 'component', context: { id: 'auth' } });
    });

    it('should navigate back up levels', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth' });
      });

      act(() => {
        result.current.navigateToLevel('container');
      });

      expect(result.current.currentLevel).toBe('container');
      expect(result.current.path).toHaveLength(1);
    });

    it('should reset to system level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth' });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.currentLevel).toBe('system');
      expect(result.current.path).toHaveLength(0);
      expect(result.current.context).toBeNull();
    });
  });

  describe('diagram type suggestions', () => {
    it('should suggest C4 for system level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      expect(result.current.suggestedDiagramType).toBe('c4-context');
    });

    it('should suggest C4 container for container level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      expect(result.current.suggestedDiagramType).toBe('c4-container');
    });

    it('should suggest C4 component for component level', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth' });
      });

      expect(result.current.suggestedDiagramType).toBe('c4-component');
    });

    it('should suggest flowchart for code level by default', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.drillDown('container', { id: 'api' });
      });

      act(() => {
        result.current.drillDown('component', { id: 'auth' });
      });

      act(() => {
        result.current.drillDown('code', { id: 'login' });
      });

      expect(result.current.suggestedDiagramType).toBe('flowchart');
    });

    it('should allow overriding diagram type', () => {
      const { result } = renderHook(() => useCodebaseOverview());

      act(() => {
        result.current.setDiagramType('sequence');
      });

      expect(result.current.suggestedDiagramType).toBe('sequence');
    });
  });
});

// ============================================================================
// useArmadaBreadcrumbs Hook Tests
// ============================================================================

describe('useArmadaBreadcrumbs', () => {
  const mockArmadaClient = {
    getArchitecture: vi.fn(),
    getContext: vi.fn(),
    search: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have root breadcrumb', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      expect(result.current.breadcrumbs).toHaveLength(1);
      expect(result.current.breadcrumbs[0]).toMatchObject({
        label: 'My Project',
        level: 'system',
      });
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('breadcrumb navigation', () => {
    it('should add breadcrumb when drilling down', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API Gateway',
          level: 'container',
          context: { id: 'api-gateway' },
        });
      });

      expect(result.current.breadcrumbs).toHaveLength(2);
      expect(result.current.breadcrumbs[1]).toMatchObject({
        label: 'API Gateway',
        level: 'container',
      });
    });

    it('should navigate to breadcrumb by index', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
        });
      });

      act(() => {
        result.current.pushBreadcrumb({
          label: 'Auth',
          level: 'component',
          context: { id: 'auth' },
        });
      });

      act(() => {
        result.current.navigateTo(0);
      });

      expect(result.current.breadcrumbs).toHaveLength(1);
      expect(result.current.currentBreadcrumb.label).toBe('My Project');
    });

    it('should navigate to middle breadcrumb', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
        });
      });

      act(() => {
        result.current.pushBreadcrumb({
          label: 'Auth',
          level: 'component',
          context: { id: 'auth' },
        });
      });

      act(() => {
        result.current.pushBreadcrumb({
          label: 'Login',
          level: 'code',
          context: { id: 'login' },
        });
      });

      act(() => {
        result.current.navigateTo(1);
      });

      expect(result.current.breadcrumbs).toHaveLength(2);
      expect(result.current.currentBreadcrumb.label).toBe('API');
    });
  });

  describe('current breadcrumb', () => {
    it('should return last breadcrumb as current', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
        });
      });

      expect(result.current.currentBreadcrumb.label).toBe('API');
    });

    it('should return current level', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'Auth',
          level: 'component',
          context: { id: 'auth' },
        });
      });

      expect(result.current.currentLevel).toBe('component');
    });
  });

  describe('breadcrumb callbacks', () => {
    it('should call onNavigate callback when navigating', () => {
      const onNavigate = vi.fn();
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({
          projectName: 'My Project',
          onNavigate,
        })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
        });
      });

      act(() => {
        result.current.navigateTo(0);
      });

      expect(onNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'My Project',
          level: 'system',
        })
      );
    });

    it('should call onDrillDown callback when pushing', () => {
      const onDrillDown = vi.fn();
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({
          projectName: 'My Project',
          onDrillDown,
        })
      );

      const breadcrumb = {
        label: 'API',
        level: 'container' as const,
        context: { id: 'api' },
      };

      act(() => {
        result.current.pushBreadcrumb(breadcrumb);
      });

      expect(onDrillDown).toHaveBeenCalledWith(expect.objectContaining(breadcrumb));
    });
  });

  describe('Armada context', () => {
    it('should store Armada query scope per breadcrumb', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
          armadaScope: 'packages/api/',
        });
      });

      expect(result.current.currentBreadcrumb.armadaScope).toBe('packages/api/');
    });

    it('should store Armada query for breadcrumb', () => {
      const { result } = renderHook(() =>
        useArmadaBreadcrumbs({ projectName: 'My Project' })
      );

      act(() => {
        result.current.pushBreadcrumb({
          label: 'API',
          level: 'container',
          context: { id: 'api' },
          armadaQuery: 'architecture overview for api package',
        });
      });

      expect(result.current.currentBreadcrumb.armadaQuery).toBe(
        'architecture overview for api package'
      );
    });
  });
});
