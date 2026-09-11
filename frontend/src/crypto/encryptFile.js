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

  return {
    ciphertext: new Blob([ciphertextBuffer]),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    kdfIterations: KDF_ITERATIONS,
  };
}
