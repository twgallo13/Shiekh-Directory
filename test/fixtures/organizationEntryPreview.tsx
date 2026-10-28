// Actual components with synthetic bootstrap/auth. No cloud calls or live business data.
import React, { useState } from 'react';
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
if (new URLSearchParams(window.location.search).has('legacyRegion')) {
  delete seed.regions[0].leadershipModelVersion; delete seed.regions[0].leadershipVersion; delete seed.regions[0].regionalManagerId;
}
window.fetch = async (url, init) => {
  if (!String(url).startsWith('/api/')) return nativeFetch(url,init);
  if (String(url).endsWith('/capabilities')) return Response.json({ schemaVersion:1,catalogEnabled:true,recoveryEnabled:true,newCommandsEnabled:true });
  if (init?.method === 'POST') {
    const view = new URLSearchParams(window.location.search).get('view');
    if (!['create','quick'].includes(view ?? '') || !String(url).endsWith('/commit')) throw new Error('This entry-point fixture never writes.');
    if (failCreate) { failCreate = false; return Response.json({error:{code:'validation_error',message:'Synthetic create rejected. Your draft is kept.'}},{status:400}); }
    const body=JSON.parse(String(init.body));
    return Response.json({records:body.writes.map((w:any)=>({...w,data:{...w.data,id:w.id,version:1}}))});
  }
  return Response.json(seed);
};
function Preview() {
  const view=new URLSearchParams(locationSearch()).get('view'), [open,setOpen] = useState(view === 'store' || view === 'create');
  return <AuthContext.Provider value={auth}><DirectoryProvider seed={seed}><main className="mx-auto max-w-5xl space-y-4 p-5 font-sans"><h1 className="text-lg font-semibold">Synthetic managed hierarchy editing</h1><CreatedLocations />{view==='quick'?<AdminIntegrationsView />:<><button onClick={()=>setOpen(true)}>Open store editor</button><HierarchyRegistryPanel />{open && <LocationEditModal mode={view==='create'?'create':'edit'} location={location} onClose={()=>setOpen(false)} />}</>}</main></DirectoryProvider></AuthContext.Provider>;
}
function CreatedLocations(){ const {locations}=useDirectory(); return <ul aria-label="Synthetic confirmed locations">{locations.filter(l=>l.id!=='007').map(l=><li key={l.id}>#{l.storeNumber} {l.name} · DM: {l.districtManagerName || 'Vacant'} · RM: {l.regionalManagerName || 'Vacant'} · Version {l.version}</li>)}</ul>; }
function locationSearch() { return window.location.search; }
createRoot(document.getElementById('root')!).render(<Preview />);
