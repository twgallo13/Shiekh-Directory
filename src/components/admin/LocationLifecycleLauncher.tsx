import React,{useEffect,useRef,useState} from 'react';
import { useAuth } from '../../context/AuthContext';
import { LOCATION_LIFECYCLE_RECOVERY_PREFIX } from '../../lib/organizationLeadershipRecovery';
import { useOrganizationCapabilityState } from '../people/useOrganizationCapabilities';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { LocationLifecycleReview } from './LocationLifecycleReview';
/** Metadata discovery cannot enable a command or replace controller/server authority. */
export function LocationLifecycleLauncher({disabled=false,onOpenChange}:{disabled?:boolean;onOpenChange?(open:boolean):void}){
  const auth=useAuth(),capability=useOrganizationCapabilityState('lifecycle'),[open,setOpen]=useState(false),[footer,setFooter]=useState<HTMLDivElement|null>(null),close=useRef<(()=>void)|null>(null);
  useEffect(()=>{if(open&&capability.status==='hidden'){setOpen(false);onOpenChange?.(false);}},[open,capability.status,onOpenChange]);
  let retained=false;try{retained=!!auth.user?.uid&&typeof localStorage!=='undefined'&&localStorage.getItem(LOCATION_LIFECYCLE_RECOVERY_PREFIX+encodeURIComponent(auth.user.uid))!==null;}catch{}
  if(capability.status==='hidden')return null;
  const available=retained||capability.capabilities?.catalogEnabled||capability.capabilities?.recoveryEnabled;
  if(!available)return capability.status==='unavailable'?<Button size="sm" disabled={disabled} onClick={capability.retry}>Retry location tools</Button>:null;
  return <><Button size="sm" disabled={disabled} onClick={()=>{setOpen(true);onOpenChange?.(true);}}>{retained?'Finish location change':'Location use & removal'}</Button>{open&&<Modal isOpen title="Location use & removal" size="lg" footer={<div ref={setFooter} className="w-full"/>} onClose={()=>close.current?.()}><LocationLifecycleReview footerTarget={footer} registerClose={value=>{close.current=value;}} onClose={()=>{setOpen(false);onOpenChange?.(false);}}/></Modal>}</>;
}
