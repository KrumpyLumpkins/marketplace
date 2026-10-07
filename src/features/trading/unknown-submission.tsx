'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export type Reconciliation = { transactionHash: string } | { confirmedNotSubmitted: true };
export function UnknownSubmission({ onReconcile, busy = false }: {
  onReconcile: (result: Reconciliation) => Promise<void>; busy?: boolean;
}) {
  const id = useId();
  const [hash, setHash] = useState(''), [hashConfirmed, setHashConfirmed] = useState(false);
  const [notSubmitted, setNotSubmitted] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('');
  const disabled = busy || working;
  async function recover(result: Reconciliation) {
    setWorking(true); setError('');
    try { await onReconcile(result); }
    catch (e) { setError(e instanceof Error ? e.message : 'Recovery failed. Your attempt is still saved.'); }
    finally { setWorking(false); }
  }
  return <section aria-labelledby={`${id}-title`} className="w-full min-w-0 space-y-4 rounded-md border p-4 text-sm">
    <h2 id={`${id}-title`} className="font-medium">Check an unknown submission</h2>
    <p className="text-muted-foreground">Your wallet disconnected before returning a result. Check its activity before trading again. Neither option below submits a transaction.</p>
    <div className="space-y-3">
      <label htmlFor={`${id}-hash`}>Transaction hash from your wallet</label>
      <Input id={`${id}-hash`} value={hash} disabled={disabled} onChange={e => { setHash(e.target.value); setHashConfirmed(false); }} placeholder="0x…" autoComplete="off" maxLength={66} className="min-w-0 font-mono" />
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={hashConfirmed} disabled={disabled} onChange={e => setHashConfirmed(e.target.checked)} /><span>This is the transaction for this action in my wallet activity.</span></label>
      <Button className="h-auto min-h-11 w-full whitespace-normal py-2" disabled={disabled || !hashConfirmed || !/^0x[\da-f]+$/i.test(hash.trim()) || BigInt(hash.trim()) === 0n} onClick={() => void recover({ transactionHash: hash.trim() })}>Verify transaction and check status</Button>
    </div>
    <div className="space-y-3 border-t pt-4">
      <p className="text-muted-foreground">If the wallet confirms nothing was submitted, you can clear this attempt. An empty activity list alone is not confirmation.</p>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={notSubmitted} disabled={disabled} onChange={e => setNotSubmitted(e.target.checked)} /><span>My wallet confirms this transaction was not submitted.</span></label>
      <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-2" disabled={disabled || !notSubmitted} onClick={() => void recover({ confirmedNotSubmitted: true })}>Clear unsubmitted attempt</Button>
    </div>
    {error && <p role="alert" className="break-words text-destructive">{error}</p>}
  </section>;
}
