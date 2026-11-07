-- Run public review views with the querying role's permissions and RLS.
alter view public.community_reviews_public
  set (security_invoker = true);

alter view public.community_review_stats
  set (security_invoker = true);

-- Invoker views need the caller to have SELECT privileges on every base-table
-- column referenced by the view, including columns used only in WHERE clauses.
grant select (id, rating, review_text, display_name, github_username, avatar_url, created_at, updated_at, is_published)
  on public.community_reviews to anon, authenticated;
