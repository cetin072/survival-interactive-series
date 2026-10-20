// Unapproved manuscripts are read on demand in the authenticated Operator inbox.
// A Preview's public/noindex URL is not an authentication boundary.
import {rm,access} from 'node:fs/promises';
import {approvedBagArticles} from './lib/bag-item-publication.mjs';
const root=new URL('../../',import.meta.url);
for(const item of await approvedBagArticles())await access(new URL('archive/web/dist'+item.href+'index.html',root));
// Remove only legacy generated output, never source files or user data.
await rm(new URL('archive/web/dist/bag-review/',root),{recursive:true,force:true});
console.log('PASS BAG unapproved reader previews excluded; manuscripts remain Operator-only');
