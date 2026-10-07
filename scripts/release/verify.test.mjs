import { expect, it } from 'vitest';
import { releaseEnvironment } from './verify.mjs';
it('pins fixture verification independently of inherited deployment settings', () => {
  const env = releaseEnvironment({NEXT_PUBLIC_MARKETPLACE_CHAIN_ID:'SN_SEPOLIA',NEXT_PUBLIC_MARKETPLACE_ADDRESS:'0x123',MARKETPLACE_API_URL:'https://private.example',PATH:'/bin'});
  expect(env.NEXT_PUBLIC_MARKETPLACE_CHAIN_ID).toBe('SN_MAIN');
  expect(env.NEXT_PUBLIC_MARKETPLACE_ADDRESS).toBe('');
  expect(env.MARKETPLACE_API_URL).toBe('http://127.0.0.1:3100');
  expect(env.PATH).toBe('/bin');
});
