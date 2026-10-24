const required = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'BLOB_READ_WRITE_TOKEN', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'COMMUNICATION_WEBHOOK_SECRET', 'PILOT_TENANT_UUID', 'NDPA_POLICY_VERSION'];
const missing = required.filter((key) => !process.env[key]);
console.log(JSON.stringify({ required: required.length, present: required.length - missing.length, missing }));
if (process.env.NODE_ENV === 'production' && missing.length) process.exit(1);
