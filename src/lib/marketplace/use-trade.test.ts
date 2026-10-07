import {TransactionCoordinator,pendingStorageKey} from "@biblio/marketplace";
import {renderHook,act} from '@testing-library/react';import {beforeEach,expect,it,vi} from 'vitest';
import {useTrade} from './use-trade';
const {wallet,market,request,invalidate,execute,receipt,chain,sdkClient}=vi.hoisted(()=>({wallet:vi.fn(),market:vi.fn(),request:vi.fn(),invalidate:vi.fn(),execute:vi.fn(),receipt:vi.fn(),chain:vi.fn(),sdkClient:vi.fn()}));
vi.mock('./app-client',()=>({getAppMarketplaceClient:sdkClient}));
vi.mock('@starknet-react/core',()=>({useAccount:wallet}));vi.mock('./react',()=>({useMarketConfig:market}));vi.mock('./api-client',()=>({marketplaceRequest:request}));vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:invalidate})}));
const calls=[{contractAddress:'0x9',entrypoint:'cancel_order',calldata:['1']}];
beforeEach(()=>{sdkClient.mockReturnValue({options:{chain:'LOCAL',chainId:'0x1',expectedMarketplace:'0x9'},transactions:new TransactionCoordinator({request,invalidate,pollAttempts:1,sleep:async()=>{}})});localStorage.clear();vi.stubEnv('NEXT_PUBLIC_MARKETPLACE_ADDRESS','0x9');execute.mockReset().mockResolvedValue({transaction_hash:'0xaa'});receipt.mockReset().mockResolvedValue({finality_status:'ACCEPTED_ON_L2',execution_status:'SUCCEEDED',block_number:4});chain.mockReset().mockResolvedValue('0x1');request.mockReset().mockResolvedValue({reflected:true});wallet.mockReturnValue({address:'0x2',connector:{chainId:chain},account:{execute,waitForTransaction:receipt,getTransactionReceipt:receipt}});market.mockReturnValue({data:{chain:'LOCAL',chainId:'0x1',marketplace:'0x9',demo:false,status:{safeForCheckout:true}}});});
it('submits once, distinguishes acceptance from reflection and clears its persisted identity',async()=>{const {result}=renderHook(useTrade);let accepted;await act(async()=>{accepted=await result.current.execute(()=>calls);});expect(accepted).toBe(true);expect(execute).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith('/transactions/0xaa',{block:4});expect(result.current.state.stage).toBe('reflected');expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toBeNull();});
it('blocks a wrong wallet chain before constructing calldata',async()=>{chain.mockResolvedValue('0x2');const prepare=vi.fn();const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(prepare);});expect(prepare).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();expect(result.current.state.message).toContain('Switch your wallet');});
it('fails closed when the frontend deployment differs',async()=>{vi.stubEnv('NEXT_PUBLIC_MARKETPLACE_ADDRESS','0x8');const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(()=>calls);});expect(execute).not.toHaveBeenCalled();expect(result.current.state.stage).toBe('error');});
it('blocks demo and stale trading while still allowing paused cancellation',async()=>{market.mockReturnValue({data:{chain:'LOCAL',chainId:'0x1',marketplace:'0x9',demo:false,status:{safeForCheckout:false}}});const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(()=>calls);});expect(execute).not.toHaveBeenCalled();await act(async()=>{await result.current.execute(()=>calls,'cancel');});expect(execute).toHaveBeenCalledOnce();});
it('retains unknown transactions and offers recovery instead of duplicate signing',async()=>{receipt.mockRejectedValue(new Error('RPC offline'));const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(()=>calls);});expect(result.current.state.stage).toBe('submitted');expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toContain('0xaa');await act(async()=>{await result.current.execute(()=>calls);});expect(execute).toHaveBeenCalledOnce();receipt.mockResolvedValue({finality_status:'ACCEPTED_ON_L2',execution_status:'SUCCEEDED',block_number:4});await act(async()=>{await result.current.resume();});expect(result.current.state.stage).toBe('reflected');expect(execute).toHaveBeenCalledOnce();});
it('clears reverted pending state so an intentional retry is possible',async()=>{receipt.mockResolvedValue({finality_status:'ACCEPTED_ON_L2',execution_status:'REVERTED'});const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(()=>calls);});expect(result.current.state.stage).toBe('reverted');expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toBeNull();});
it('requires a connected wallet and preserves wallet rejection as an error',async()=>{wallet.mockReturnValue({});const {result}=renderHook(useTrade);await act(async()=>{await result.current.execute(()=>calls);});expect(result.current.state.message).toContain('Connect');expect(execute).not.toHaveBeenCalled();});

