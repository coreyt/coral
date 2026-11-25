/**
 * Developer full verification: the CI stage checks composed once in one
 * checkout, without GitHub context or a frozen candidate. Public outputs are
 * built once and then consumed read-only; packed checks pack freshly.
 * Browser, delivery and performance commands stay explicit (see testing guide).
 */
import { contractChecks, nativeChecks, npm, run, sourceChecks, unitSuites } from './ci.mjs';

const fresh = { CORAL_ARTIFACT_DIR: '' };
sourceChecks();
npm(['run', 'build:public']);
contractChecks();
unitSuites();
nativeChecks(fresh);
run(process.execPath, ['scripts/verify-packed-language.mjs'], { env: fresh });
console.log('Local verification passed. Not run here: browser (npm run test:e2e), ' +
  'delivery (npm run test:online-delivery:integration), performance (npm run test:performance).');
