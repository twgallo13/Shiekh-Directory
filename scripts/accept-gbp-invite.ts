import 'dotenv/config';
import { auth } from 'google-auth-library';

async function acceptPendingInvitations() {
  console.log('Authenticating with GBP Service Account...');
  try {
    const keysEnv = process.env.GBP_SERVICE_ACCOUNT_KEY;
    if (!keysEnv) throw new Error('Missing GBP_SERVICE_ACCOUNT_KEY in environment variables.');
    
    const keys = JSON.parse(keysEnv);
    const client = auth.fromJSON(keys) as any;
    client.scopes = ['https://www.googleapis.com/auth/business.manage'];

    // 1. Get the service account's personal account ID
    console.log('Fetching personal account ID...');
    const accountsRes = await client.request({ 
      url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts' 
    });
    const accounts = (accountsRes.data as any).accounts || [];
    if (accounts.length === 0) {
      console.log('No accounts found for this service account.');
      return;
    }
    
    const personalAccount = accounts[0].name; // e.g., accounts/101035958590011901396
    console.log(`Found personal account: ${personalAccount}`);

    // 2. List pending invitations
    console.log('Checking for pending invitations...');
    const invitesRes = await client.request({ 
      url: `https://mybusinessaccountmanagement.googleapis.com/v1/${personalAccount}/invitations` 
    });
    const invitations = (invitesRes.data as any).invitations || [];

    if (invitations.length === 0) {
      console.log('No pending invitations found. It may already be accepted!');
      return;
    }

    console.log(`Found ${invitations.length} pending invitation(s). Accepting now...`);

    // 3. Accept each invitation
    for (const invite of invitations) {
      const inviteName = invite.name; // e.g., accounts/123/invitations/456
      await client.request({
        url: `https://mybusinessaccountmanagement.googleapis.com/v1/${personalAccount}/invitations/${inviteName}:accept`,
        method: 'POST'
      });
      console.log(`✅ Successfully accepted invitation: ${inviteName}`);
    }

    console.log('All invitations processed successfully!');
    
  } catch (error: any) {
    console.error('❌ Failed to process invitations:');
    console.error(error.response?.data || error.message || error);
  }
}

acceptPendingInvitations();
