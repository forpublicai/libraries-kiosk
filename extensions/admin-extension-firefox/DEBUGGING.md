# Debugging Guide - Admin Extension Firefox

## Issue: Sessions Not Sending

If sessions aren't sending or appearing in history, follow these debugging steps:

## Step 1: Check Extension is Loaded

1. Go to `about:debugging#/runtime/this-firefox`
2. Find "PublicPass Admin (Firefox)"
3. Verify it says "Running" (not "Stopped")
4. If needed, click **Reload** button

## Step 2: Inspect Background Page

1. In `about:debugging`, find the extension
2. Click **Inspect** button (opens DevTools)
3. Go to **Console** tab
4. Look for errors (red text)

### Expected Console Messages

When you send a session, you should see:
```
[PublicPass] Starting share session... {recipientUsername: "..."}
[PublicPass] Settings loaded: {username: "..."}
[PublicPass] Registering identity...
[PublicPass] Identity registered
[PublicPass] Active tab: https://example.com
[PublicPass] Capturing session data...
[PublicPass] Session captured: {cookies: X, localStorage: Y, sessionStorage: Z}
[PublicPass] Fetching recipient public key...
[PublicPass] Recipient found
[PublicPass] Encrypting payload...
[PublicPass] Payload encrypted
[PublicPass] Sending to inbox...
[PublicPass] Session sent successfully!
```

### Common Errors and Solutions

**Error: "Set your username in extension options."**
- **Fix**: Open options page and set your admin username
- Then click "Save settings"

**Error: "Active tab must be an http(s) page."**
- **Fix**: You're trying to share from a non-http page (like about:debugging, file://, etc.)
- Navigate to an actual website (e.g., google.com, github.com)

**Error: "No active tab found."**
- **Fix**: Make sure a tab is active/focused
- Click on a website tab, then try again

**Error: "No response from content script."**
- **Fix**: The content script didn't inject properly
- **Solution 1**: Reload the website and try again
- **Solution 2**: Check if you have JavaScript disabled on the site
- **Solution 3**: Reload the extension in `about:debugging`

**Error: "Request failed with status 404" (when fetching recipient)**
- **Fix**: The recipient username doesn't exist
- Verify the username is correct
- Ask the recipient to open their extension options to register

**Error: "API request timed out."**
- **Fix**: Server not responding
- Check your internet connection
- Verify `https://publicpass.mohsin-yousufi.workers.dev` is accessible

## Step 3: Check Settings

1. Click extension icon → "Open options"
2. Verify:
   - ✅ Admin username is filled in
   - ✅ Identity status shows "Identity ready (your-username)"
   - ✅ TTL seconds is set (default: 600)

## Step 4: Check Popup

1. Click the extension icon in toolbar
2. Check the popup opens without errors
3. Verify "Send Session" form is visible
4. Check for any error messages

## Step 5: Test on a Simple Site

Try sharing a session from a simple site:

1. Navigate to `https://example.com`
2. Open DevTools (F12) → Console tab (check for errors)
3. Click extension icon
4. Enter recipient username: `test-user`
5. Click "Send Session"
6. Watch background console for detailed logs

## Step 6: Verify Content Script

The content script should inject automatically. To verify:

1. Navigate to any website
2. Open DevTools (F12) on the website page
3. Go to Console
4. Type: `chrome.runtime.id`
5. Should show the extension ID (not undefined)

If undefined, the content script didn't load:
- Reload the page
- Check for Content Security Policy blocking scripts
- Try a different website

## Step 7: Check Storage

1. In background page inspector, go to Console
2. Run: 
   ```javascript
   chrome.storage.sync.get(null, console.log)
   ```
3. Should show your settings:
   ```javascript
   {
     serverBaseUrl: "https://publicpass.mohsin-yousufi.workers.dev",
     currentUsername: "your-username",
     ttlSeconds: 600,
     acceptPrompt: "on"
   }
   ```

4. Run:
   ```javascript
   chrome.storage.local.get(null, console.log)
   ```
5. Should show your identity keys:
   ```javascript
   {
     identityPrivateKey: {...},
     identityPublicKey: {...},
     registeredUsername: "your-username",
     authSecret: "..."
   }
   ```

## Step 8: Manual Test of Session Capture

In background console, test the capture manually:

```javascript
// Get active tab
chrome.tabs.query({active: true, currentWindow: true}, async ([tab]) => {
  console.log('Tab:', tab.url);
  
  // Try to inject script
  chrome.tabs.executeScript(tab.id, {file: 'content/capture.js'}, (result) => {
    console.log('Inject result:', result);
    console.log('Error:', chrome.runtime.lastError);
    
    // Try to get storage
    chrome.tabs.sendMessage(tab.id, {type: 'collect-storage'}, (response) => {
      console.log('Storage response:', response);
      console.log('Error:', chrome.runtime.lastError);
    });
  });
});
```

## Step 9: Check History Loading

If sessions send but don't appear in history:

1. Open Options page
2. Open browser DevTools on the options page (F12)
3. Check Console for errors
4. Look for "Failed to load history" messages
5. Click "Refresh History" button
6. Watch console for API errors

## Step 10: Recent Code Updates

I just updated the extension with:

1. **Fixed `ensureContentScript`** - Now properly wraps callback in Promise
2. **Added 100ms delay** - Between script injection and message sending (Firefox quirk)
3. **Added detailed logging** - Shows each step of the share process

**You need to reload the extension:**
1. Go to `about:debugging`
2. Find the extension
3. Click **Reload** button
4. Try sending again

## Quick Fix Checklist

- [ ] Extension loaded and running
- [ ] Background console open (no errors on load)
- [ ] Username set in options
- [ ] Identity shows as "ready"
- [ ] On an http(s) website (not about:, file:, etc.)
- [ ] Recipient username exists
- [ ] Extension reloaded after recent code updates

## Still Not Working?

**Share these details:**
1. Screenshot of background console errors
2. Screenshot of options page (identity status)
3. What website you're trying to share from
4. The exact error message (if any)
5. What you see in the console logs

The detailed logging should now show exactly where it's failing!
