export const API_BASELINE_VERSION = '0.2.8';

export const API_GRAPH_IR_ARTIFACTS = Object.freeze({
  baseline: {
    version: '0.2.0',
    integrity: 'sha512-xrVKFwHrlI4o/HAqPrfI7zwFRhz18jOwxcgv2NRjfZGAfw3slMpxq8bk5D+z4YJMZ3IATvsm8jppKpnfXxfs7Q==',
  },
  candidate: {
    version: '0.2.1',
    integrity: 'sha512-E7CznxEJovYRQclWTyuUU6+4WbTGw+mm5NACu4UJcfSFkpYqdiXFCzS0aQLQJL/lYRGBIkTud3Q97Ju1bYCsLw==',
  },
});

export const API_BASELINE_PACKAGES = [
  {
    name: '@coral-viz/language', workspace: '@coral-viz/language', alias: '@coral-viz-baseline/language',
    integrity: 'sha512-icKqufy7e8b6Zjjsja9S238OqtDTKj9J524vZ+AmXWNLflbYCI6NeXqMTwUiSYmXZs4oQVmTP39VPcUAvInhRg==',
  },
  {
    name: '@coral-viz/render', workspace: '@coral-viz/render', alias: '@coral-viz-baseline/render',
    integrity: 'sha512-CSIlclAUYaTEHqgd4zAy8FEnIwgz9HAtCdWMbddEZiUWQPW40QavWYjfjIHZgQWeUanhYi9lag3wpc6R8r4hFw==',
  },
  {
    name: '@coral-viz/viz', workspace: '@coral-viz/viz', alias: '@coral-viz-baseline/viz',
    integrity: 'sha512-GaZEijGDwvCjZEPfqI7nvDWlk1GRtw54yozlT/3lHB/tXCy9hPD3VdPaw4ZG1Ey3U9ZBr+7r2EwMwm0amEs/yg==',
  },
  {
    name: '@coral-viz/mcp-server', workspace: '@coral-viz/mcp-server', alias: '@coral-viz-baseline/mcp-server',
    integrity: 'sha512-n9wPJplDrpFq0NmFGpbOFytCldD3TlAgI9h35t58Q3EKcXnGIYx5Qs+3NtFvoo/FtggwxFUu0vz0/g4U+C8q+A==',
  },
  {
    name: 'tree-sitter-coral', workspace: 'tree-sitter-coral', alias: 'tree-sitter-coral-baseline',
    integrity: 'sha512-VP7yrQxlM3BvKhonE3GuOFu+8wSOHL9eY9Ct74Shbk19WQ44oW1vuJn79YGG8l+W+HZD5bYuCGRUFhn0sISPXg==',
  },
];

// Complete applicable compatibility cases per artifact generation. Consumer
// smoke refuses any named case that cannot run for the selected generation.
export const API_COMPAT_BASELINE_CASES = Object.freeze(
  ['language', 'render', 'viz', 'viz-graphir-migration', 'mcp-server', 'tree-sitter-coral']);
export const API_COMPAT_CURRENT_CASES = Object.freeze(
  ['language', 'render', 'viz-graphir-migration', 'mcp-server', 'tree-sitter-coral']);
