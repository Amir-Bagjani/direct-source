from django.db import migrations

SQL = """
CREATE FUNCTION operations_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operation history is immutable'; END $$;
CREATE TRIGGER operations_policy_immutable BEFORE UPDATE OR DELETE ON operations_policyversion FOR EACH ROW EXECUTE FUNCTION operations_append_only();
CREATE TRIGGER operations_command_immutable BEFORE UPDATE OR DELETE ON operations_operationcommand FOR EACH ROW EXECUTE FUNCTION operations_append_only();
CREATE FUNCTION operations_suspension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Suspensions are retained'; END IF;
 IF ROW(NEW.business_id,NEW.user_id,NEW.reason,NEW.proposed_by_id) IS DISTINCT FROM ROW(OLD.business_id,OLD.user_id,OLD.reason,OLD.proposed_by_id)
 THEN RAISE EXCEPTION 'Suspension scope and evidence are immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='proposed' AND NEW.status IN ('active','rejected')) OR (OLD.status='active' AND NEW.status='restored'))
 THEN RAISE EXCEPTION 'Invalid suspension transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operations_suspension_guard BEFORE UPDATE OR DELETE ON operations_suspension FOR EACH ROW EXECUTE FUNCTION operations_suspension_guard();
CREATE FUNCTION operations_disposition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order dispositions are retained'; END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.order_id,NEW.suspension_id,NEW.stage) IS DISTINCT FROM ROW(OLD.order_id,OLD.suspension_id,OLD.stage)
   OR (OLD.decided_at IS NOT NULL AND (to_jsonb(OLD)-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'updated_at')))
 THEN RAISE EXCEPTION 'Final order disposition is immutable'; END IF;
 IF NEW.stage NOT IN ('unpaid','paid','shipped') OR NEW.decision NOT IN ('pending','cancelled','continue','cancel_refund')
   OR ((NEW.decision='pending') <> (NEW.decided_at IS NULL))
 THEN RAISE EXCEPTION 'Invalid order disposition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operations_disposition_guard BEFORE INSERT OR UPDATE OR DELETE ON operations_orderdisposition FOR EACH ROW EXECUTE FUNCTION operations_disposition_guard();
"""
REVERSE = """
DROP TRIGGER operations_disposition_guard ON operations_orderdisposition;
DROP FUNCTION operations_disposition_guard();
DROP TRIGGER operations_suspension_guard ON operations_suspension;
DROP FUNCTION operations_suspension_guard();
DROP TRIGGER operations_command_immutable ON operations_operationcommand;
DROP TRIGGER operations_policy_immutable ON operations_policyversion;
DROP FUNCTION operations_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("operations", "0007_auditevent_actor_role_auditevent_command_source_and_more")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
