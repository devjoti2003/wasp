/**
 * WASP - Firebase Cloud Sync Configuration
 *
 * To enable real-time cross-device sync across all phones & computers:
 * 1. Go to https://console.firebase.google.com/ and create a free project.
 * 2. In Build > Authentication, enable "Email/Password".
 * 3. In Build > Firestore Database, click "Create database" (Start in test mode).
 * 4. In Project Settings > General, scroll to "Your apps", select Web (</>), and copy the config object below.
 *
 * You can paste the keys below OR enter them directly into the WASP website under "Allotment & Lists > Cloud Sync".
 */

window.DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
