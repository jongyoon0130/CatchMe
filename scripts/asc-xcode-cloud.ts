#!/usr/bin/env bun
/**
 * Inspects Xcode Cloud workflows for the app, and optionally starts a build run.
 *
 * --fix tries to switch archive actions to App Store eligible distribution, but
 * Apple rejects the update while a TestFlight post-action exists (post-actions
 * aren't exposed by the API), so that switch usually has to be made in the
 * App Store Connect UI: Xcode Cloud > workflow > archive action > Deployment
 * Preparation > App Store Connect.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... \
 *     bun run scripts/asc-xcode-cloud.ts [--fix] [--start] [--raw]
 */

import { asc, getApp } from './asc-client';

const FIX = process.argv.includes('--fix');
const START = process.argv.includes('--start');

const app = await getApp();
console.log(`App ${app.attributes.name} (${app.id})`);

const products = await asc(`/v1/ciProducts?limit=20&include=app`);
const product = products.data.find((p: any) => p.relationships?.app?.data?.id === app.id);
if (!product) throw new Error('No Xcode Cloud product found for this app');
console.log(`Xcode Cloud product: ${product.attributes.name} (${product.id})\n`);

const workflows = await asc(`/v1/ciProducts/${product.id}/workflows?limit=50`);

if (process.argv.includes('--raw')) {
  console.log(JSON.stringify(workflows.data, null, 2));
  process.exit(0);
}

for (const wf of workflows.data) {
  const a = wf.attributes;
  const archives = (a.actions ?? []).filter((x: any) => x.actionType === 'ARCHIVE');
  console.log(`Workflow "${a.name}" (${wf.id})  enabled=${a.isEnabled}`);
  for (const act of archives) {
    console.log(
      `  ARCHIVE  platform=${act.platform}  scheme=${act.scheme}  ` +
        `audience=${act.buildDistributionAudience}`,
    );
  }
  if (archives.length === 0) console.log('  (no archive action)');

  const needsFix = archives.some((x: any) => x.buildDistributionAudience !== 'APP_STORE_ELIGIBLE');

  if (FIX && needsFix) {
    const actions = (a.actions ?? []).map((x: any) =>
      x.actionType === 'ARCHIVE' ? { ...x, buildDistributionAudience: 'APP_STORE_ELIGIBLE' } : x,
    );
    await asc(`/v1/ciWorkflows/${wf.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'ciWorkflows', id: wf.id, attributes: { actions } } }),
    });
    console.log('  -> switched archive action to APP_STORE_ELIGIBLE');
  }

  if (START) {
    const run = await asc(`/v1/ciBuildRuns`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'ciBuildRuns',
          relationships: { workflow: { data: { type: 'ciWorkflows', id: wf.id } } },
        },
      }),
    });
    console.log(
      `  -> started build run #${run.data.attributes.number} ` +
        `(${run.data.attributes.executionProgress})`,
    );
  }
}
