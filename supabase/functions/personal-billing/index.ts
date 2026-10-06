import { createPersonalBillingHandler } from '../_shared/personal-billing-handler.mjs';
Deno.serve(createPersonalBillingHandler({ env: Deno.env }));
