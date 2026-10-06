import { createPersonalBillingWebhookHandler } from '../_shared/personal-billing-handler.mjs';
Deno.serve(createPersonalBillingWebhookHandler({ env: Deno.env }));
