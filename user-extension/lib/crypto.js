const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ENCODING_VERSION = 2;
const AES_KEY_LENGTH = 256;

async function gzipCompress(bytes) {
	try {
		if (!('CompressionStream' in self)) return { bytes, algo: null };
		const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
		const buf = await new Response(stream).arrayBuffer();
		return { bytes: new Uint8Array(buf), algo: 'gzip' };
	} catch (_) {
		return { bytes, algo: null };
	}
}

async function gzipDecompress(bytes) {
	if (!('DecompressionStream' in self)) return bytes;
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
	const buf = await new Response(stream).arrayBuffer();
	return new Uint8Array(buf);
}

function bufferToBase64(buffer) {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = '';
	bytes.forEach((b) => { binary += String.fromCharCode(b); });
	return btoa(binary).replace(/=+$/, '');
}

function base64ToUint8(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) { bytes[i] = binary.charCodeAt(i); }
	return bytes;
}

export async function generateIdentity() {
	const { privateKey, publicKey } = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
	);
	const [privateJwk, publicJwk] = await Promise.all([
		crypto.subtle.exportKey('jwk', privateKey),
		crypto.subtle.exportKey('jwk', publicKey),
	]);
	return { privateJwk, publicJwk };
}

async function importPrivateKey(privateJwk) {
	return crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}

async function importPublicKey(publicJwk) {
	return crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function deriveAesKey(privateJwk, peerPublicJwk, saltBytes, infoBytes) {
	const [privateKey, publicKey] = await Promise.all([
		importPrivateKey(privateJwk),
		importPublicKey(peerPublicJwk),
	]);
	const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, AES_KEY_LENGTH);
	const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', salt: saltBytes.buffer, info: infoBytes.buffer, hash: 'SHA-256' },
		hkdfKey,
		{ name: 'AES-GCM', length: AES_KEY_LENGTH },
		false,
		['encrypt', 'decrypt'],
	);
}

export async function encryptPayload({ payload, senderPrivateJwk, senderPublicJwk, recipientPublicJwk, targetOrigin }) {
	if (!senderPrivateJwk || !senderPublicJwk) throw new Error('Sender identity missing');
	if (!recipientPublicJwk) throw new Error('Recipient public key missing');
	const salt = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const info = encoder.encode(targetOrigin || '');
	const aesKey = await deriveAesKey(senderPrivateJwk, recipientPublicJwk, salt, info);
	const raw = encoder.encode(JSON.stringify(payload));
	const { bytes: compressed, algo } = await gzipCompress(raw);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: info }, aesKey, compressed);
	return {
		version: ENCODING_VERSION,
		alg: 'ecdh-hkdf-aesgcm',
		cmp: algo || undefined,
		salt: bufferToBase64(salt),
		iv: bufferToBase64(iv),
		ciphertext: bufferToBase64(ciphertext),
		senderPublicKey: senderPublicJwk,
		targetOrigin: targetOrigin || null,
	};
}

export async function decryptPayload({ bundle, recipientPrivateJwk, targetOrigin }) {
	if (!bundle || bundle.version !== ENCODING_VERSION) throw new Error('Unsupported cipher version');
	if (!bundle.senderPublicKey) throw new Error('Sender public key missing');
	const salt = base64ToUint8(bundle.salt || '');
	const iv = base64ToUint8(bundle.iv || '');
	const cipherBytes = base64ToUint8(bundle.ciphertext || '');
	const info = encoder.encode(targetOrigin || bundle.targetOrigin || '');
	const aesKey = await deriveAesKey(recipientPrivateJwk, bundle.senderPublicKey, salt, info);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: info }, aesKey, cipherBytes);
	let outBytes = new Uint8Array(plaintext);
	if (bundle.cmp === 'gzip') outBytes = await gzipDecompress(outBytes);
	return JSON.parse(decoder.decode(outBytes));
}

export function serializeCipher(bundle) {
	return JSON.stringify(bundle);
}

export function deserializeCipher(cipherText) {
	const parsed = JSON.parse(cipherText);
	if (parsed.version !== ENCODING_VERSION) throw new Error('Unsupported cipher version');
	return parsed;
}
