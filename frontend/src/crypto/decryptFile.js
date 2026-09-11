import { deriveKey, base64ToBuffer } from "./deriveKey";

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
    throw new Error("Decryption failed — wrong password or corrupted file.");
  }
}

// encryptedNameBase64 is base64(nameIv[12 bytes] || nameCiphertext) — see
// encryptFile.js's encryptNameWithKey for why the name has its own IV.
export async function decryptName(encryptedNameBase64, saltBase64, password, kdfIterations) {
  try {
    const packed = new Uint8Array(base64ToBuffer(encryptedNameBase64));
    const nameIv = packed.slice(0, 12);
    const nameCiphertext = packed.slice(12);
    const salt = base64ToBuffer(saltBase64);
    const key = await deriveKey(password, salt, kdfIterations);

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nameIv },
      key,
      nameCiphertext
    );
    return new TextDecoder().decode(plaintextBuffer);
  } catch (err) {
    // Also catches malformed/non-base64 input, e.g. a file uploaded before
    // filenames were encrypted client-side.
    throw new Error("Decryption failed — wrong password or corrupted file.");
  }
}
