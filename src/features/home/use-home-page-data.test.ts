import {createElement, type PropsWithChildren} from 'react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useHomePageData} from './use-home-page-data';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/lib/marketplace/api-client',()=>({marketplaceRequest:request}));
vi.mock('@/lib/marketplace/currency-store',()=>({useMarketCurrency:(select:(state:{currency:string})=>unknown)=>select({currency:'0x1'})}));
function wrapper({children}:PropsWithChildren){return createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},children);}
beforeEach(()=>{request.mockReset();});
it('uses indexed collection totals and only the selected currency floor',async()=>{
 request.mockResolvedValue([{address:'0xa',name:'Realms',tokenCount:'9001',listingCount:'203',floorByCurrency:[{currency:'0x2',price:'1'},{currency:'0x1',price:'2000000000000000000'}]}]);
 const {result}=renderHook(useHomePageData,{wrapper});await waitFor(()=>expect(result.current.isLoading).toBe(false));
 expect(request).toHaveBeenCalledWith('/collections');
 expect(result.current.collectionCards[0]).toMatchObject({name:'Realms',totalSupply:'9001',listingCount:'203',floorPrice:'2'});
 expect(result.current.trendingTokens).toEqual([]);
});
it('does not invent collections or activity during an outage',async()=>{request.mockRejectedValue(new Error('Offline'));const {result}=renderHook(useHomePageData,{wrapper});await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.collectionCards).toEqual([]);expect(result.current.featuredCollection).toBeNull();});
it('shows an empty catalog without an invented floor',async()=>{request.mockResolvedValue([]);const {result}=renderHook(useHomePageData,{wrapper});await waitFor(()=>expect(result.current.isLoading).toBe(false));expect(result.current.collectionCards).toEqual([]);});
