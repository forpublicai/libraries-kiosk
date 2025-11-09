import { DEFAULT_SERVER_BASE_URL, API_TIMEOUT_MS } from "./config.js";
import { generateIdentity, encryptPayload, serializeCipher } from "./lib/crypto.js";

// Firefox MV2 storage API compatibility wrappers
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

const DEFAULT_SETTINGS = {
	serverBaseUrl: DEFAULT_SERVER_BASE_URL,
	currentUsername: "",
	ttlSeconds: 600,
	acceptPrompt: "on"
};

const LOCAL_STATE_DEFAULT = {
	identityPrivateKey: null,
	identityPublicKey: null,
	authSecret: null,
	registeredUsername: null
};

function cloneCookieForTransfer(cookie, fallbackHost) {
	const partitionKey = cookie.partitionKey ? { ...cookie.partitionKey } : undefined;
	return {
		name: cookie.name,
		value: cookie.value,
		domain: cookie.domain || undefined,
		path: cookie.path || "/",
		secure: cookie.secure,
		httpOnly: cookie.httpOnly,
		sameSite: cookie.sameSite,
		expirationDate: cookie.expirationDate,
		storeId: cookie.storeId,
		firstPartyDomain: cookie.firstPartyDomain,
		sameParty: cookie.sameParty,
		priority: cookie.priority,
		partitionKey,
		hostOnly: cookie.hostOnly,
		session: cookie.session,
		domainFallback: fallbackHost
	};
}

async function collectCookies(urlObject) {
	const [byUrl, byDomain] = await Promise.all([
		chrome.cookies.getAll({ url: urlObject.href }),
		chrome.cookies.getAll({ domain: urlObject.hostname })
	]);
	const combined = [...byUrl, ...byDomain];
	const seen = new Map();
	for (const cookie of combined) {
		const keyParts = [
			cookie.name,
			cookie.domain || urlObject.hostname,
			cookie.path || "/",
			cookie.storeId || "default",
			cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : ""
		];
		const key = keyParts.join("|");
		if (!seen.has(key)) {
			seen.set(key, cloneCookieForTransfer(cookie, urlObject.hostname));
		}
	}
	return Array.from(seen.values());
}

async function getSettings() {
	return storageGet('sync', DEFAULT_SETTINGS);
}

async function getLocalState() {
	return storageGet('local', LOCAL_STATE_DEFAULT);
}

async function saveLocalState(partial) {
	return storageSet('local', partial);
}

async function ensureIdentity() {
	const state = await getLocalState();
	if (state.identityPrivateKey && state.identityPublicKey) {
		return state;
	}
	const keys = await generateIdentity();
	const nextState = {
		identityPrivateKey: keys.privateJwk,
		identityPublicKey: keys.publicJwk,
		registeredUsername: state.registeredUsername || null,
		authSecret: state.authSecret || null
	};
	await saveLocalState(nextState);
	return nextState;
}

function withTimeout(promise, timeoutMs, message) {
	let timeoutId;
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
	});
	return Promise.race([
		promise.finally(() => clearTimeout(timeoutId)),
		timeoutPromise
	]);
}

async function apiFetch(baseUrl, path, options = {}) {
	const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
	const mergedOptions = Object.assign(
		{
			headers: {
				"Content-Type": "application/json"
			}
		},
		options
	);

	const response = await withTimeout(fetch(url, mergedOptions), API_TIMEOUT_MS, "API request timed out.");
	const contentType = response.headers.get("content-type") || "";
	const parseJson = () => (contentType.includes("application/json") ? response.json() : response.text());

	if (!response.ok) {
		const errorPayload = await parseJson();
		const message = typeof errorPayload === "string"
			? errorPayload
			: (errorPayload?.error || errorPayload?.message || (Array.isArray(errorPayload?.errors) ? errorPayload.errors.join(", ") : undefined));
		throw new Error(message || `Request failed with status ${response.status}`);
	}

	if (response.status === 204) {
		return null;
	}

	return parseJson();
}

async function notify(title, message) {
	try {
		const iconUrl = chrome.runtime.getURL("icons/icon128.png");
		await chrome.notifications.create({ type: "basic", iconUrl, title, message });
	} catch (_) {}
}

async function registerIdentityIfNeeded() {
	const settings = await getSettings();
	const username = settings.currentUsername?.trim();
	if (!username) {
		throw new Error("Set your username in extension options.");
	}
	const state = await ensureIdentity();
	if (state.registeredUsername === username && state.authSecret) {
		return state;
	}

	const baseUrl = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
	const body = { publicKey: state.identityPublicKey };
	if (state.authSecret && state.registeredUsername === username) {
		body.authSecret = state.authSecret;
	}

	const response = await apiFetch(baseUrl, `/v1/users/${encodeURIComponent(username)}`, {
		method: "POST",
		body: JSON.stringify(body)
	});

	const nextState = {
		identityPrivateKey: state.identityPrivateKey,
		identityPublicKey: state.identityPublicKey,
		registeredUsername: username,
		authSecret: response.authSecret || state.authSecret || null
	};
	await saveLocalState(nextState);
	return nextState;
}

