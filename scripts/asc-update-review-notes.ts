#!/usr/bin/env bun
/**
 * Updates App Store review notes to answer Guideline 2.1 information requests.
 *
 * Demo credentials come from the environment — never commit them. Apple only needs
 * a fallback here because Sign in with Apple is the recommended path.
 *
 * Usage:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=... \
 *   ASC_DEMO_EMAIL=... ASC_DEMO_PASSWORD=... ASC_CONTACT_EMAIL=... ASC_CONTACT_PHONE=... \
 *     bun run scripts/asc-update-review-notes.ts
 */

import { asc, getApp } from './asc-client';

const DEMO_EMAIL = process.env.ASC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.ASC_DEMO_PASSWORD;
const CONTACT_EMAIL = process.env.ASC_CONTACT_EMAIL;
const CONTACT_PHONE = process.env.ASC_CONTACT_PHONE;

if (!DEMO_EMAIL || !DEMO_PASSWORD || !CONTACT_EMAIL || !CONTACT_PHONE) {
  console.error(
    'Set ASC_DEMO_EMAIL, ASC_DEMO_PASSWORD, ASC_CONTACT_EMAIL and ASC_CONTACT_PHONE.',
  );
  process.exit(1);
}

const REVIEW_NOTES = `Catch Me — App Review Information (Build 36, v1.0.1)

=== WHAT CHANGED IN 1.0.1 ===
Metadata/config only. App name tidied to "Catch Me." and the bundle now declares
Korean (CFBundleDevelopmentRegion/CFBundleLocalizations) so the App Store lists the
app's language as Korean instead of English. No feature, permission, data-collection
or tracking behavior changed from the approved 1.0 build.

=== DEMO ACCOUNT ===
RECOMMENDED: tap "Apple로 계속하기" (Sign in with Apple), the first button on the
login screen. No password needed — it uses the Apple ID already on the device.
Alternative (Google Sign-In): ${DEMO_EMAIL} / ${DEMO_PASSWORD}
If Google blocks sign-in in your environment, please use Sign in with Apple.
Contact: ${CONTACT_EMAIL} / ${CONTACT_PHONE}

=== 1. SCREEN RECORDING (physical iPhone, iOS 26) ===
https://drive.google.com/file/d/1ivx2cFPKDYbbsYkhj3Asv1AImFVQiELi/view?usp=sharing
Recorded on a physical iPhone; the flow is identical in build 36. Timestamps:
0:00 Login screen | 0:03 Sign in with Apple + Face ID | 0:09 Onboarding 1/4-4/4
0:51 AI generates the "future self" memories (server-side, no user API key)
1:03 Chat tab, three exchanges with AI replies | 1:30 Home tab (calendar)
1:33 Create a goal, add a todo, mark it complete | 2:12 Alarm + AI affirmation
2:33 Profile tab | 2:39 Settings, incl. DELETE ACCOUNT and alarm permissions

=== 2. DEVICES / OS TESTED ===
Physical iPhone on iOS 26.0, plus TestFlight before submission. Minimum OS is
iOS 26.0 because the alarm feature uses AlarmKit.

=== 3. APP DESCRIPTION ===
Catch Me lets a user chat with a personalized "future self" persona set five years
ahead, then turn those insights into goals, todos, routines and motivational alarms.
Audience: Korean-speaking adults interested in self-improvement and habit building.
Value: private 1:1 AI coaching plus goal and alarm tracking. No IAP, no ads.

=== 4. SETUP INSTRUCTIONS ===
1. Open the app. 2. Tap "Apple로 계속하기". 3. Finish onboarding (~2 min, any answers
are fine). 4. Chat tab: send any message and the AI replies. 5. Home tab: add a todo.
6. Alarm tab: optional, needs Alarm permission. No sample files or setup required.

=== 5. EXTERNAL SERVICES ===
Supabase (auth, database sync, edge functions), Sign in with Apple, Google Sign-In,
and the Google Gemini API for AI chat and image generation. Gemini is called only
through our Supabase Edge Function proxy, so users never enter an API key. Vercel
hosts only the privacy policy and support pages. No advertising or analytics SDKs.

=== 6. REGIONAL DIFFERENCES ===
None. Korean only, identical in every territory.

=== 7. REGULATED / THIRD-PARTY CONTENT ===
Not a regulated industry app. No third-party copyrighted media is bundled or shown.
All user content stays private to the account and is never shared or published.

=== PERMISSIONS ===
Photos/Camera: only for the optional "Future Camera" on the Profile tab, where the
user picks one photo to generate an AI-aged portrait. The app works fully without it.
Notifications and Alarm (AlarmKit): only for todo reminders and the alarm tab.

=== NO TRACKING (Guideline 5.1.2(i)) ===
This app does NOT track users on any platform, so there is no AppTrackingTransparency
prompt. It bundles no advertising SDKs, no third-party analytics, and no data brokers,
and it shares no data with third parties for advertising. The email address is used
only to create and sign in to the user's own account. The App Privacy information in
App Store Connect has been corrected so that no data type is used for tracking.

=== ACCOUNT DELETION (Guideline 5.1.1(v)) ===
Profile tab -> gear icon -> "계정 삭제" (Delete Account), visible at 2:39 in the video.
It calls our delete-account Edge Function, which removes the auth user and cascades
to every table (profile, chats, goals, alarms, photos). Permanent and irreversible.

Privacy: https://future-me-studio.vercel.app/privacy.html
Support: https://future-me-studio.vercel.app/support.html
`;

const app = await getApp();
const versions = await asc(
  `/v1/apps/${app.id}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`,
);
const version = versions.data.find((v: any) =>
  ['REJECTED', 'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'].includes(
    v.attributes.appStoreState,
  ),
);
if (!version) throw new Error('No editable/rejected version found');

const review = await asc(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
const id = review.data.id;

await asc(`/v1/appStoreReviewDetails/${id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    data: {
      type: 'appStoreReviewDetails',
      id,
      attributes: {
        notes: REVIEW_NOTES,
        demoAccountRequired: true,
        demoAccountName: DEMO_EMAIL,
        demoAccountPassword: DEMO_PASSWORD,
      },
    },
  }),
});

console.log(`Updated review notes for version ${version.attributes.versionString} (${version.attributes.appStoreState})`);
console.log(`Notes length: ${REVIEW_NOTES.length} chars`);
