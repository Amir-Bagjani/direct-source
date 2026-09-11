from django.db import migrations

IMMUTABLE = ["disputes_disputedecision", "disputes_casenote", "support_ticketmessage", "support_attachmentscope", "disputes_discrepancyline_evidence", "disputes_disputedecision_evidence", "disputes_casenote_evidence", "support_ticketmessage_files"]
SQL = """
CREATE FUNCTION dispute_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Dispute and support history is immutable'; END $$;
""" + "\n".join(f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION dispute_append_only();" for t in IMMUTABLE) + """
CREATE FUNCTION dispute_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_pk uuid; delivered bigint; claimed bigint; total_claimed bigint; max_qty bigint; deadline timestamptz; order_status text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Submitted claim is immutable'; END IF;
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-ARRAY['referred_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['referred_at','updated_at'])
      OR (OLD.referred_at IS NOT NULL AND NEW.referred_at IS DISTINCT FROM OLD.referred_at)
   THEN RAISE EXCEPTION 'Submitted claim is immutable'; END IF;
   RETURN NEW;
 END IF;
 SELECT order_id INTO order_pk FROM disputes_discrepancycase WHERE id=NEW.case_id AND closed_at IS NULL;
 SELECT discrepancy_deadline,status INTO deadline,order_status FROM orders_order WHERE id=order_pk FOR UPDATE;
 IF order_pk IS NULL OR deadline IS NULL OR NEW.created_at>=deadline OR order_status<>'active' THEN RAISE EXCEPTION 'Claim outside valid order window'; END IF;
 SELECT quantity INTO max_qty FROM orders_orderline WHERE id=NEW.line_id AND order_id=order_pk;
 SELECT COALESCE(sum(si.quantity),0) INTO delivered FROM logistics_shipmentitem si
 JOIN logistics_shippinggroupitem gi ON gi.id=si.group_item_id JOIN logistics_shipment s ON s.id=si.shipment_id
 WHERE gi.line_id=NEW.line_id AND s.id=NEW.shipment_id AND s.status='delivered' AND s.purpose='order';
 SELECT COALESCE(sum(quantity),0) INTO claimed FROM disputes_discrepancyline WHERE line_id=NEW.line_id AND shipment_id=NEW.shipment_id;
 SELECT COALESCE(sum(quantity),0) INTO total_claimed FROM disputes_discrepancyline WHERE line_id=NEW.line_id;
 IF max_qty IS NULL OR claimed+NEW.quantity>delivered OR total_claimed+NEW.quantity>max_qty OR NEW.response_deadline<=NEW.created_at THEN RAISE EXCEPTION 'Claim quantities or deadline invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER claim_guard BEFORE INSERT OR UPDATE OR DELETE ON disputes_discrepancyline FOR EACH ROW EXECUTE FUNCTION dispute_claim_guard();

CREATE FUNCTION dispute_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claim disputes_discrepancyline; used bigint; maker_accepted bigint;
BEGIN
 SELECT * INTO claim FROM disputes_discrepancyline WHERE id=NEW.claim_id;
 PERFORM 1 FROM orders_order o JOIN disputes_discrepancycase c ON c.order_id=o.id WHERE c.id=claim.case_id FOR UPDATE OF o;
 IF EXISTS(SELECT 1 FROM disputes_discrepancycase WHERE id=claim.case_id AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Closed discrepancy'; END IF;
 IF NEW.source='manufacturer' THEN
   IF claim.referred_at IS NOT NULL OR NEW.created_at>=claim.response_deadline OR NEW.accepted+NEW.rejected<>claim.quantity THEN RAISE EXCEPTION 'Invalid manufacturer response'; END IF;
 ELSE
   SELECT COALESCE(sum(accepted+rejected),0) INTO used FROM disputes_disputedecision WHERE claim_id=claim.id AND source='operator';
   SELECT COALESCE(sum(accepted),0) INTO maker_accepted FROM disputes_disputedecision WHERE claim_id=claim.id AND source='manufacturer';
   IF claim.referred_at IS NULL OR used+maker_accepted+NEW.accepted+NEW.rejected>claim.quantity THEN RAISE EXCEPTION 'Decision exceeds referred unresolved quantity'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER decision_guard BEFORE INSERT ON disputes_disputedecision FOR EACH ROW EXECUTE FUNCTION dispute_decision_guard();

CREATE FUNCTION dispute_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 IF TG_TABLE_NAME='disputes_discrepancyline' THEN
   SELECT count(*) INTO n FROM disputes_discrepancyline_evidence WHERE discrepancyline_id=NEW.id;
   IF n<1 OR n>10 THEN RAISE EXCEPTION 'Claim requires one to ten evidence files'; END IF;
 ELSE
   SELECT count(*) INTO n FROM disputes_disputedecision_evidence WHERE disputedecision_id=NEW.id;
   IF n>10 OR (NEW.source='operator' AND n<1) THEN RAISE EXCEPTION 'Operator decision requires reviewed evidence'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER claim_evidence AFTER INSERT ON disputes_discrepancyline DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dispute_evidence_guard();
CREATE CONSTRAINT TRIGGER decision_evidence AFTER INSERT ON disputes_disputedecision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dispute_evidence_guard();

CREATE FUNCTION dispute_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case history is immutable'; END IF;
 IF NEW.order_id<>OLD.order_id OR OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Case ownership or closure is immutable'; END IF;
 IF NEW.closed_at IS NOT NULL THEN
   SELECT discrepancy_deadline INTO deadline FROM orders_order WHERE id=NEW.order_id FOR UPDATE;
   IF NEW.closed_at<deadline OR EXISTS(
     SELECT 1 FROM disputes_discrepancyline l WHERE l.case_id=NEW.id AND l.quantity<>(
       SELECT COALESCE(sum(CASE WHEN d.source='manufacturer' THEN d.accepted ELSE d.accepted+d.rejected END),0) FROM disputes_disputedecision d WHERE d.claim_id=l.id))
     OR EXISTS(SELECT 1 FROM disputes_remedy r JOIN disputes_disputedecision d ON d.id=r.decision_id JOIN disputes_discrepancyline l ON l.id=d.claim_id WHERE l.case_id=NEW.id AND r.completed_at IS NULL AND r.waived_at IS NULL)
   THEN RAISE EXCEPTION 'Case is not eligible for closure'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_guard BEFORE UPDATE OR DELETE ON disputes_discrepancycase FOR EACH ROW EXECUTE FUNCTION dispute_case_guard();

CREATE FUNCTION dispute_remedy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d disputes_disputedecision;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remedy history is immutable'; END IF;
 SELECT * INTO d FROM disputes_disputedecision WHERE id=NEW.decision_id;
 IF d.accepted<=0 THEN RAISE EXCEPTION 'Remedy needs accepted quantity'; END IF;
 IF TG_OP='UPDATE' AND (NEW.decision_id<>OLD.decision_id OR OLD.completed_at IS NOT NULL OR OLD.waived_at IS NOT NULL) THEN RAISE EXCEPTION 'Final remedy is immutable'; END IF;
 IF NEW.waived_at IS NOT NULL AND (NEW.waiver_reason='' OR NOT EXISTS(SELECT 1 FROM logistics_shipment WHERE compensation_id=NEW.id AND status='cancelled')) THEN RAISE EXCEPTION 'Waiver needs reason and cancelled shipment'; END IF;
 IF NEW.completed_at IS NOT NULL THEN
   IF d.remedy IN ('refund','return') AND NOT EXISTS(SELECT 1 FROM finance_financialevent e JOIN disputes_discrepancyline l ON l.id=d.claim_id JOIN disputes_discrepancycase c ON c.id=l.case_id WHERE e.id=NEW.financial_event_id AND e.order_id=c.order_id AND e.kind='refund') THEN RAISE EXCEPTION 'Refund event required'; END IF;
   IF d.remedy IN ('replacement','return') AND NOT EXISTS(SELECT 1 FROM logistics_shipment WHERE compensation_id=NEW.id AND status='delivered') THEN RAISE EXCEPTION 'Delivery outcome required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remedy_guard BEFORE INSERT OR UPDATE OR DELETE ON disputes_remedy FOR EACH ROW EXECUTE FUNCTION dispute_remedy_guard();

CREATE FUNCTION support_ticket_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='closed' THEN RAISE EXCEPTION 'Ticket history is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','assigned_to_id','last_reply_at','resolved_at','closed_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','assigned_to_id','last_reply_at','resolved_at','closed_at','updated_at']) THEN RAISE EXCEPTION 'Ticket identity is immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT (
   (OLD.status='new' AND NEW.status='in_review') OR
   (OLD.status='in_review' AND NEW.status IN ('waiting_user','resolved')) OR
   (OLD.status='waiting_user' AND NEW.status IN ('in_review','resolved')) OR
   (OLD.status='resolved' AND NEW.status IN ('in_review','closed'))
 ) THEN RAISE EXCEPTION 'Invalid ticket transition'; END IF;
 IF NEW.status='closed' AND NEW.case_id IS NOT NULL AND EXISTS(SELECT 1 FROM disputes_discrepancycase WHERE id=NEW.case_id AND closed_at IS NULL) THEN RAISE EXCEPTION 'Linked discrepancy is open'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ticket_guard BEFORE UPDATE OR DELETE ON support_ticket FOR EACH ROW EXECUTE FUNCTION support_ticket_guard();

