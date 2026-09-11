# PrivateVault — Client-Side Encryption Design

All cryptography that touches plaintext happens **in the browser**, using the native **Web Crypto API**. The backend never sees a plaintext file, an encryption password, or a raw AES key.

## 1. Two Separate Passwords

| | Account Password | Encryption Password |
|---|---|---|
| Used for | Login | Deriving the AES file key |
| Sent to server? | Yes (over HTTPS, for auth only) | **Never** |
| Stored server-side? | As a hash only | Never, in any form |

Recommendation for this project: implement **Model B** (separate passwords) — it's the actual "zero-knowledge" claim of the project and is straightforward to demo. Model A (same password for both) is easier but weakens the security story you're trying to demonstrate.

## 2. Key Derivation (PBKDF2 via Web Crypto)

```js
// crypto/deriveKey.js
export async function deriveKey(password, saltBytes, iterations = 250000) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,          // not extractable — key material never leaves WebCrypto
    ["encrypt", "decrypt"]
  );
}
```

- `saltBytes`: `crypto.getRandomValues(new Uint8Array(16))` — generate fresh per file (or once per user, documented trade-off — see §5).
- `iterations`: 250,000+ is a reasonable modern default for PBKDF2-SHA256; store the value used per file so you can raise it later without breaking old files.
- `extractable: false` keeps the raw key material inaccessible to JS — only usable via `crypto.subtle` calls, which reduces the risk of accidental leakage (e.g. via `console.log` or an XSS bug).

## 3. Encrypting a File

```js
// crypto/encryptFile.js
export async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is the recommended GCM IV size
  const key = await deriveKey(password, salt, 250000);

  const plaintextBuffer = await file.arrayBuffer();

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBuffer
  );

  return {
    ciphertext: new Blob([ciphertextBuffer]),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    kdfIterations: 250000,
  };
}

function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
```

Note: `crypto.subtle.encrypt` with AES-GCM appends a 16-byte authentication tag to the output automatically — you don't need to handle it separately. If the ciphertext is tampered with, decryption below will throw, which is your integrity check.

## 4. Decrypting a File

```js
// crypto/decryptFile.js
export async function decryptFile(ciphertextBuffer, ivBase64, saltBase64, password, kdfIterations) {
  const iv = base64ToBuffer(ivBase64);
  const salt = base64ToBuffer(saltBase64);
  const key = await deriveKey(password, salt, kdfIterations);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertextBuffer
    );
    return plaintextBuffer;
  } catch (err) {
    // Decryption failure means either wrong password OR tampered/corrupted ciphertext.
    throw new Error("Decryption failed — wrong password or corrupted file.");
  }
}

function base64ToBuffer(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}
```

Trigger a browser download of the resulting plaintext with a standard `Blob` + `<a download>` pattern.

## 5. Salt Strategy — Two Options

**Option A (simpler, fine for the assignment):** One master key derived from a single salt stored on the user's account (e.g. returned at login or stored in a `users.kdf_salt` column). Every file uses the same derived key. Simpler to implement; downside is you can't easily rotate the encryption password.

**Option B (stronger, "advanced enhancement" in your writeup):** A fresh random salt (and thus effectively a fresh key) per file, OR a per-file random "file key" that is itself wrapped by a master key derived from the encryption password. This is the pattern in the original spec (§12.2) and is worth describing in your report even if you implement Option A for the working prototype.

Recommendation: build Option A first to get a working end-to-end demo, then note Option B as future work — this is a very natural "Objectives met / Future enhancements" section for your report.

## 6. What the Backend Must Validate (Even Though It Can't Read Files)

Even though the server never decrypts anything, it still must:
- Validate ciphertext size against `MAX_UPLOAD_MB` before writing to disk.
- Generate the storage filename itself (UUID) — never trust a client path.
- Never log the encryption password (it should never even be sent, but defense in depth: also never log full request bodies of any auth-adjacent endpoint).

## 7. Suggested Password Requirements (Frontend Validation)

- Account password: min 10 chars, at least 1 number — enforced for login UX.
- Encryption password: **do not artificially weaken this** — encourage a strong, memorable passphrase, and clearly warn the user: *"If you forget this password, your files cannot be recovered — the server does not know it and cannot reset it."* This warning is itself a good thing to show off in your demo/report as evidence you understand the zero-knowledge trade-off.
