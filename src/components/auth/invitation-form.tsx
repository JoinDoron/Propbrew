'use client';
import { useActionState } from 'react';
import { acceptCompanyInvite } from '@/server/actions/companies';
import styles from './auth.module.css';
export function InvitationForm({token}:{token:string}) {
 const [state,submit,pending]=useActionState(async(_previous:{error?:string},form:FormData)=>await acceptCompanyInvite(form)??{},{});
 return <form action={submit} className={styles.form}>{state.error&&<p role="alert" className={styles.error}>{state.error}</p>}<input type="hidden" name="token" value={token}/><button type="submit" disabled={pending} className={styles.primary}>{pending?'Joining company…':'Accept invitation'}</button></form>;
}
