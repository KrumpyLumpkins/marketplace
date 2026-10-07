import {useEffect,useState} from 'react';
import type {Meta,StoryObj} from '@storybook/nextjs-vite';
import {expect} from 'storybook/test';
import {createMarketplaceClient} from '@biblio/marketplace';
import {MarketplaceExample} from '../../examples/marketplace-react/marketplace';
function Consumer({name,fail=false}:{name:string;fail?:boolean}){
 const [client]=useState(()=>createMarketplaceClient({apiUrl:'https://fixture.example',chain:name,chainId:'0x1',fetch:async()=>new Response(JSON.stringify(fail?{error:{message:'Indexer offline',code:'OFFLINE'}}:{data:[{address:'0xa',name,tokenCount:'12',listingCount:'8',floorByCurrency:[]}]}),{status:fail?503:200})}));
 useEffect(()=>()=>client.dispose(),[client]);
 return <MarketplaceExample client={client}/>;
}
const meta={title:'Integration/SDK consumer',parameters:{layout:'padded'}} satisfies Meta;export default meta;type Story=StoryObj<typeof meta>;
export const IsolatedApplications:Story={render:()=> <div className="grid gap-4 md:grid-cols-2"><Consumer name="Game A"/><Consumer name="Game B"/></div>,play:async({canvas})=>{expect(await canvas.findByText('Game A')).toBeVisible();expect(await canvas.findByText('Game B')).toBeVisible();}};
export const UnavailableIndexer:Story={render:()=> <Consumer name="Unavailable" fail/>,play:async({canvas})=>{expect(await canvas.findByRole('alert')).toHaveTextContent('Indexer offline');expect(canvas.getByRole('button',{name:'Retry'})).toBeEnabled();}};
