// Only explicitly published URLs belong here. Review PASS alone never adds a link.
// After normal publication approval, add catalogId -> existing public article URL.
export const PUBLISHED_ITEMS=Object.freeze({});
export function knowledgeFor(entry){
  return PUBLISHED_ITEMS[entry.id]??(entry.id==='guide-03'?'/knowledge/family-emergency-contact-plan/':'/knowledge/emergency-supplies-inventory/');
}
