"use client";
import {getAppMarketplaceClient} from "./app-client";
import {useAccount} from '@starknet-react/core';import {useQuery,useQueryClient} from '@tanstack/react-query';import {useState} from 'react';import {marketplaceRequest} from './api-client';
export function useWalletSession(){const {account,address}=useAccount();const queryClient=useQueryClient();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const session=useQuery({queryKey:['owned','session',address],queryFn:()=>marketplaceRequest<{account:string|null}>('/auth/session')});
 async function login(){setBusy(true);setError('');try{if(!account||!address)throw new Error('Connect your wallet first.');await getAppMarketplaceClient().auth.verify(address,window.location.origin,data=>account.signMessage(data as Parameters<typeof account.signMessage>[0]));await queryClient.invalidateQueries({queryKey:['owned']});}catch(e){setError(e instanceof Error?e.message:'Wallet verification failed.');}finally{setBusy(false);}}
 return {account:session.data?.account,connectedAddress:address,verified:!!address&&!!session.data?.account&&BigInt(address)===BigInt(session.data.account),login,busy,error};}
