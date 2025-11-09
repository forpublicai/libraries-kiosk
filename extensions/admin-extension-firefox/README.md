# PublicPass Admin Extension - Firefox Edition

This is the Firefox MV2-compatible version of the PublicPass Admin Extension.

## Key Differences from Chrome Version

- **Manifest Version**: Uses MV2 (Firefox doesn't fully support MV3 yet)
- **Background Page**: Uses `background.html` loading `background.js` as ES module instead of service worker
- **Storage API**: Wrapped in promise-based functions (`storageGet`/`storageSet`) to handle Firefox's callback-based API
- **Script Injection**: Uses `chrome.tabs.executeScript` with file parameter instead of `chrome.scripting.executeScript`
- **Permissions**: Merged `host_permissions` into `permissions` array (MV2 format)
- **Browser Specific Settings**: Includes `browser_specific_settings.gecko` for Firefox compatibility

## Installation

### For Development/Testing

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to this directory and select `manifest.json`
5. The extension will load temporarily (until Firefox is restarted)

### For Permanent Installation (Requires Signing)

Firefox requires all extensions to be signed by Mozilla before they can be permanently installed. You have two options:

**Option 1: Use Developer Edition or Nightly**
- Download [Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/)
- Set `xpinstall.signatures.required` to `false` in `about:config`
- Load the extension as a permanent add-on

**Option 2: Submit to Mozilla Add-ons**
- Package the extension as a .zip file
- Submit to [addons.mozilla.org](https://addons.mozilla.org/developers/)
- Wait for review and signing
- Install the signed .xpi file

## Features

All features from the Chrome version are supported:

- ✅ Capture and share sessions with end-to-end encryption
- ✅ Cookie and storage collection from active tabs
- ✅ Session history tracking with local caching
- ✅ Session termination/revocation
- ✅ Access request monitoring
- ✅ Identity generation and registration
- ✅ Configurable session TTL and duration
- ✅ End-to-end encryption using ECDH + AES-GCM

## Configuration

Open the extension options page:
1. Click the browser action icon (toolbar)
2. Click "Open options"
3. Enter your Admin Username
4. Configure session TTL (default: 600 seconds)
5. Click "Save settings"

The extension will automatically generate and register your admin identity with the PublicPass server.

## Usage

### Sharing a Session

1. Navigate to the page you want to share (must be logged in)
2. Click the extension icon in the toolbar
3. Enter the recipient's kiosk username
4. Optionally set session duration (in seconds, 0 = no auto-logout)
5. Click "Send Session"

The session will be encrypted and sent directly to the recipient's inbox.

### Managing Sessions

1. Open Options page (click extension icon → "Open options")
2. View the **Session History** section
3. For each session, you can:
   - **Terminate**: Revoke the session and log out the user
   - **Remove**: Delete from history (local and server)

### Monitoring Access Requests

1. Click the extension icon in the toolbar
2. View the **Access Requests** section
3. See who is requesting access to which pages
4. Click **Delete** to acknowledge and remove a request

The extension polls for new requests every 3 minutes and shows a notification badge.

## Troubleshooting

### Extension Won't Load
- Check the Browser Console (Ctrl+Shift+J) for errors
- Verify all files are present in the directory
- Ensure `manifest.json` is valid JSON

### Storage Issues
- Check Firefox's storage quotas in `about:preferences#privacy`
- Clear extension storage: `about:debugging` → find extension → "Inspect" → Console → `chrome.storage.local.clear()`

### Session Capture Fails
- Ensure you're on an http(s) page (not about:, moz-extension:, etc.)
- Check that cookies are enabled for the site
- Verify the content script injected correctly (check console for errors)

### Sessions Not Sending
- Check that your username is set in options
- Verify server URL is accessible: `https://publicpass.mohsin-yousufi.workers.dev`
- Check that recipient username exists
- Inspect background page console for API errors

## Development

All source files use ES modules. The background page loads `background.js` as a module via `background.html`.

### File Structure
```
admin-extension-firefox/
├── manifest.json           # MV2 manifest with Firefox settings
├── background.html         # Loads background.js as ES module
├── background.js           # Main background logic with storage wrappers
├── config.js               # Server URL configuration
├── shared.css              # Shared UI styles
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── lib/
│   └── crypto.js           # ECDH encryption library
├── content/
│   └── capture.js          # Content script for storage capture
├── options/
│   ├── options.html        # Settings and history UI
│   └── options.js          # Settings logic with storage wrappers
└── popup/
    ├── popup.html          # Popup UI
    ├── popup.js            # Popup logic with storage wrappers
    └── imgs/               # Popup images
```

### Storage Wrappers

Firefox MV2's storage API is callback-based, while the Chrome version uses promises. All files that access `chrome.storage` include these wrappers:

```javascript
function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

function storageSet(area, items) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
```

This allows the rest of the code to use `await storageGet('sync', {...})` syntax consistently.

### Script Injection

Firefox MV2 uses the legacy `chrome.tabs.executeScript` API:

```javascript
// Chrome MV3
await chrome.scripting.executeScript({
  target: { tabId },
  files: ["content/capture.js"]
});

// Firefox MV2
await chrome.tabs.executeScript(tabId, {
  file: "content/capture.js"
});
```

## Security

- All sessions are encrypted end-to-end using ECDH key agreement + AES-GCM
- Private keys never leave the extension's local storage
- Server only sees encrypted ciphertext and public keys
- Session data includes cookies, localStorage, and sessionStorage
- Supports cookie attributes: secure, httpOnly, sameSite, partitions, etc.

## Browser Compatibility

- **Firefox**: 109.0+ (specified in manifest as `strict_min_version`)
- **Chrome**: Original version remains in `extensions/admin-extension/`
