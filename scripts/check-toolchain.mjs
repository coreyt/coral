import { pathToFileURL } from 'node:url';

export const TOOLCHAINS = Object.freeze({
  release: Object.freeze({ node: '26.8.2', npm: '12.0.2' }),
  minimumRuntime: Object.freeze({ node: '24.19.0', npm: '12.0.2' }),
});

export function validateToolchain({ nodeVersion, npmUserAgent, role = 'release' }) {
  const expected = role === 'minimum-runtime'
    ? TOOLCHAINS.minimumRuntime
    : TOOLCHAINS.release;
  const npmVersion = npmUserAgent.match(/(?:^|\s)npm\/([^\s]+)/)?.[1];

  const errors = [];
  if (nodeVersion !== expected.node) {
    errors.push(`Node ${expected.node} is required for ${role}; found ${nodeVersion}.`);
  }
  if (npmVersion !== expected.npm) {
    errors.push(`npm ${expected.npm} is required for ${role}; found ${npmVersion ?? 'unknown'}.`);
  }
  return { errors, npmVersion, expected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const role = process.argv.includes('--minimum-runtime') ? 'minimum-runtime' : 'release';
  const result = validateToolchain({
    nodeVersion: process.versions.node,
    npmUserAgent: process.env.npm_config_user_agent ?? '',
    role,
  });
  if (result.errors.length > 0) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log(`Toolchain verified for ${role}: Node ${process.versions.node}, npm ${result.npmVersion}.`);
}
