const schemasByCore = Object.freeze({
  '0.2.0': '1.0.0',
  '0.2.1': '2.0.0',
  '0.2.2': '3.0.0',
  '0.2.3': '3.0.0',
  '0.2.4': '3.0.0',
});

const historicalCoreByCoral = Object.freeze({
  '0.2.4': '0.2.0',
  '0.2.5': '0.2.1',
  '0.2.6': '0.2.2',
  '0.2.8': '0.2.3',
  '0.2.9': '0.2.4',
});

export function resolveConsumerGeneration({
  artifactVersion,
  rootVersion,
  rootCoreVersion,
  expectedCoreVersion,
}) {
  const core = expectedCoreVersion ?? (
    artifactVersion === rootVersion
      ? rootCoreVersion
      : historicalCoreByCoral[artifactVersion]
  );
  const schema = schemasByCore[core];
  if (!schema) {
    throw new Error(
      `No consumer expectation is approved for Coral ${artifactVersion} with core ${String(core ?? 'unknown')}.`,
    );
  }
  return Object.freeze({ core, schema });
}
