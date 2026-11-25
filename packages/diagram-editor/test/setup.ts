class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = TestResizeObserver;
}
