import { scrypt, timingSafeEqual } from 'node:crypto';
// Fixed scrypt parameters: approximately 16 MiB memory, parallelization factor 5.
export function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export function validPasswordHash(hash: string) {
  return /^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(hash);
}
export async function verifyPassword(password: string, hash: string) {
  if (!validPasswordHash(hash)) return false;
  const parts = hash.split('$');
  return timingSafeEqual(await derivePassword(password, parts[4]), Buffer.from(parts[5], 'hex'));
}
