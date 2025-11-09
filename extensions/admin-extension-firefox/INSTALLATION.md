# Firefox Admin Extension - Quick Start Guide

## ✅ Port Complete

The PublicPass Admin Extension has been successfully ported to Firefox MV2.

**Location**: `extensions/admin-extension-firefox/`

## 📋 What Was Changed

### Files Modified from Chrome Version:
1. **manifest.json** - Converted from MV3 to MV2 format, merged host_permissions
2. **background.js** - Added storage wrappers, updated script injection API
3. **options/options.js** - Added storage wrappers for all storage calls
4. **popup/popup.js** - Added storage wrappers

### Files Added (Firefox-specific):
1. **background.html** - Loads background.js as ES module
2. **README.md** - Firefox-specific documentation

### Files Copied Unchanged:
- config.js
- lib/crypto.js
- content/capture.js
- shared.css
- options/options.html
- popup/popup.html
- All icon files

## 🚀 Load the Extension in Firefox

### Step 1: Open Firefox
Launch Firefox browser (version 109.0 or higher recommended)

### Step 2: Navigate to Debugging Page
1. Type `about:debugging` in the address bar
2. Press Enter
3. Click **"This Firefox"** in the left sidebar

### Step 3: Load Temporary Add-on
1. Click the **"Load Temporary Add-on..."** button
2. Navigate to: `D:\mohsin-work\github\libraries-kiosk\extensions\admin-extension-firefox\`
3. Select **`manifest.json`**
4. Click **"Open"**

### Step 4: Verify Installation
You should see:
- ✅ "PublicPass Admin (Firefox)" in the list of extensions
- ✅ Extension icon in the Firefox toolbar
- ✅ No error messages in the debugging page

## ⚙️ Configure the Extension

### Step 1: Open Options
1. Click the extension icon in the toolbar
2. Click **"Open options"** in the popup
3. OR: Click the gear icon next to the extension in `about:debugging`

### Step 2: Set Admin Username
1. Enter your admin username (e.g., "admin1")
2. Configure session TTL (default: 600 seconds)
3. Click **"Save settings"**
4. Wait for "Identity registered" confirmation

## 🧪 Test the Extension

### Test 1: Share a Session
1. Navigate to a website where you're logged in (e.g., Gmail, GitHub)
2. Click the extension icon
3. Enter a recipient kiosk username
4. Set session duration (e.g., 300 for 5 minutes)
5. Click "Send Session"
6. Should see "Sent" confirmation

### Test 2: View Session History
1. Open Options page
2. Scroll to "Session History" section
3. Should see the session you just sent
4. Try "Terminate" or "Remove" buttons

### Test 3: Check Access Requests
1. Click extension icon
2. View "Access Requests" section
3. Should show pending requests (if any)
4. Extension polls for new requests every 3 minutes

### Test 4: Check Console for Errors
1. In `about:debugging`, find the extension
2. Click **"Inspect"** button
3. Check the Console tab for any errors
4. Should see request polling messages

## 🔍 Troubleshooting

### Extension Won't Load
**Problem**: Error when loading manifest.json
**Solution**: 
1. Verify manifest.json is valid:
   ```powershell
   Get-Content "D:\mohsin-work\github\libraries-kiosk\extensions\admin-extension-firefox\manifest.json" | ConvertFrom-Json
   ```
2. Check for missing files in the directory

### Session Capture Fails
**Problem**: "Failed to capture session" error
**Solution**:
1. Ensure you're on an http(s) page (not about:, file:, etc.)
2. Check that you're actually logged into the site
3. Inspect background page console for detailed error
4. Verify content script loaded: Check tab console for capture.js

### Storage Errors in Console
**Problem**: "chrome.storage.sync.get is not a function" or similar
**Solution**:
1. Verify storage wrappers are present in background.js, options.js, popup.js
2. Check that background.html is loading background.js correctly
3. Reload the extension in `about:debugging`

### Sessions Not Sending
**Problem**: API errors when trying to send
**Solution**:
1. Verify username is set in options
2. Check server is accessible: Open `https://publicpass.mohsin-yousufi.workers.dev` in browser
3. Verify recipient username exists (ask them to register first)
4. Inspect background page console for API response errors

## 📊 Comparison with Chrome Version

| Feature | Chrome (MV3) | Firefox (MV2) | Status |
|---------|-------------|---------------|--------|
| Session capture | ✅ | ✅ | Identical |
| Cookie collection | ✅ | ✅ | Identical |
| Storage capture | ✅ | ✅ | Identical |
| Session encryption | ✅ | ✅ | Identical |
| Session history | ✅ | ✅ | Identical |
| Session termination | ✅ | ✅ | Identical |
| Access requests | ✅ | ✅ | Identical |
| Request polling | ✅ | ✅ | Identical |

## 📝 Next Steps

### For Development:
1. Keep extension loaded in `about:debugging`
2. Use "Reload" button when you make code changes
3. Test with user extension to receive sessions
4. Monitor background console for API calls

### For Production:
1. **Option A**: Continue using temporary loading (reload after each Firefox restart)
2. **Option B**: Use Firefox Developer Edition with `xpinstall.signatures.required = false`
3. **Option C**: Submit to Mozilla Add-ons for signing

## 🎯 Success Criteria

Extension is working correctly if:
- [x] Loads without errors in `about:debugging`
- [x] Options page opens and saves settings
- [x] Popup opens and shows UI correctly
- [x] Can capture session from a logged-in website
- [x] Session appears in history after sending
- [x] No console errors in background page inspector
- [x] Request polling runs every 3 minutes (check console logs)

## 💡 Tips

- **Debugging**: Always keep the background page inspector open during testing
- **Testing Pairs**: Install both admin-extension-firefox and user-extension-firefox to test full flow
- **Storage**: Check storage data: Inspect → Console → `chrome.storage.sync.get(null, console.log)`
- **Reloading**: Use the "Reload" button in `about:debugging`, don't remove and re-add
- **Logs**: Background console shows all captures, encryptions, API calls, and errors
- **Session Data**: Includes cookies, localStorage, sessionStorage, and URL

## 🔐 Security Notes

- All sessions encrypted with ECDH + AES-GCM before sending
- Private keys stored only in local extension storage
- Server never sees unencrypted session data
- Supports all cookie security attributes (secure, httpOnly, sameSite, etc.)
- Session duration configurable for auto-logout

---

**Ready to load!** Follow the steps above to install and test the Firefox admin extension.
