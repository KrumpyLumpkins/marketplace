import { readFileSync, existsSync, lstatSync, openSync, writeFileSync, closeSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ec } from 'starknet-devnet-sdk';
import { hiddenInput } from '../configuration/hidden-input.mjs';

export function saveDeploymentEnvironment(path, values) {
  if (existsSync(path) && !lstatSync(path).isFile()) throw new Error('Environment destination must be a regular file.');
  const data = { ...(existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}), ...values };
  if (data.DEPLOYMENT_RPC_URL && !['http:', 'https:'].includes(new URL(data.DEPLOYMENT_RPC_URL).protocol)) throw new Error('Use an HTTP(S) RPC URL.');
  if (data.DEPLOYMENT_SIGNER_ADDRESS && (!/^0x[\da-f]{1,64}$/i.test(data.DEPLOYMENT_SIGNER_ADDRESS) || BigInt(data.DEPLOYMENT_SIGNER_ADDRESS) === 0n)) throw new Error('Invalid account address.');
  if (data.DEPLOYMENT_SIGNER_PRIVATE_KEY) {
    try { ec.starkCurve.getStarkKey(data.DEPLOYMENT_SIGNER_PRIVATE_KEY); }
    catch { throw new Error('Invalid Starknet private key.'); }
  }
  const text = '# Local deployment credentials. Do not commit or upload to Railway.\n' + Object.entries(data).map(([key, value]) => {
    if (!/^[A-Z_][A-Z_\d]*$/.test(key) || /['\r\n\0]/.test(value)) throw new Error('Unsupported environment value; encode special URL characters.');
    return `${key}='${value}'`;
  }).join('\n') + '\n';
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, text); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
    const path = fileURLToPath(new URL('../../.env.deployment', import.meta.url));
    console.log('Credentials stay in .env.deployment (mode 600). Blank input preserves existing values.');
    const values = {};
    for (const key of ['DEPLOYMENT_RPC_URL', 'DEPLOYMENT_SIGNER_ADDRESS', 'DEPLOYMENT_SIGNER_PRIVATE_KEY']) {
      const value = await hiddenInput(`${key} (hidden): `);
      if (value) values[key] = value;
    }
    const existing = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
    for (const key of ['DEPLOYMENT_RPC_URL', 'DEPLOYMENT_SIGNER_ADDRESS', 'DEPLOYMENT_SIGNER_PRIVATE_KEY']) {
      if (!(values[key] || existing[key])) throw new Error(`${key} is required.`);
    }
    if (values.DEPLOYMENT_SIGNER_PRIVATE_KEY) values.DEPLOYMENT_SIGNER_MODULE = '';
    saveDeploymentEnvironment(path, values);
    console.log('Saved local deployment environment. No transaction submitted.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
