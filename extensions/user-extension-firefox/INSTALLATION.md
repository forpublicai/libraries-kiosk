# Firefox Extension - Quick Start Guide

## ✅ Port Complete

The PublicPass User Extension has been successfully ported to Firefox MV2.

**Location**: `extensions/user-extension-firefox/`

## 📋 What Was Changed

### Files Modified from Chrome Version:
1. **manifest.json** - Converted from MV3 to MV2 format
2. **background.js** - Added storage wrappers, updated script injection API
3. **options/options.js** - Added storage wrappers
4. **popup/popup.js** - Added storage wrappers

### Files Added (Firefox-specific):
1. **background.html** - Loads background.js as ES module
2. **README.md** - Firefox-specific documentation
3. **PORT_SUMMARY.md** - Technical porting details

### Files Copied Unchanged:
- config.js
- lib/crypto.js
- content_script.js
- banner.css
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
2. Navigate to: `D:\mohsin-work\github\libraries-kiosk\extensions\user-extension-firefox\`
3. Select **`manifest.json`**
4. Click **"Open"**

### Step 4: Verify Installation
You should see:
- ✅ "PublicPass User (Firefox)" in the list of extensions
- ✅ Extension icon in the Firefox toolbar
- ✅ No error messages in the debugging page

## ⚙️ Configure the Extension

### Step 1: Open Options
1. Click the extension icon in the toolbar
2. Click **"Open options"** in the popup
3. OR: Click the gear icon next to the extension in `about:debugging`

### Step 2: Set Kiosk Name
1. Enter your kiosk username (e.g., "library-kiosk-1")
2. Click **"Save settings"**
3. Wait for "Identity registered" confirmation

## 🧪 Test the Extension

### Test 1: Check Popup
1. Click the extension icon in toolbar
2. Popup should display:
   - "Check now" button for inbox
   - "Request access" section
   - "Open options" link

### Test 2: Check Banner
1. Navigate to any website (e.g., google.com)
2. No banner should appear (since no session is active)
3. Banner will appear when a session is received

### Test 3: Check Console for Errors
1. In `about:debugging`, find the extension
2. Click **"Inspect"** button
3. Check the Console tab for any errors
4. You should see inbox polling messages every 3 minutes

## 🔍 Troubleshooting

### Extension Won't Load
**Problem**: Error when loading manifest.json
**Solution**: 
1. Verify manifest.json is valid: Run this in PowerShell:
   ```powershell
   Get-Content "D:\mohsin-work\github\libraries-kiosk\extensions\user-extension-firefox\manifest.json" | ConvertFrom-Json
   ```
2. Check for missing files in the directory

### Storage Errors in Console
**Problem**: "chrome.storage.sync.get is not a function" or similar
**Solution**: 
1. Verify storage wrappers are present at top of background.js
2. Check that background.html is loading background.js correctly
3. Inspect background page: `about:debugging` → "Inspect" → check for syntax errors

### Sessions Not Applying
**Problem**: Inbox items not being processed
**Solution**:
1. Verify username is set in options
2. Check server is accessible: Open `https://publicpass.mohsin-yousufi.workers.dev` in browser
3. Check inbox manually: Click extension icon → "Check now"
4. Inspect background page console for API errors

### "Temporary Add-on" Disappears
**Problem**: Extension unloads when Firefox restarts
**Solution**: This is normal for temporary add-ons. Either:
- Reload the extension after each Firefox restart
- OR: Use Firefox Developer Edition with unsigned extensions enabled
- OR: Submit extension to Mozilla for signing (for production use)

## 📊 Comparison with Chrome Version

| Feature | Chrome (MV3) | Firefox (MV2) | Status |
|---------|-------------|---------------|--------|
| Session acceptance | ✅ | ✅ | Identical |
| Inbox polling | ✅ | ✅ | Identical |
| Auto-logout | ✅ | ✅ | Identical |
| Cookie transfer | ✅ | ✅ | Identical |
| Storage restore | ✅ | ✅ | Identical |
| Access requests | ✅ | ✅ | Identical |
| Encryption | ✅ | ✅ | Identical |
| Banner UI | ✅ | ✅ | Identical |

## 📝 Next Steps

### For Development:
1. Keep extension loaded in `about:debugging`
2. Use "Reload" button when you make code changes
3. Check Console frequently for errors
4. Test with admin extension to send sessions

### For Production:
1. **Option A**: Continue using temporary loading (reload after each Firefox restart)
2. **Option B**: Use Firefox Developer Edition with `xpinstall.signatures.required = false`
3. **Option C**: Submit to Mozilla Add-ons for signing:
   - Zip the entire `user-extension-firefox/` folder
   - Upload to https://addons.mozilla.org/developers/
   - Wait for review (usually 1-7 days)
   - Install the signed .xpi file

## 🎯 Success Criteria

Extension is working correctly if:
- [x] Loads without errors in `about:debugging`
- [x] Options page opens and saves settings
- [x] Popup opens and shows UI correctly
- [x] No console errors in background page inspector
- [x] Inbox polling runs every 3 minutes (check console logs)
- [x] Banner injected on websites (visible in DOM even if not showing)
- [x] Storage wrappers handle Firefox's callback-based API

## 💡 Tips

- **Debugging**: Always keep the background page inspector open during testing
- **Storage**: Check storage data: Inspect → Console → `chrome.storage.sync.get(null, console.log)`
- **Reloading**: Use the "Reload" button in `about:debugging`, don't remove and re-add
- **Logs**: Background console shows all polling, session acceptance, and error logs
- **Performance**: Firefox MV2 uses less memory than Chrome MV3 (no service worker overhead)

## 🆘 Support

If you encounter issues:
1. Check the Console in background page inspector
2. Review PORT_SUMMARY.md for technical details
3. Compare with Chrome version to isolate Firefox-specific problems
4. Verify all storage calls use the wrappers (not direct chrome.storage.*.get/set)

---

**Ready to load!** Follow the steps above to install and test the Firefox extension.
