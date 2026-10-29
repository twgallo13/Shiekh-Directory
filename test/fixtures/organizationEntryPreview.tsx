// Actual components with synthetic bootstrap/auth. No cloud calls or live business data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AuthContext } from '../../src/context/AuthContext';
import { DirectoryProvider } from '../../src/context/DirectoryContext';
import { HierarchyRegistryPanel } from '../../src/components/admin/HierarchyRegistryPanel';
import { LocationEditModal } from '../../src/components/locations/LocationEditModal';
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
if (new URLSearchParams(window.location.search).has('legacyRegion')) {
  delete seed.regions[0].leadershipModelVersion; delete seed.regions[0].leadershipVersion; delete seed.regions[0].regionalManagerId;
}
window.fetch = async (url, init) => {
  if (!String(url).startsWith('/api/')) return nativeFetch(url,init);
  if (String(url).endsWith('/capabilities')) return Response.json({ schemaVersion:1,catalogEnabled:true,recoveryEnabled:true,newCommandsEnabled:true });
  if (init?.method === 'POST') throw new Error('This entry-point fixture never writes.');
  return Response.json(seed);
};
function Preview() {
  const [open,setOpen] = useState(new URLSearchParams(locationSearch()).get('view') === 'store');
  return <AuthContext.Provider value={auth}><DirectoryProvider seed={seed}><main className="mx-auto max-w-5xl space-y-4 p-5 font-sans"><h1 className="text-lg font-semibold">Synthetic managed hierarchy editing</h1><button onClick={()=>setOpen(true)}>Open store editor</button><HierarchyRegistryPanel />{open && <LocationEditModal location={location} onClose={()=>setOpen(false)} />}</main></DirectoryProvider></AuthContext.Provider>;
}
function locationSearch() { return window.location.search; }
createRoot(document.getElementById('root')!).render(<Preview />);
