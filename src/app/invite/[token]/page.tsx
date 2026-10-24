import Link from 'next/link';
import { notFound } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity,invitationHash } from '@/server/auth/company';
import { withAuthTransaction } from '@/server/auth/database';
import { AuthFrame } from '@/components/auth/auth-frame';
import { InvitationForm } from '@/components/auth/invitation-form';
export const dynamic = 'force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function InvitePage({params}:{params:Promise<{token:string}>}) {
 if(!nativeAuthEnabled())notFound();const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))notFound();
 const identity=await getNativeIdentity();
 if(!identity)return <AuthFrame title="Your company invitation" description="Sign in or create an account with the email address your company administrator invited."><p><Link href={`/login?invite=${token}`}>Sign in</Link> · <Link href={`/sign-up?invite=${token}`}>Create an account</Link></p></AuthFrame>;
 const invite=await withAuthTransaction(identity.user.id,async(client)=>(await client.query('select * from company_invitation_for_token($1)',[invitationHash(token)])).rows[0]);
 if(!invite)return <AuthFrame title="Invitation unavailable" description="This link may have expired, been used or been sent to a different email address."><Link href="/companies">Choose your company</Link></AuthFrame>;
 return <AuthFrame title={`Join ${invite.company_name}`} description={`You are signing in as ${identity.user.email}. Review this company before accepting.`}><p>Company role: {invite.company_role}. Workspaces: {Object.keys(invite.modules).join(', ')}.</p><InvitationForm token={token}/></AuthFrame>;
}