CREATE FUNCTION remedy_shipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d disputes_disputedecision; claim disputes_discrepancyline;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.purpose,NEW.compensation_id) IS DISTINCT FROM ROW(OLD.purpose,OLD.compensation_id) THEN RAISE EXCEPTION 'Shipment purpose is immutable'; END IF;
 IF NEW.purpose='order' THEN
   IF NEW.compensation_id IS NOT NULL THEN RAISE EXCEPTION 'Order shipment cannot carry remedy'; END IF;
 ELSE
   SELECT decision.* INTO d FROM disputes_disputedecision decision JOIN disputes_remedy r ON r.decision_id=decision.id WHERE r.id=NEW.compensation_id;
   SELECT * INTO claim FROM disputes_discrepancyline WHERE id=d.claim_id;
   IF d.id IS NULL OR d.remedy<>NEW.purpose OR NOT EXISTS(SELECT 1 FROM logistics_shipment s WHERE s.id=claim.shipment_id AND s.request_id=NEW.request_id) THEN RAISE EXCEPTION 'Remedy shipment must match decision'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remedy_shipment_guard BEFORE INSERT OR UPDATE ON logistics_shipment FOR EACH ROW EXECUTE FUNCTION remedy_shipment_guard();

CREATE FUNCTION remedy_manifest_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shipment logistics_shipment; d disputes_disputedecision; expected_line uuid;
BEGIN
 SELECT * INTO shipment FROM logistics_shipment WHERE id=NEW.shipment_id;
 IF shipment.purpose<>'order' THEN
   SELECT decision.* INTO d FROM disputes_disputedecision decision JOIN disputes_remedy r ON r.decision_id=decision.id WHERE r.id=shipment.compensation_id;
   SELECT line_id INTO expected_line FROM disputes_discrepancyline WHERE id=d.claim_id;
   IF NEW.quantity<>d.accepted OR NOT EXISTS(SELECT 1 FROM logistics_shippinggroupitem WHERE id=NEW.group_item_id AND line_id=expected_line) THEN RAISE EXCEPTION 'Remedy manifest must match decision exactly'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remedy_manifest_guard BEFORE INSERT OR UPDATE ON logistics_shipmentitem FOR EACH ROW EXECUTE FUNCTION remedy_manifest_guard();
