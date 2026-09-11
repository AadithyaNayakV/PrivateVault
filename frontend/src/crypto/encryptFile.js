import { deriveKey, bufferToBase64 } from "./deriveKey";

const KDF_ITERATIONS = 250000;

export async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);

  const plaintextBuffer = await file.arrayBuffer();

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBuffer
  );

  const encryptedName = await encryptNameWithKey(file.name, key);

  return {
    ciphertext: new Blob([ciphertextBuffer]),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    kdfIterations: KDF_ITERATIONS,
    encryptedName,
  };
}

// The filename is encrypted under the SAME derived key as the file content,
// but needs its own fresh IV — reusing the content IV with the same key
// would break AES-GCM's confidentiality guarantee. Since the DB only has a
// single `iv` column (for the file content), the name's IV is packed in
// front of its ciphertext and the whole thing is stored as one base64
// string in `encrypted_name` — no schema change needed.
async function encryptNameWithKey(name, key) {
  const nameIv = crypto.getRandomValues(new Uint8Array(12));
  const nameCiphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nameIv },
    key,
    new TextEncoder().encode(name)
  );

  const packed = new Uint8Array(nameIv.length + nameCiphertext.byteLength);
  packed.set(nameIv, 0);
  packed.set(new Uint8Array(nameCiphertext), nameIv.length);

  return bufferToBase64(packed);
}
