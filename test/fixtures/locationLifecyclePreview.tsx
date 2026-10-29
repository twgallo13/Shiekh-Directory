// Local Vite-only acceptance fixture. Synthetic account, records, HTTP and receipts; no cloud calls.
import React,{StrictMode,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {LocationLifecycleReviewRuntime} from '../../src/components/admin/LocationLifecycleReview';
import {Modal} from '../../src/components/common/Modal';
import {createSessionBoundary} from '../../src/lib/authSession';
import {LOCATION_LIFECYCLE_RECOVERY_PREFIX} from '../../src/lib/organizationLeadershipRecovery';
import {refreshTransitionSavedState} from '../../src/lib/transitionSavedRefresh';
import {lifecycleBrowserFixture,lifecycleBrowserReview} from '../helpers/locationLifecycleBrowserFixture';
import {AuthContext} from '../../src/context/AuthContext';
import {DirectoryProvider} from '../../src/context/DirectoryContext';
import {LocationsView} from '../../src/components/locations/LocationsView';
import {HierarchyRegistryPanel} from '../../src/components/admin/HierarchyRegistryPanel';
const uid='synthetic-lifecycle-preview',boundary=createSessionBoundary(),params=new URLSearchParams(location.search);
const session={status:'authorized' as const,user:{uid,getIdToken:async()=>'synthetic-token'},account:{uid,role:params.has('nonAdmin')?'Directory Data Steward' as const:'System Administrator' as const,status:'Active' as const,accessScope:'Company-wide',personId:null,email:null,emailVerified:true,name:'Synthetic Admin',authenticationMethod:'test'},error:''};
boundary.update(session);
const auth={currentSession:boundary.snapshot,sessionGeneration:boundary.generation,onSessionBoundary:boundary.subscribe};
let data=lifecycleBrowserFixture(),drop=false,failRefresh=false,commits=0,prepares=0,previews=0;
const ops=new Map<string,any>(),reserved=new Set<string>(),nativeFetch=window.fetch.bind(window);
if(params.has('pendingOnly')){const at=Date.now();ops.set('server-pending',{schemaVersion:1,operationId:'server-pending',state:'prepared',updatedAt:new Date(at).toISOString(),expiresAt:new Date(at+600000).toISOString()});}
const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const changed=()=>window.dispatchEvent(new Event('synthetic-counts'));
const bootstrap=()=>({serverNow:new Date().toISOString(),locations:data.locations,people:[],users:[],requests:[],auditLogs:[],hoursTemplates:[],corporateHolidays:[],emailTemplates:[],notificationRules:[],outboxLogs:[],sopRunbooks:[],regions:data.catalog.units.filter(u=>u.unitType==='region').map(u=>({id:u.id,name:u.name,status:'Active' as const,version:u.version!,leadershipModelVersion:1,leadershipVersion:u.leadershipVersion!,regionalManagerId:u.primaryPersonId})),districts:data.catalog.units.filter(u=>u.unitType==='district').map(u=>({id:u.id,name:u.name,status:'Active' as const,regionId:u.regionId!,version:u.version!,leadershipModelVersion:1,leadershipVersion:u.leadershipVersion!,districtManagerId:u.primaryPersonId}))});
window.fetch=async(url,init)=>{
  const path=String(url);if(!path.startsWith('/api/'))return nativeFetch(url,init);
  if(boundary.snapshot().status!=='authorized')return reply({},401);
  if(path==='/api/auth/bootstrap')return failRefresh&&commits>0?reply({},503):reply(bootstrap());
  const mode=path.split('/').at(-1),body=init?.body?JSON.parse(String(init.body)):undefined;
  if(mode==='capabilities'){const lifecycle=path.includes('/location-lifecycle/'),enabled=lifecycle&&!params.has('allOff');return reply({schemaVersion:1,catalogEnabled:enabled&&!params.has('recoveryOnly'),newCommandsEnabled:enabled&&!params.has('recoveryOnly'),recoveryEnabled:enabled});}
  if(!path.includes('/location-lifecycle/'))return reply(bootstrap());
  if(mode==='catalog')return reply(data.catalog);
  if(mode==='operations')return reply({schemaVersion:1,complete:true,operations:[...ops.values()].filter(o=>o.state==='prepared').map(o=>({operationId:o.operationId,state:o.state,updatedAt:o.updatedAt,expiresAt:o.expiresAt}))});
  if(mode==='preview'){previews++;changed();return reply({schemaVersion:1,review:lifecycleBrowserReview(body,data,params.has('linkedAccount'))});}
  const id=body.operationId,current=ops.get(id);
  const outcome=(v:any)=>!v?{schemaVersion:1,operationId:id,state:'missing'}:v.state==='committed'?v:{schemaVersion:1,operationId:id,state:v.state,updatedAt:v.updatedAt};
  if(mode==='prepare'){const review=lifecycleBrowserReview(body,data,params.has('linkedAccount'));if(!review.ready)return reply({},409);prepares++;const at=Date.now(),p={schemaVersion:1,operationId:id,state:'prepared',updatedAt:new Date(at).toISOString(),expiresAt:new Date(at+600000).toISOString(),reviewHash:'a'.repeat(64),review};ops.set(id,{...p,intent:body});changed();return reply(p);}
  if(mode==='status')return reply(outcome(current));
  if(mode==='cancel'){if(current?.state==='committed')return reply(current);const v={schemaVersion:1,operationId:id,state:'cancelled',updatedAt:new Date().toISOString()};ops.set(id,v);changed();return reply(v);}
  if(mode==='commit'&&current?.state==='committed')return reply(current);
  if(mode==='commit'&&current?.state==='prepared'&&current.review){
    commits++;const r=current.review,l=data.locations.find(l=>l.id===r.locationId)!;
    if(r.action==='remove'){data.locations=data.locations.filter(x=>x.id!==l.id);reserved.add(l.id);}
    else{const h=r.after.hierarchy;Object.assign(l,{type:r.after.type,locationLifecycleModelVersion:1,hierarchyApplicability:h?'Applicable':'Not Applicable',districtId:h?.districtId??null,regionId:h?.regionId??null,districtManagerId:h?.districtManager.id??null,districtManagerName:h?.districtManager.name??'',regionalManagerId:h?.regionalManager.id??null,regionalManagerName:h?.regionalManager.name??'',storeManagerId:null,storeManagerName:'',assistantStoreManagerIds:[],keyHolderIds:[],version:l.version!+1});}
    data.catalog.evaluatedAt=new Date().toISOString();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['location-lifecycle-v1',uid,id])));
    const saved={schemaVersion:1,operationId:id,state:'committed',updatedAt:data.catalog.evaluatedAt,changedRecords:1,auditId:'location-lifecycle-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};ops.set(id,saved);changed();if(drop){drop=false;throw new TypeError('Synthetic lost reply');}return reply(saved);
  }
  return reply({},409);
};
function Preview(){
  const [open,setOpen]=useState(true),[key,setKey]=useState(0),[footer,setFooter]=useState<HTMLDivElement|null>(null),[saved,setSaved]=useState('Not refreshed'),[counts,setCounts]=useState('previews=0, prepares=0, commits=0'),close=useRef<(()=>void)|null>(null);
  useEffect(()=>{const update=()=>setCounts(`previews=${previews}, prepares=${prepares}, commits=${commits}, reserved=${[...reserved].join(',')}`);window.addEventListener('synthetic-counts',update);return()=>window.removeEventListener('synthetic-counts',update);},[]);
  return <main className="min-h-screen bg-neutral-100 p-4 font-sans"><div className="mx-auto max-w-3xl space-y-3"><h1 className="font-semibold">Synthetic location preview</h1><div className="flex flex-wrap gap-3 text-sm"><button onClick={()=>setOpen(true)}>Open location tools</button><button onClick={()=>{setOpen(false);data=lifecycleBrowserFixture();ops.clear();reserved.clear();previews=0;prepares=0;commits=0;drop=false;failRefresh=false;boundary.update(session);localStorage.removeItem(LOCATION_LIFECYCLE_RECOVERY_PREFIX+uid);setTimeout(()=>{setSaved('Not refreshed');setKey(v=>v+1);changed();setOpen(true);},100);}}>Reset preview</button><label><input type="checkbox" onChange={e=>{drop=e.target.checked;}}/>Lose next save reply</label><label><input type="checkbox" onChange={e=>{failRefresh=e.target.checked;}}/>Fail saved refresh</label></div><p role="status">{counts}</p><p>Saved locations: {saved}</p></div>{open&&<Modal isOpen title="Location use & removal" size="lg" footer={<div ref={setFooter} className="w-full"/>} onClose={()=>close.current?.()}><button className="mb-3 text-xs" onClick={()=>boundary.update({status:'signed-out',user:null,account:null,error:''})}>Simulate session ending</button><LocationLifecycleReviewRuntime key={key} auth={auth} registerClose={c=>{close.current=c;}} footerTarget={footer} onClose={()=>setOpen(false)} refreshSavedDirectory={async read=>{await refreshTransitionSavedState({session:boundary.snapshot,generation:boundary.generation,fence:()=>({epoch:0,pending:0}),read,apply:seed=>setSaved(seed.locations.map(l=>`${l.storeNumber}:${l.type}:v${l.version}`).join(' | '))});}}/></Modal>}</main>;
}
function Entry(){const [state,setState]=useState(boundary.snapshot);useEffect(()=>boundary.subscribe(()=>setState(boundary.snapshot())),[]);if(state.status!=='authorized')return <p>Signed out</p>;return <AuthContext.Provider value={{...state,...auth,signOut:async()=>{},retry(){},emailLink:null,clearEmailLink(){}}}><DirectoryProvider seed={bootstrap()}><main className="mx-auto max-w-5xl p-5 font-sans"><h1 className="mb-5 font-semibold">Synthetic location entry points</h1>{params.get('entry')==='locations'?<LocationsView onSelectLocation={()=>{}} onEditLocation={()=>{}} onAddNewLocation={()=>{}} onRequestCorrection={()=>{}}/>:<HierarchyRegistryPanel/>}</main></DirectoryProvider></AuthContext.Provider>;}
createRoot(document.getElementById('root')!).render(<StrictMode>{params.has('entry')?<Entry/>:<Preview/>}</StrictMode>);
