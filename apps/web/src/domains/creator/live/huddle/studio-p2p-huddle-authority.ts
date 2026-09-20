/** Local capability owned by the independently verified private-room controller. Events carry only
 * an opaque lookup key; neither peer packets nor a conversation id create this capability. */
export interface StudioHuddleAuthority {
  readonly conversationId:string;
  readonly peerIds:readonly string[];
  valid():boolean;
  captureRevision?():number;
  subscribe(listener:()=>void):()=>void;
}
const authorities=new Map<string,StudioHuddleAuthority>();
export function registerStudioHuddleAuthority(authority:StudioHuddleAuthority) {
  const token=crypto.randomUUID();
  authorities.set(token,authority);
  return {token,dispose:()=>{if(authorities.get(token)===authority)authorities.delete(token);}};
}
export function resolveStudioHuddleAuthority(token:string,conversationId:string,peerIds:readonly string[]) {
  const value=authorities.get(token);
  return value&&value.conversationId===conversationId&&value.valid()
    &&JSON.stringify([...value.peerIds].sort())===JSON.stringify([...peerIds].sort()) ? value : null;
}
