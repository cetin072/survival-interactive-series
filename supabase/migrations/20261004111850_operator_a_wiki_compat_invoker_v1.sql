-- The compatibility A-Wiki RPC delegates to the authoritative operator system-status RPC.
-- It does not need its own definer privileges; the delegated RPC performs the capability check.

begin;

alter function public.archive_operator_a_wiki_status() security invoker;

commit;
