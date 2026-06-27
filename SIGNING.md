# Code signing & notarization (macOS)

By default PayBatch builds **unsigned**, so the release pipeline always works. On
first launch users then have to right-click → **Open** (macOS) or choose **Run
anyway** (Windows).

To remove those warnings on macOS, sign the app with an Apple **Developer ID** and
**notarize** it. The build config and CI are already wired — you just add five
repository secrets and the next tagged release signs + notarizes automatically.

## You need

- An **Apple Developer Program** membership ($99/year).
- A **Developer ID Application** certificate (create it in Xcode → Settings →
  Accounts → Manage Certificates → **+** → *Developer ID Application*, or on the
  Apple Developer website).

## One-time setup

1. **Export the certificate** as a `.p12` (Keychain Access → right-click the
   "Developer ID Application" cert → Export), and set a password.

2. **Base64-encode it** (so it can be stored as a secret):
   ```bash
   base64 -i DeveloperID.p12 | pbcopy   # now on your clipboard
   ```

3. **Create an app-specific password** at <https://appleid.apple.com> →
   Sign-In and Security → App-Specific Passwords. (Used by the notarizer.)

4. **Find your Team ID**: Apple Developer → Membership details (a 10-character ID).

5. **Add these GitHub repo secrets** (Settings → Secrets and variables → Actions → New repository secret):

   | Secret name | Value |
   |-------------|-------|
   | `MAC_CSC_LINK` | the base64 string from step 2 |
   | `MAC_CSC_KEY_PASSWORD` | the `.p12` password from step 1 |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 3 |
   | `APPLE_TEAM_ID` | your 10-character Team ID |

## Release

```bash
# bump "version" in package.json, then:
git tag v1.0.3 && git push origin v1.0.3
```

The macOS job will now **sign** (Developer ID + hardened runtime, using
`build/entitlements.mac.plist`) and **notarize** (`"notarize": true` in
`package.json`). No code changes needed.

## Verify

Download the released `.dmg`, install, then:
```bash
spctl -a -vvv -t install "/Applications/PayBatch.app"
# expect: source=Notarized Developer ID
```

## Windows (optional, later)

Windows signing works the same way via electron-builder. Add an Authenticode
certificate as `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets and reference them
in the build step's `env`. An **EV** certificate gives instant SmartScreen
reputation; a standard **OV** certificate builds reputation over time.
