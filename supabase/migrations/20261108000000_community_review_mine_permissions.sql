-- Keep the private "my review" RPC callable only by authenticated users.
-- SECURITY DEFINER is required because the public table SELECT policy exposes
-- published rows, while this function must return only the caller's own row.
alter function public.community_review_mine()
  security definer;

alter function public.community_review_mine()
  set search_path = '';

revoke all on function public.community_review_mine()
  from public, anon, authenticated;

grant execute on function public.community_review_mine()
  to authenticated;