it('resumes a saved transaction after reload even when market config is unavailable',async()=>{market.mockReturnValue({data:undefined});localStorage.setItem(pendingStorageKey('0x2','LOCAL','0x9'),JSON.stringify({hash:'0xaa',account:'0x2',chain:'LOCAL',marketplace:'0x9',stage:'submitted'}));const {result}=renderHook(useTrade);await act(async()=>{await result.current.resume();});expect(result.current.state.stage).toBe('reflected');expect(execute).not.toHaveBeenCalled();});

it('reconciles a reloaded unknown submission with a verified wallet hash without signing again', async () => {
  const getTransaction = vi.fn().mockResolvedValue({ transaction_hash: '0xaa', sender_address: '0x2' });
  wallet.mockReturnValue({ ...wallet(), account: { ...wallet().account, getTransaction } });
  localStorage.setItem(pendingStorageKey('0x2','LOCAL','0x9'), JSON.stringify({ hash:'0x0', account:'0x2', chain:'LOCAL', marketplace:'0x9', stage:'submitted', unknown:true }));
  const { result } = renderHook(useTrade);
  await act(async () => { await result.current.resume(); });
  expect(result.current.state.unknownSubmission).toBe(true);
  await act(async () => { await result.current.reconcileUnknown({ transactionHash: '0xaa' }); });
  expect(getTransaction).toHaveBeenCalledWith('0xaa');
  expect(result.current.state.stage).toBe('reflected');
  expect(execute).not.toHaveBeenCalled();
});
it('keeps an unknown submission locked for wrong-account hashes and unavailable RPC', async () => {
  const getTransaction = vi.fn().mockResolvedValue({ transaction_hash:'0xaa', sender_address:'0x3' });
  wallet.mockReturnValue({ ...wallet(), account: { ...wallet().account, getTransaction } });
  execute.mockRejectedValue(new Error('Wallet disconnected'));
  const { result } = renderHook(useTrade);
  await act(async () => { await result.current.execute(() => calls); });
  expect(result.current.state.unknownSubmission).toBe(true);
  await act(async () => { await expect(result.current.reconcileUnknown({ transactionHash:'0xaa' })).rejects.toThrow(/wallet/i); });
  getTransaction.mockRejectedValue(new Error('RPC unavailable'));
  await act(async () => { await expect(result.current.reconcileUnknown({ transactionHash:'0xaa' })).rejects.toThrow(/RPC/); });
  await act(async () => { await result.current.execute(() => calls); });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toContain('"unknown":true');
});
it('clears unknown intent only after explicit wallet-confirmed non-submission', async () => {
  execute.mockRejectedValue(new Error('Wallet disconnected'));
  const { result } = renderHook(useTrade);
  await act(async () => { await result.current.execute(() => calls); });
  await act(async () => { await result.current.reconcileUnknown({ confirmedNotSubmitted:true }); });
  expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toBeNull();
  expect(result.current.state.stage).toBe('idle');
  expect(execute).toHaveBeenCalledTimes(1);
});
it('refuses recovery on the wrong network without clearing the saved attempt', async () => {
  execute.mockRejectedValue(new Error('Wallet disconnected'));
  const { result } = renderHook(useTrade);
  await act(async () => { await result.current.execute(() => calls); });
  chain.mockResolvedValue('0x2');
  await act(async () => { await expect(result.current.reconcileUnknown({ confirmedNotSubmitted:true })).rejects.toThrow(/network/); });
  expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toContain('"unknown":true');
});
it('refuses recovery if the account changes during hash verification', async () => {
  let complete!: (value: { transaction_hash:string; sender_address:string }) => void;
  const getTransaction = vi.fn(() => new Promise(resolve => { complete = resolve; }));
  wallet.mockReturnValue({ ...wallet(), account: { ...wallet().account, getTransaction } });
  execute.mockRejectedValue(new Error('Wallet disconnected'));
  const { result, rerender } = renderHook(useTrade);
  await act(async () => { await result.current.execute(() => calls); });
  let recovery!: Promise<void>;
  await act(async () => { recovery = result.current.reconcileUnknown({ transactionHash:'0xaa' }); await Promise.resolve(); });
  wallet.mockReturnValue({ ...wallet(), address:'0x3' });
  rerender();
  await act(async () => { complete({ transaction_hash:'0xaa', sender_address:'0x2' }); await expect(recovery).rejects.toThrow(/changed/); });
  expect(localStorage.getItem(pendingStorageKey('0x2','LOCAL','0x9'))).toContain('"unknown":true');
});
