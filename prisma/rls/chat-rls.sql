-- RF user id from the realtime JWT 'sub' claim (text — RF ids are cuids, not uuids)
create or replace function public.rf_uid() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json->>'sub'
$$;
-- membership checks (SECURITY DEFINER → bypass RLS, no policy recursion)
create or replace function public.rf_is_member(conv text) returns boolean
  language sql security definer stable as $$
  select exists(select 1 from public."ConversationMember"
    where "conversationId" = conv and "userId" = public.rf_uid())
$$;
create or replace function public.rf_can_see_msg(msg text) returns boolean
  language sql security definer stable as $$
  select exists(select 1 from public."ChatMessage" m
    join public."ConversationMember" cm on cm."conversationId" = m."conversationId"
    where m."id" = msg and cm."userId" = public.rf_uid())
$$;

alter table public."Conversation"       enable row level security;
alter table public."ConversationMember" enable row level security;
alter table public."ChatMessage"        enable row level security;
alter table public."MessageReaction"    enable row level security;
alter table public."MessageStar"        enable row level security;
alter table public."Block"              enable row level security;
alter table public."PushSubscription"   enable row level security;

drop policy if exists rf_conv_sel  on public."Conversation";
drop policy if exists rf_cm_sel    on public."ConversationMember";
drop policy if exists rf_msg_sel   on public."ChatMessage";
drop policy if exists rf_react_sel on public."MessageReaction";
drop policy if exists rf_star_sel  on public."MessageStar";
drop policy if exists rf_block_sel on public."Block";
drop policy if exists rf_push_sel  on public."PushSubscription";

create policy rf_conv_sel  on public."Conversation"       for select to authenticated using (public.rf_is_member("id"));
create policy rf_cm_sel    on public."ConversationMember" for select to authenticated using (public.rf_is_member("conversationId"));
create policy rf_msg_sel   on public."ChatMessage"        for select to authenticated using (public.rf_is_member("conversationId"));
create policy rf_react_sel on public."MessageReaction"    for select to authenticated using (public.rf_can_see_msg("messageId"));
create policy rf_star_sel  on public."MessageStar"        for select to authenticated using ("userId" = public.rf_uid());
create policy rf_block_sel on public."Block"              for select to authenticated using ("blockerId" = public.rf_uid());
create policy rf_push_sel  on public."PushSubscription"   for select to authenticated using ("userId" = public.rf_uid());