async function ensureContentScript(tabId) {
	return new Promise((resolve, reject) => {
		chrome.tabs.executeScript(tabId, {
			file: "content/capture.js"
		}, (result) => {
			if (chrome.runtime.lastError) {
				// Ignore "already injected" type errors
				if (chrome.runtime.lastError.message && 
				    /Loading of script failed or timed out/i.test(chrome.runtime.lastError.message)) {
					resolve();
				} else {
					reject(new Error(chrome.runtime.lastError.message));
				}
			} else {
				resolve(result);
			}
		});
	});
}

async function collectStorage(tabId) {
	await ensureContentScript(tabId);
	// Small delay to ensure content script is ready (Firefox MV2 quirk)
	await new Promise(resolve => setTimeout(resolve, 100));
	
	return new Promise((resolve, reject) => {
		chrome.tabs.sendMessage(tabId, { type: "collect-storage" }, (response) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			if (!response) {
				reject(new Error("No response from content script."));
				return;
			}
			if (!response.ok) {
				reject(new Error(response.error || "Failed to collect storage."));
				return;
			}
			resolve({
				localStorage: response.localStorage || [],
				sessionStorage: response.sessionStorage || []
			});
		});
	});
}

async function captureSessionData(tab) {
	if (!tab?.url || !tab.url.startsWith("http")) {
		throw new Error("Active tab must be an http(s) page.");
	}
	const url = new URL(tab.url);
	const cookies = await collectCookies(url);
	const storage = await collectStorage(tab.id);

	return {
		version: 1,
		capturedAt: new Date().toISOString(),
		targetOrigin: url.origin,
		targetPath: url.pathname || "/",
		url: tab.url,
		cookies,
		localStorage: storage.localStorage,
		sessionStorage: storage.sessionStorage
	};
}

async function handleShareSession(payload) {
	console.log('[PublicPass] Starting share session...', payload);
	try {
		const settings = await getSettings();
		console.log('[PublicPass] Settings loaded:', { username: settings.currentUsername });
		const baseUrl = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
		const username = settings.currentUsername?.trim();
		if (!username) {
			throw new Error("Set your username in extension options.");
		}

		console.log('[PublicPass] Registering identity...');
		const state = await registerIdentityIfNeeded();
		console.log('[PublicPass] Identity registered');

		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab) {
			throw new Error("No active tab found.");
		}
		console.log('[PublicPass] Active tab:', tab.url);

		console.log('[PublicPass] Capturing session data...');
		const sessionData = await captureSessionData(tab);
		console.log('[PublicPass] Session captured:', { 
			cookies: sessionData.cookies.length,
			localStorage: sessionData.localStorage.length,
			sessionStorage: sessionData.sessionStorage.length
		});

		console.log('[PublicPass] Fetching recipient public key...');
		const recipientRecord = await apiFetch(baseUrl, `/v1/users/${encodeURIComponent(payload.recipientUsername)}`);
		console.log('[PublicPass] Recipient found');

		console.log('[PublicPass] Encrypting payload...');
		const cipherBundle = await encryptPayload({
			payload: sessionData,
			senderPrivateJwk: state.identityPrivateKey,
			senderPublicJwk: state.identityPublicKey,
			recipientPublicJwk: recipientRecord.publicKey,
			targetOrigin: sessionData.targetOrigin
		});
		console.log('[PublicPass] Payload encrypted');

		const body = {
			recipient: payload.recipientUsername,
			cipher: serializeCipher(cipherBundle),
			alg: cipherBundle.alg,
			cmp: cipherBundle.cmp,
			ttlSec: Number(settings.ttlSeconds) || 600,
			meta: {
				targetOrigin: sessionData.targetOrigin,
				targetPath: sessionData.targetPath,
				comment: payload.comment?.trim() || "",
				sender: username,
				sessionDurationSec: Number(payload.sessionDurationSec) || 0
			}
		};

		console.log('[PublicPass] Sending to inbox...');
		await apiFetch(baseUrl, "/v1/inbox", {
			method: "POST",
			body: JSON.stringify(body)
		});
		console.log('[PublicPass] Session sent successfully!');

		return { sent: true };
	} catch (error) {
		console.error('[PublicPass] Share session failed:', error);
		throw error;
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "share-session") {
		handleShareSession(message.payload || {})
			.then((result) => sendResponse({ ok: true, result }))
			.catch((error) => sendResponse({ error: error.message }));
		return true;
	}
	if (message?.type === "register-identity") {
		registerIdentityIfNeeded()
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ error: error.message }));
		return true;
	}
	return undefined;
});

chrome.runtime.onInstalled.addListener(() => {
	registerIdentityIfNeeded().catch(() => {});
});

// Simple periodic poll for pending requests and notify admin
async function pollRequestsAndNotify() {
	try {
		const settings = await getSettings();
		const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
		const user = settings.currentUsername?.trim();
		if (!user) return;
		const authSecret = (await storageGet('local', { authSecret: null }))?.authSecret;
		const url = `${base.replace(/\/+$/, '')}/v1/requests/poll?username=${encodeURIComponent(user)}&authSecret=${encodeURIComponent(authSecret || '')}&limit=50`;
		const resp = await fetch(url);
		if (!resp.ok) return;
		const data = await resp.json();
		const count = Array.isArray(data.items) ? data.items.length : 0;
		if (count > 0) {
			await notify('PublicPass', `${count} request${count === 1 ? '' : 's'} awaiting review`);
		}
	} catch (_) {}
}

chrome.alarms.create('pp-requests-poll', { periodInMinutes: 3 });
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === 'pp-requests-poll') {
		pollRequestsAndNotify().catch(() => {});
	}
});