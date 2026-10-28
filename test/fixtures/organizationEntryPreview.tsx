// Actual components with synthetic bootstrap/auth. No cloud calls or live business data.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AuthContext } from '../../src/context/AuthContext';
import { DirectoryProvider, useDirectory } from '../../src/context/DirectoryContext';
import { HierarchyRegistryPanel } from '../../src/components/admin/HierarchyRegistryPanel';
import { LocationEditModal } from '../../src/components/locations/LocationEditModal';
import { AdminIntegrationsView } from '../../src/components/admin/AdminIntegrationsView';
import { createSessionBoundary, type SessionState } from '../../src/lib/authSession';

const boundary = createSessionBoundary();
const session = { status: 'authorized', user: { uid: 'entry-preview', getIdToken: async () => 'synthetic-token' }, account: { uid: 'entry-preview', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', name: 'Synthetic Administrator', email: null, emailVerified: true, authenticationMethod: 'test', personId: null }, error: '' } as SessionState;
boundary.update(session);
const auth = { ...session, currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe, signOut: async () => {}, retry() {}, emailLink: null, clearEmailLink() {} };
const standardHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => [d,{ open:'10:00',close:'21:00',isClosed:false }]));
const location: any = { id:'007',storeNumber:'007',name:'Southland Mall',type:'Enclosed Mall',version:4,recordStatus:'Active',address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'(213) 555-0100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations',districtId:'01',regionId:'01',districtManagerId:'manager',districtManagerName:'Current Manager',regionalManagerId:'manager',regionalManagerName:'Current Manager',standardHours };
const seed: any = { locations:[location],people:[{ id:'manager',fullName:'Current Manager',version:1,status:'Active',activeStatus:true,positionIds:['district-manager','regional-manager'] }],users:[],hoursTemplates:[],corporateHolidays:[],emailTemplates:[],notificationRules:[],outboxLogs:[],sopRunbooks:[],customFieldDefinitions:[],requests:[],auditLogs:[],serverNow:new Date().toISOString(),
  regions:[{ id:'01',name:'West',status:'Active',version:1,leadershipModelVersion:1,leadershipVersion:1,regionalManagerId:'manager' }],districts:[{ id:'01',name:'Central',regionId:'01',status:'Active',version:3,leadershipModelVersion:1,leadershipVersion:1,districtManagerId:'manager' }] };
