#!/usr/bin/env bun
/**
 * Reads everything App Review looks at for the editable App Store version and
 * reports what is still missing or likely to be rejected.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... \
 *     bun run scripts/asc-submission-audit.ts
 */

import { asc, getApp } from './asc-client';

type Finding = { level: 'BLOCK' | 'WARN' | 'OK'; area: string; detail: string };
const findings: Finding[] = [];
const add = (level: Finding['level'], area: string, detail: string) =>
  findings.push({ level, area, detail });

async function tryGet(path: string): Promise<any | undefined> {
  try {
    return await asc(path);
  } catch (error) {
    add('WARN', 'api', `${path}: ${(error as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

const app = await getApp();
console.log(`App: ${app.attributes.name} (${app.id}) ${app.attributes.bundleId}\n`);

// ---------------------------------------------------------------- app info
const appInfos = await tryGet(
  `/v1/apps/${app.id}/appInfos?include=primaryCategory,secondaryCategory,appInfoLocalizations`,
);
const appInfo = appInfos?.data?.find((i: any) =>
  ['PREPARE_FOR_SUBMISSION', 'READY_FOR_DISTRIBUTION', 'DEVELOPER_REJECTED'].includes(
    i.attributes.appStoreState,
  ),
) ?? appInfos?.data?.[0];

if (appInfo) {
  const a = appInfo.attributes;
  console.log(`App info state: ${a.appStoreState}`);
  console.log(`  age rating: ${a.appStoreAgeRating ?? 'not set'}`);
  console.log(`  brazil rating: ${a.brazilAgeRating ?? '-'}`);
  console.log(`  kids category: ${a.kidsAgeBand ?? '-'}`);

  const primary = appInfo.relationships?.primaryCategory?.data?.id;
  const secondary = appInfo.relationships?.secondaryCategory?.data?.id;
  console.log(`  primary category: ${primary ?? 'NOT SET'}`);
  console.log(`  secondary category: ${secondary ?? '-'}`);
  if (!primary) add('BLOCK', '카테고리', '기본 카테고리가 설정되지 않았습니다');
  if (!a.appStoreAgeRating) add('BLOCK', '연령 등급', '연령 등급 설문이 완료되지 않았습니다');

  const locs = await tryGet(`/v1/appInfos/${appInfo.id}/appInfoLocalizations`);
  console.log('\nApp info localizations:');
  for (const l of locs?.data ?? []) {
    const la = l.attributes;
    console.log(`  [${la.locale}] name="${la.name}" subtitle="${la.subtitle ?? ''}"`);
    console.log(`     privacyPolicyUrl=${la.privacyPolicyUrl ?? 'NOT SET'}`);
    if (!la.name) add('BLOCK', '앱 이름', `${la.locale} 이름이 비어 있습니다`);
    if (!la.privacyPolicyUrl) {
      add('BLOCK', '개인정보 처리방침', `${la.locale} 처리방침 URL이 없습니다`);
    }
    if (!la.subtitle) add('WARN', '부제', `${la.locale} 부제가 비어 있습니다 (선택 사항)`);
  }
}

// -------------------------------------------------------- app store version
const versions = await tryGet(
  `/v1/apps/${app.id}/appStoreVersions?limit=10&include=build` +
    `&fields[appStoreVersions]=versionString,appStoreState,platform,copyright,releaseType,` +
    `earliestReleaseDate,reviewType,build`,
);
const version = versions?.data?.find((v: any) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(
    v.attributes.appStoreState,
  ),
);
if (!version) {
  console.log('\nNo editable App Store version found.');
  process.exit(1);
}

const va = version.attributes;
console.log(`\nVersion ${va.versionString} (${va.platform}) state=${va.appStoreState}`);
console.log(`  copyright: ${va.copyright ?? 'NOT SET'}`);
console.log(`  releaseType: ${va.releaseType}`);
console.log(`  build: ${version.relationships?.build?.data?.id ?? 'NONE'}`);

if (!version.relationships?.build?.data?.id) {
  add('BLOCK', '빌드', '버전에 빌드가 연결되지 않았습니다');
}
if (!va.copyright) add('WARN', '저작권', '저작권이 비어 있습니다 (보통 필수)');

// -------------------------------------------------------------- localizations
const vlocs = await tryGet(
  `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations` +
    `?fields[appStoreVersionLocalizations]=locale,description,keywords,whatsNew,` +
    `promotionalText,supportUrl,marketingUrl`,
);

console.log('\nVersion localizations:');
for (const l of vlocs?.data ?? []) {
  const la = l.attributes;
  console.log(`  [${la.locale}]`);
  console.log(`     description: ${la.description ? `${la.description.length} chars` : 'NOT SET'}`);
  console.log(`     keywords: ${la.keywords ?? 'NOT SET'}`);
  console.log(`     supportUrl: ${la.supportUrl ?? 'NOT SET'}`);
  console.log(`     marketingUrl: ${la.marketingUrl ?? '-'}`);
  console.log(`     whatsNew: ${la.whatsNew ? `${la.whatsNew.length} chars` : '-'}`);

  if (!la.description) add('BLOCK', '설명', `${la.locale} 설명이 비어 있습니다`);
  else if (la.description.length < 30) {
    add('WARN', '설명', `${la.locale} 설명이 ${la.description.length}자로 너무 짧습니다`);
  }
  if (!la.keywords) add('WARN', '키워드', `${la.locale} 키워드가 비어 있습니다`);
  if (!la.supportUrl) add('BLOCK', '지원 URL', `${la.locale} 지원 URL이 비어 있습니다`);

  // -------------------------------------------------------------- screenshots
  const sets = await tryGet(
    `/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?include=appScreenshots`,
  );
  const byType: Record<string, number> = {};
  for (const s of sets?.data ?? []) {
    byType[s.attributes.screenshotDisplayType] = s.relationships?.appScreenshots?.data?.length ?? 0;
  }
  console.log(`     screenshots: ${JSON.stringify(byType)}`);

  const iphoneTypes = Object.keys(byType).filter((t) => t.startsWith('APP_IPHONE'));
  if (iphoneTypes.length === 0) {
    add('BLOCK', '스크린샷', `${la.locale} iPhone 스크린샷이 없습니다`);
  }
  for (const t of iphoneTypes) {
    if (byType[t] === 0) add('BLOCK', '스크린샷', `${la.locale} ${t} 세트가 비어 있습니다`);
  }

  const previews = await tryGet(
    `/v1/appStoreVersionLocalizations/${l.id}/appPreviewSets?include=appPreviews`,
  );
  const previewCount = (previews?.data ?? []).reduce(
    (n: number, s: any) => n + (s.relationships?.appPreviews?.data?.length ?? 0),
    0,
  );
  console.log(`     previews: ${previewCount}`);
}

// ------------------------------------------------------------- review detail
const review = await tryGet(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
if (review?.data) {
  const ra = review.data.attributes;
  console.log('\nApp review detail:');
  console.log(`  contact: ${ra.contactFirstName ?? ''} ${ra.contactLastName ?? ''}`);
  console.log(`  phone: ${ra.contactPhone ?? 'NOT SET'}  email: ${ra.contactEmail ?? 'NOT SET'}`);
  console.log(`  demo account required: ${ra.demoAccountRequired}`);
  console.log(`  demo user: ${ra.demoAccountName ? 'set' : 'NOT SET'}`);
  console.log(`  demo password: ${ra.demoAccountPassword ? 'set' : 'NOT SET'}`);
  console.log(`  notes: ${ra.notes ? `${ra.notes.length} chars` : 'NOT SET'}`);

  if (!ra.contactEmail || !ra.contactPhone || !ra.contactFirstName) {
    add('BLOCK', '앱 심사 연락처', '심사 담당자 이름/전화/이메일을 모두 채워야 합니다');
  }
  if (!ra.demoAccountRequired) {
    add(
      'BLOCK',
      '데모 계정',
      '로그인이 필요한 앱인데 "로그인 필요"가 꺼져 있습니다. 리뷰어가 앱을 못 써서 리젝됩니다',
    );
  } else if (!ra.demoAccountName || !ra.demoAccountPassword) {
    add('BLOCK', '데모 계정', '테스트 계정 아이디/비밀번호가 비어 있습니다');
  }
  if (!ra.notes) {
    add('WARN', '심사 노트', 'AI 사용·로그인 방법을 적어두면 리젝 확률이 줄어듭니다');
  }
} else {
  add('BLOCK', '앱 심사 정보', '앱 심사 정보(연락처·테스트 계정)가 아직 없습니다');
}

// ------------------------------------------------------- age rating / privacy
const ageRating = await tryGet(`/v1/appStoreVersions/${version.id}/ageRatingDeclaration`);
if (ageRating?.data) {
  const filled = Object.entries(ageRating.data.attributes).filter(([, v]) => v !== null);
  console.log(`\nAge rating declaration: ${filled.length} fields answered`);
  if (filled.length === 0) add('BLOCK', '연령 등급', '연령 등급 설문이 비어 있습니다');
}

const privacy = await tryGet(`/v1/apps/${app.id}/appInfos`);
void privacy;

const dataUsages = await tryGet(`/v1/apps/${app.id}/dataUsages?limit=200`);
if (dataUsages?.data) {
  console.log(`\nPrivacy data usages declared: ${dataUsages.data.length}`);
  if (dataUsages.data.length === 0) {
    add('WARN', '개인정보 라벨', '선언된 데이터 유형이 없습니다 ("수집 안 함" 상태일 수 있음)');
  }
}

// ------------------------------------------------------------- price / avail
const priceSchedule = await tryGet(`/v1/apps/${app.id}/appPriceSchedule?include=manualPrices`);
if (priceSchedule) {
  const count = priceSchedule.data?.relationships?.manualPrices?.data?.length ?? 0;
  console.log(`\nPrice schedule entries: ${count}`);
  if (count === 0) add('BLOCK', '가격', '가격이 설정되지 않았습니다 (무료라도 지정 필요)');
}

const availability = await tryGet(`/v2/apps/${app.id}/appAvailability`);
if (availability?.data) {
  console.log(`Available in new territories: ${availability.data.attributes.availableInNewTerritories}`);
} else {
  add('WARN', '판매 지역', '판매 지역 설정을 확인하세요');
}

// ---------------------------------------------------------------- report
console.log(`\n${'='.repeat(60)}`);
const blocks = findings.filter((f) => f.level === 'BLOCK');
const warns = findings.filter((f) => f.level === 'WARN');

if (blocks.length) {
  console.log(`\n제출 전 반드시 고칠 것 (${blocks.length}):`);
  for (const f of blocks) console.log(`  [${f.area}] ${f.detail}`);
}
if (warns.length) {
  console.log(`\n확인 권장 (${warns.length}):`);
  for (const f of warns) console.log(`  [${f.area}] ${f.detail}`);
}
if (!blocks.length && !warns.length) console.log('\n문제 없음 — 심사에 추가 가능');

process.exit(blocks.length ? 1 : 0);
