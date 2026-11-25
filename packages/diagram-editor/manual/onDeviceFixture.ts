import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev-server fixture for the on-device model's browser keyboard journey
 * (e2e/on-device-keyboard.spec.ts). Active only when the dev server runs with
 * CORAL_ON_DEVICE_FIXTURE=1: it turns the build constant on and swaps the
 * shared model for a scripted fake, so no model, worker or GPU is involved.
 * Production builds never include it.
 */
export function onDeviceFixturePlugin(): Plugin {
  const fake = path.resolve(import.meta.dirname, 'onDeviceFakeModel.ts');
  return {
    name: 'coral-on-device-fixture',
    apply: () => process.env.CORAL_ON_DEVICE_FIXTURE === '1',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './sharedModel' && importer?.includes('/onDeviceModel/ui/')) return fake;
      return null;
    },
    transform(code, id) {
      if (!id.endsWith('/src/releaseFeatures029.ts')) return null;
      return code.replace('export const ON_DEVICE_MODEL_AVAILABLE = false;', 'export const ON_DEVICE_MODEL_AVAILABLE = true;');
    },
  };
}
