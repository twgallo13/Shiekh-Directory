import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDirectory } from '../../context/DirectoryContext';
import type { LocationCreationCommand } from '../../lib/locationCreationContract';
import { createLocationCreationHttpPort } from '../../lib/locationCreationClient';
import { openLocationCreationWorkflow, type LocationCreationWorkflowState } from '../../lib/locationCreationWorkflow';

type Controller=Awaited<ReturnType<typeof openLocationCreationWorkflow>>;
/** Mounted only while a create surface is open; both surfaces share one actor lease/marker. */
export function useLocationCreation(active:boolean,onSaved:()=>void,onSessionClear?:()=>void){
  const auth=useAuth(),directory=useDirectory(),[state,setState]=useState<LocationCreationWorkflowState|null>(null),[attempt,setAttempt]=useState(0),[reviewDraft,setReviewDraft]=useState(false);
  const [draftId,setDraftId]=useState(()=>`loc-${crypto.randomUUID()}`),controller=useRef<Controller|null>(null),epoch=useRef(0),saved=useRef(onSaved),refresh=useRef(directory.refreshCreationDirectory);
  saved.current=onSaved;refresh.current=directory.refreshCreationDirectory;
  const clearDraft=useRef(onSessionClear);clearDraft.current=onSessionClear;
  useEffect(()=>active?auth.onSessionBoundary(()=>clearDraft.current?.()):undefined,[active]);
  useEffect(()=>{
    if(!active){setState(null);return;}
    const generation=++epoch.current,abort=new AbortController();let bound:Controller|null=null;setState(null);setReviewDraft(false);setDraftId(`loc-${crypto.randomUUID()}`);
    const port=createLocationCreationHttpPort({session:auth.currentSession,generation:auth.sessionGeneration,request:fetch});
    void openLocationCreationWorkflow({auth,port,storage:localStorage,locks:navigator.locks,subtle:crypto.subtle,signal:abort.signal,refreshSavedDirectory:()=>refresh.current(()=>port.directory()),onChange:value=>{
      if(epoch.current!==generation)return;setState(value);
      if(value.confirmedState==='cancelled'&&!value.locationId&&!value.busy)setReviewDraft(true);
    }}).then(c=>{bound=c;if(epoch.current!==generation)c.dispose();else controller.current=c;}).catch(()=>{});
    return()=>{epoch.current++;abort.abort();bound?.dispose();port.dispose();controller.current=null;};
  },[active,attempt]);
  useEffect(()=>{if(active&&state?.phase==='saved'&&!state.busy)saved.current();},[active,state?.phase,state?.busy]);
  const ready=!!state&&!state.busy&&!reviewDraft&&(state.phase==='legacy'||state.phase==='editing'&&state.capabilities?.newCommandsEnabled===true);
  return{state,draftId,ready,busy:!!state?.busy,
    submit:async(command:()=>LocationCreationCommand,legacy:()=>Promise<void>)=>{
      const c=controller.current;if(!c||!ready)throw new Error('Wait for creation recovery before saving.');
      if(c.snapshot().phase==='legacy'){await c.legacy(legacy);return;}
      await c.create(command());
    },
    panel:<LocationCreationRecovery state={state} reviewDraft={reviewDraft} retry={()=>setAttempt(v=>v+1)} act={(mode,id)=>{void controller.current?.[mode](id).catch(()=>{});}} reapply={()=>{setDraftId(`loc-${crypto.randomUUID()}`);setReviewDraft(false);}}/>,
  };
}
function LocationCreationRecovery({state,reviewDraft,retry,act,reapply}:{state:LocationCreationWorkflowState|null;reviewDraft:boolean;retry():void;act(mode:'recover'|'cancel',id:string):void;reapply():void}){
  if(!state)return <p role="status" className="p-3 text-sm text-neutral-600">Checking store creation…</p>;
  if(['editing','legacy'].includes(state.phase)&&!state.error&&!reviewDraft)return null;
  const ids=state.locationId?[state.locationId]:state.pending.map(p=>p.locationId);
  return <section aria-label="Store creation recovery" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-neutral-900">
    <p role={state.error?'alert':'status'}>{state.error|| (state.phase==='refresh-needed'?'The result is confirmed. Refresh saved information to finish.':reviewDraft?'The previous creation was cancelled. Review your retained details against the refreshed Directory.':state.phase==='saved'?'Location creation confirmed.':'A previous creation needs attention before you can add another location.')}</p>
    {state.capabilities?.recoveryEnabled&&ids.map((id,index)=><div key={id} className="flex flex-wrap items-center gap-2">{ids.length>1&&<span>Pending creation {index+1}</span>}<button type="button" disabled={state.busy} className="rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:opacity-50" onClick={()=>act('recover',id)}>Check result</button>{state.confirmedState!=='committed'&&<button type="button" disabled={state.busy} className="rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:opacity-50" onClick={()=>act('cancel',id)}>Cancel pending creation</button>}</div>)}
    {reviewDraft&&state.phase==='editing'&&<button type="button" disabled={state.busy} onClick={reapply} className="rounded-md bg-neutral-900 px-3 py-2 font-semibold text-white">Review retained draft</button>}
    {state.phase==='blocked'&&<button type="button" onClick={retry} className="rounded-md border border-neutral-300 bg-white px-3 py-2">Retry availability</button>}
  </section>;
}
