-- CivicConnect schema 004: privileges for the messaging tables (DEF-011)
--
-- 002 granted the application role access to the core tables only. The
-- messaging outbox (003) was created afterwards, so an application connecting as civicconnect_app (the production
-- setup) would be refused when a status change tried to queue a message.
--
-- The outbox is mutable by design (the dispatch worker updates status and
-- attempt_count), so UPDATE is granted here; the audit and timeline tables stay
-- append-only. outbound_messages is deliberately NOT granted: nothing writes to
-- it and DEF-004 proposes dropping it. Safe to re-run.

GRANT SELECT, INSERT, UPDATE ON messaging_outbox TO civicconnect_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO civicconnect_app;
