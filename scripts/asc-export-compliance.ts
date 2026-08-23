#!/usr/bin/env bun
/**
 * Sets export compliance (usesNonExemptEncryption=false) on App Store Connect
 * builds and, when a build number is given, attaches it to the editable
 * App Store version.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... \
 *     bun run scripts/asc-export-compliance.ts [buildNumber]
 */

import { asc, getApp } from './asc-client';

const TARGET_BUILD = process.argv[2];

const app = await getApp();
console.log(`App: ${app.attributes.name} (${app.id})`);

const builds = await asc(
  `/v1/builds?filter[app]=${app.id}&limit=200&sort=-version` +
    `&fields[builds]=version,uploadedDate,processingState,usesNonExemptEncryption,expired,` +
    `buildAudienceType`,
);

console.log('\nBuilds:');
for (const b of builds.data) {
  const a = b.attributes;
  console.log(
    `  ${a.version.padStart(4)}  ${a.processingState}  ` +
      `encryption=${a.usesNonExemptEncryption}  audience=${a.buildAudienceType}  ${a.uploadedDate}`,
  );
}

const targets = TARGET_BUILD
  ? builds.data.filter((b: any) => b.attributes.version === TARGET_BUILD)
  : builds.data.filter((b: any) => b.attributes.usesNonExemptEncryption === null);

if (TARGET_BUILD && targets.length === 0) {
  throw new Error(`Build ${TARGET_BUILD} not found`);
}

console.log('');
for (const b of targets) {
  if (b.attributes.usesNonExemptEncryption === false) {
    console.log(`Build ${b.attributes.version}: already compliant, skipping`);
    continue;
  }
  await asc(`/v1/builds/${b.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } },
    }),
  });
  console.log(`Build ${b.attributes.version}: export compliance set (exempt)`);
}

if (!TARGET_BUILD) process.exit(0);

const target = targets[0];

// Archive actions set to "TestFlight (Internal Testing Only)" produce INTERNAL_ONLY
// builds, which can never be submitted; the audience can't be changed after upload.
if (target.attributes.buildAudienceType !== 'APP_STORE_ELIGIBLE') {
  throw new Error(
    `Build ${TARGET_BUILD} is ${target.attributes.buildAudienceType} and cannot be submitted. ` +
      `Set the Xcode Cloud archive action to App Store Connect and make a new build.`,
  );
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
  console.log('\nNo editable App Store version found; attach the build manually.');
} else {
  await asc(`/v1/appStoreVersions/${editable.id}/relationships/build`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'builds', id: target.id } }),
  });
  console.log(
    `\nAttached build ${TARGET_BUILD} to App Store version ${editable.attributes.versionString}`,
  );
}