"""
REVERSE = """
DROP TRIGGER remedy_manifest_guard ON logistics_shipmentitem; DROP FUNCTION remedy_manifest_guard();
DROP TRIGGER remedy_shipment_guard ON logistics_shipment; DROP FUNCTION remedy_shipment_guard();
DROP TRIGGER ticket_guard ON support_ticket; DROP FUNCTION support_ticket_guard();
DROP TRIGGER remedy_guard ON disputes_remedy; DROP FUNCTION dispute_remedy_guard();
DROP TRIGGER case_guard ON disputes_discrepancycase; DROP FUNCTION dispute_case_guard();
DROP TRIGGER decision_evidence ON disputes_disputedecision;
DROP TRIGGER claim_evidence ON disputes_discrepancyline; DROP FUNCTION dispute_evidence_guard();
DROP TRIGGER decision_guard ON disputes_disputedecision; DROP FUNCTION dispute_decision_guard();
DROP TRIGGER claim_guard ON disputes_discrepancyline; DROP FUNCTION dispute_claim_guard();
""" + "\n".join(f"DROP TRIGGER immutable_history ON {t};" for t in IMMUTABLE) + "\nDROP FUNCTION dispute_append_only();"


class Migration(migrations.Migration):
    dependencies = [("disputes", "0001_initial"), ("support", "0001_initial"), ("logistics", "0010_compensation_allocation")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
