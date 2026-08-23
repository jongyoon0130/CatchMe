#!/usr/bin/env bun
/**
 * Dumps App Store versions and recent builds with the attributes that decide
 * whether a build can be submitted, for working out why one is unselectable.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... bun run scripts/asc-diagnose.ts
 */

import { asc, getApp } from './asc-client';

const app = await getApp();
console.log(`App ${app.attributes.name} (${app.id})\n`);

const versions = await asc(
  `/v1/apps/${app.id}/appStoreVersions?limit=20&include=build` +
    `&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate,build`,
);
console.log('App Store versions:');
for (const v of versions.data) {
  const a = v.attributes;
  console.log(
    `  ${a.versionString}  ${a.platform}  ${a.appStoreState}  ` +
      `build=${v.relationships?.build?.data?.id ?? 'none'}  id=${v.id}`,
  );
}

const builds = await asc(
  `/v1/builds?filter[app]=${app.id}&limit=10&sort=-version&include=preReleaseVersion` +
    `&fields[builds]=version,processingState,usesNonExemptEncryption,expired,iconAssetToken,` +
    `buildAudienceType,minOsVersion,preReleaseVersion` +
    `&fields[preReleaseVersions]=version,platform`,
);
console.log('\nRecent builds:');
for (const b of builds.data) {
  const a = b.attributes;
  const pre = builds.included?.find(
    (i: any) =>
      i.type === 'preReleaseVersions' && i.id === b.relationships.preReleaseVersion.data.id,
  );
  console.log(
    `  build ${a.version}  preReleaseVersion=${pre?.attributes.version} ` +
      `platform=${pre?.attributes.platform}  ${a.processingState}  ` +
      `encryption=${a.usesNonExemptEncryption}  audience=${a.buildAudienceType}  ` +
      `minOs=${a.minOsVersion}  icon=${a.iconAssetToken ? 'yes' : 'NO'}  id=${b.id}`,
  );
}