const nativeFetch = window.fetch.bind(window);
let failCreate = new URLSearchParams(window.location.search).has('failCreate');
let dropReply=new URLSearchParams(window.location.search).has('dropReply'), failRefresh=new URLSearchParams(window.location.search).has('failRefresh'), prepares=0,commits=0;
const receipts=new Map<string,any>();
const count=()=>window.dispatchEvent(new Event('creation-count'));
if (new URLSearchParams(window.location.search).has('legacyRegion')) {
  delete seed.regions[0].leadershipModelVersion; delete seed.regions[0].leadershipVersion; delete seed.regions[0].regionalManagerId;
}
window.fetch = async (url, init) => {
  if (!String(url).startsWith('/api/')) return nativeFetch(url,init);
  if(String(url).includes('/location-creations/')){
    if(String(url).endsWith('/capabilities'))return Response.json({schemaVersion:1,catalogEnabled:true,recoveryEnabled:true,newCommandsEnabled:true,legacyCreationEnabled:false});
    if(String(url).endsWith('/operations'))return Response.json({schemaVersion:1,complete:true,operations:[...receipts.values()].filter(r=>r.state==='prepared')});
    const body=JSON.parse(String(init?.body)),locationId=body.locationId??body.write?.id;
    if(String(url).endsWith('/status'))return Response.json(receipts.get(locationId)??{schemaVersion:1,locationId,state:'missing'});
    if(String(url).endsWith('/cancel')){const prior=receipts.get(locationId);if(prior?.state==='committed')return Response.json(prior);const value={schemaVersion:1,locationId,state:'cancelled',updatedAt:new Date().toISOString()};receipts.set(locationId,value);return Response.json(value);}
    if(String(url).endsWith('/prepare')){prepares++;count();const now=Date.now(),value={schemaVersion:1,locationId,state:'prepared',updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()};receipts.set(locationId,value);return Response.json(value);}
    if(String(url).endsWith('/commit')){
      commits++;count();if(failCreate){failCreate=false;return Response.json({error:{code:'location_creation_invalid_input',message:'Synthetic create rejected. Your draft is kept.'}},{status:400});}
      seed.locations.push({...body.write.data,id:locationId,version:1});
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['location-creation-v1',session.user!.uid,locationId])))),b=>b.toString(16).padStart(2,'0')).join('');
      const value={schemaVersion:1,locationId,state:'committed',updatedAt:new Date().toISOString(),createdVersion:1,auditId:`location-creation-${digest}`};receipts.set(locationId,value);
      if(dropReply){dropReply=false;throw new Error('Synthetic lost reply after successful save');}return Response.json(value);
    }
    throw new Error('Unexpected creation fixture route');
  }
  if(String(url).endsWith('/bootstrap')&&commits&&failRefresh){failRefresh=false;return Response.json({error:'Synthetic refresh outage'},{status:503});}
  if (String(url).endsWith('/capabilities')) return Response.json({ schemaVersion:1,catalogEnabled:true,recoveryEnabled:true,newCommandsEnabled:true });
  if (init?.method === 'POST') {
    const view = new URLSearchParams(window.location.search).get('view');
    if (!['create','quick','store'].includes(view ?? '') || !String(url).endsWith('/commit')) throw new Error('This entry-point fixture never writes.');
    if (failCreate) { failCreate = false; return Response.json({error:{code:'validation_error',message:'Synthetic create rejected. Your draft is kept.'}},{status:400}); }
    const body=JSON.parse(String(init.body));
    const records=[];for(const w of body.writes){const existing=seed.locations.find((l:any)=>l.id===w.id);if(w.collection!=='locations'||w.operation!=='set'||existing&&(existing.version??0)!==w.expectedVersion)return Response.json({error:{code:'conflict'}},{status:409});const data={...w.data,id:w.id,version:existing?existing.version+1:1};seed.locations=seed.locations.filter((l:any)=>l.id!==w.id);seed.locations.push(data);records.push({...w,data});}commits++;count();return Response.json({records});
  }
  return Response.json(seed);
};
function Preview() {
  const view=new URLSearchParams(locationSearch()).get('view'), [open,setOpen] = useState(view === 'store' || view === 'create');
  return <AuthContext.Provider value={auth}><DirectoryProvider seed={seed}><main className="mx-auto max-w-5xl space-y-4 p-5 font-sans"><h1 className="text-lg font-semibold">Synthetic managed hierarchy editing</h1><CreationCounts /><CreatedLocations />{view==='quick'?<AdminIntegrationsView />:<><button onClick={()=>setOpen(true)}>Open store editor</button><HierarchyRegistryPanel />{open && <CurrentEditor create={view==='create'} onClose={()=>setOpen(false)} />}</>}</main></DirectoryProvider></AuthContext.Provider>;
}
function CurrentEditor({create,onClose}:{create:boolean;onClose():void}){const {locations}=useDirectory();return <LocationEditModal mode={create?'create':'edit'} location={create?location:locations.find(l=>l.id==='007')??null} onClose={onClose}/>;}
function CreationCounts(){const [counts,setCounts]=useState([prepares,commits]);useEffect(()=>{const update=()=>setCounts([prepares,commits]);window.addEventListener('creation-count',update);return()=>window.removeEventListener('creation-count',update);},[]);return <output>Prepares {counts[0]} · Commits {counts[1]}</output>;}
function CreatedLocations(){ const {locations}=useDirectory(); return <ul aria-label="Synthetic confirmed locations">{locations.map(l=><li key={l.id}>#{l.storeNumber} {l.name} · {l.recordStatus} · {l.type} · DM: {l.districtManagerName || 'Vacant'} · RM: {l.regionalManagerName || 'Vacant'} · Version {l.version}</li>)}</ul>; }
function locationSearch() { return window.location.search; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
