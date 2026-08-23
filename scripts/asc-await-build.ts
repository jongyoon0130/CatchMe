#!/usr/bin/env bun
/**
 * Waits for an Xcode Cloud build run to finish and for the resulting build to
 * finish processing, then marks it export-compliant and attaches it to the
 * editable App Store version.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... \
 *     bun run scripts/asc-await-build.ts 33
 */

import { asc, getApp } from './asc-client';

const BUILD_NUMBER = process.argv[2];
if (!BUILD_NUMBER) {
  console.error('Usage: asc-await-build.ts <buildNumber>');
  process.exit(1);
}

const POLL_MS = 60_000;
const DEADLINE = Date.now() + 90 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

const app = await getApp();
console.log(`App ${app.attributes.name} (${app.id}), waiting for build ${BUILD_NUMBER}`);

const products = await asc(`/v1/ciProducts?limit=20&include=app`);
const product = products.data.find((p: any) => p.relationships?.app?.data?.id === app.id);
if (!product) throw new Error('No Xcode Cloud product for this app');

async function findRun(): Promise<any | undefined> {
  const runs = await asc(
    `/v1/ciProducts/${product.id}/buildRuns?limit=20&sort=-number` +
      `&fields[ciBuildRuns]=number,executionProgress,completionStatus,startedDate`,
  );
  return runs.data.find((r: any) => String(r.attributes.number) === BUILD_NUMBER);
}

let ciDone = false;
while (!ciDone) {
  if (Date.now() > DEADLINE) throw new Error('Timed out waiting for CI build run');
  const run = await findRun();
  if (!run) {
    console.log(`${stamp()}  build run ${BUILD_NUMBER} not visible yet`);
  } else {
    const a = run.attributes;
    console.log(`${stamp()}  CI run #${a.number}: ${a.executionProgress} ${a.completionStatus ?? ''}`);
    if (a.completionStatus && a.completionStatus !== 'SUCCEEDED') {
      throw new Error(`CI build run ${BUILD_NUMBER} finished as ${a.completionStatus}`);
    }
    if (a.executionProgress === 'COMPLETE' && a.completionStatus === 'SUCCEEDED') ciDone = true;
  }
  if (!ciDone) await sleep(POLL_MS);
}
console.log(`${stamp()}  CI build succeeded, waiting for App Store Connect processing`);

let build: any;
while (true) {
  if (Date.now() > DEADLINE) throw new Error('Timed out waiting for build processing');
  const builds = await asc(
    `/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}` +
      `&fields[builds]=version,processingState,usesNonExemptEncryption,buildAudienceType`,
  );
  build = builds.data?.[0];
  if (build) {
    const a = build.attributes;
    console.log(
      `${stamp()}  build ${a.version}: ${a.processingState} ` +
        `encryption=${a.usesNonExemptEncryption} audience=${a.buildAudienceType}`,
    );
    if (a.processingState === 'VALID') break;
    if (['INVALID', 'FAILED'].includes(a.processingState)) {
      throw new Error(`Build ${BUILD_NUMBER} processing ended as ${a.processingState}`);
    }
  } else {
    console.log(`${stamp()}  build ${BUILD_NUMBER} not uploaded yet`);
  }
  await sleep(POLL_MS);
}

if (build.attributes.buildAudienceType !== 'APP_STORE_ELIGIBLE') {
  throw new Error(
    `Build ${BUILD_NUMBER} is ${build.attributes.buildAudienceType}; ` +
      `the workflow archive action is still not App Store eligible`,
  );
}

if (build.attributes.usesNonExemptEncryption === null) {
  await asc(`/v1/builds/${build.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'builds',
        id: build.id,
        attributes: { usesNonExemptEncryption: false },
      },
    }),
  });
  console.log(`${stamp()}  export compliance set (exempt)`);
}

const versions = await asc(
  `/v1/apps/${app.id}/appStoreVersions?limit=10` +
    `&fields[appStoreVersions]=versionString,appStoreState,platform`,
);
const editable = versions.data.find((v: any) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(
    v.attributes.appStoreState,
  ),
);
if (!editable) {
  console.log(`${stamp()}  no editable App Store version; attach the build manually`);
} else {
  await asc(`/v1/appStoreVersions/${editable.id}/relationships/build`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'builds', id: build.id } }),
  });
  console.log(
    `${stamp()}  attached build ${BUILD_NUMBER} to App Store version ` +
      `${editable.attributes.versionString}`,
  );
}
