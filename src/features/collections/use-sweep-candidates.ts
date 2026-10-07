"use client";
import {useQuery} from '@tanstack/react-query';
import {marketplaceRequest,tokenFromApi,orderFromApi} from '@/lib/marketplace/api-client';
import {useMarketCurrency} from '@/lib/marketplace/currency-store';
import {decodeRangeFilterValue,type ActiveFilters} from '@/lib/marketplace/traits';
import {cartItemFromTokenListing,cheapestListingByTokenId} from '@/features/cart/listing-utils';
import type {ApiPage,ApiToken} from '@/lib/marketplace/types';
export function useSweepCandidates(collection:string,activeFilters:ActiveFilters){
 const currency=useMarketCurrency(s=>s.currency);
 const filters=Object.entries(activeFilters).map(([name,values])=>{const range=[...values].map(decodeRangeFilterValue).find(Boolean);return range?{name,...range}:{name,values:[...values].map(v=>v==='true'?true:v==='false'?false:/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):v)};});
 return useQuery({queryKey:['owned','sweep',collection,currency,filters],queryFn:async()=>{
  const page=await marketplaceRequest<ApiPage<ApiToken>>(`/collections/${collection}/tokens`,{currency,filters,sort:'price-asc',listedOnly:true,limit:50});
  return page.items.flatMap(token=>{if(!token.bestListing)return [];const listing=cheapestListingByTokenId([orderFromApi(token.bestListing)]).get(token.tokenId);return listing?[cartItemFromTokenListing(tokenFromApi(token),collection,listing)]:[];});
 }});
}
