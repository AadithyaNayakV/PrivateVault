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
