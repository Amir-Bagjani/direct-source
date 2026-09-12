from django.db import migrations

SQL = """
CREATE FUNCTION reviews_right_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders_order; mode text; expected jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Review rights are retained'; END IF;
 SELECT * INTO o FROM orders_order WHERE id=NEW.order_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'updated_at'-'expired_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'expired_at')
      OR (OLD.expired_at IS NOT NULL AND NEW.expired_at IS DISTINCT FROM OLD.expired_at)
   THEN RAISE EXCEPTION 'Review right snapshot is immutable'; END IF;
   IF NEW.expired_at IS NOT NULL AND (NEW.expired_at < NEW.deadline OR EXISTS (
     SELECT 1 FROM reviews_review WHERE entitlement_id=NEW.id AND submitted_at IS NOT NULL))
   THEN RAISE EXCEPTION 'Only unused rights expire at deadline'; END IF;
   RETURN NEW;
 END IF;
 SELECT execution_mode INTO mode FROM finance_financialevent WHERE order_id=o.id AND kind='settlement';
 IF o.status<>'completed' OR o.completed_at IS NULL OR o.delivered_at IS NULL OR mode IS NULL
    OR NEW.execution_mode IS DISTINCT FROM mode OR NEW.deadline<=o.completed_at
    OR EXISTS(SELECT 1 FROM disputes_discrepancycase WHERE order_id=o.id AND closed_at IS NULL)
    OR (o.discrepancy_deadline > NEW.created_at AND NOT EXISTS(
      SELECT 1 FROM disputes_discrepancycase WHERE order_id=o.id AND closed_at IS NOT NULL))
 THEN RAISE EXCEPTION 'Completed, settled, delivered order without open dispute required'; END IF;
 IF NEW.topic='retailer' THEN
   IF NEW.author_id<>o.manufacturer_id OR NEW.recipient_id<>o.retailer_id THEN RAISE EXCEPTION 'Invalid review parties'; END IF;
 ELSE
   IF NEW.author_id<>o.retailer_id OR NEW.recipient_id<>o.manufacturer_id THEN RAISE EXCEPTION 'Invalid review parties'; END IF;
 END IF;
 IF NEW.topic='product' THEN
   SELECT jsonb_agg(l.variant_id::text ORDER BY l.variant_id) INTO expected
   FROM orders_orderline l JOIN catalog_variant v ON v.id=l.variant_id
   WHERE l.order_id=o.id AND v.product_id=NEW.product_id;
   IF expected IS NULL OR expected IS DISTINCT FROM NEW.variants THEN RAISE EXCEPTION 'Purchased variants required'; END IF;
 ELSIF NEW.variants<>'[]'::jsonb THEN RAISE EXCEPTION 'Collaboration has no variants'; END IF;
 IF EXISTS(SELECT 1 FROM reviews_entitlement WHERE order_id=o.id AND deadline<>NEW.deadline)
 THEN RAISE EXCEPTION 'Order review deadline must be shared'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reviews_right_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews_entitlement
FOR EACH ROW EXECUTE FUNCTION reviews_right_guard();

CREATE FUNCTION reviews_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e reviews_entitlement; allowed text[]; image text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reviews are retained'; END IF;
 SELECT * INTO e FROM reviews_entitlement WHERE id=NEW.entitlement_id;
 PERFORM 1 FROM orders_order WHERE id=e.order_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
   IF NEW.entitlement_id<>OLD.entitlement_id THEN RAISE EXCEPTION 'Review entitlement is immutable'; END IF;
   IF OLD.submitted_at IS NOT NULL THEN
     IF ROW(NEW.actor_id,NEW.scores,NEW.text,NEW.images,NEW.submitted_at) IS DISTINCT FROM
        ROW(OLD.actor_id,OLD.scores,OLD.text,OLD.images,OLD.submitted_at)
     THEN RAISE EXCEPTION 'Submitted review is immutable'; END IF;
     IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at
     THEN RAISE EXCEPTION 'Publication is final'; END IF;
     RETURN NEW;
   END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM accounts_membership WHERE business_id=e.author_id AND user_id=NEW.actor_id)
 THEN RAISE EXCEPTION 'Author membership required'; END IF;
 IF e.expired_at IS NOT NULL OR (NEW.submitted_at IS NOT NULL AND NEW.submitted_at>=e.deadline)
 THEN RAISE EXCEPTION 'Review right expired'; END IF;
 allowed := CASE e.topic WHEN 'product' THEN ARRAY['quality','conformity','overall']
   WHEN 'manufacturer' THEN ARRAY['packaging','timeliness','communication','overall']
   ELSE ARRAY['communication','coordination','overall'] END;
 IF jsonb_typeof(NEW.scores)<>'object' OR jsonb_typeof(NEW.images)<>'array'
 THEN RAISE EXCEPTION 'Invalid scores/images'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.scores) v WHERE NOT(v.key=ANY(allowed))
    OR jsonb_typeof(v.value)<>'number' OR v.value::text !~ '^[1-5]$')
    OR (NEW.submitted_at IS NOT NULL AND NOT NEW.scores ?& allowed)
 THEN RAISE EXCEPTION 'Complete integer scores from 1 to 5 required'; END IF;
 IF jsonb_array_length(NEW.images)>10 OR (e.topic<>'product' AND NEW.images<>'[]'::jsonb)
    OR jsonb_array_length(NEW.images)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(NEW.images))
 THEN RAISE EXCEPTION 'Invalid images'; END IF;
 FOR image IN SELECT jsonb_array_elements_text(NEW.images) LOOP
   IF NOT EXISTS(SELECT 1 FROM reviews_reviewimage i JOIN operations_storedfile f ON f.id=i.file_id
     WHERE f.id::text=image AND i.entitlement_id=e.id AND f.owner_id=NEW.actor_id
       AND f.purpose='review_image' AND f.scan_status='clean' AND f.deleted_at IS NULL
       AND f.content_type IN ('image/jpeg','image/png','image/webp'))
   THEN RAISE EXCEPTION 'Review image must be clean and scoped'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER reviews_review_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews_review
FOR EACH ROW EXECUTE FUNCTION reviews_review_guard();

CREATE FUNCTION reviews_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r reviews_review; e reviews_entitlement;
BEGIN
 SELECT * INTO r FROM reviews_review WHERE id=NEW.id;
 SELECT * INTO e FROM reviews_entitlement WHERE id=r.entitlement_id;
 IF r.published_at IS NOT NULL AND e.topic<>'product' AND r.published_at<e.deadline THEN
   IF (SELECT count(*) FROM reviews_review other JOIN reviews_entitlement er ON er.id=other.entitlement_id
     WHERE er.order_id=e.order_id AND er.topic<>'product' AND other.submitted_at IS NOT NULL
       AND other.published_at=r.published_at)<>2
   THEN RAISE EXCEPTION 'Blind publication must be simultaneous'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER reviews_publication_guard AFTER INSERT OR UPDATE ON reviews_review
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reviews_publication_guard();

CREATE FUNCTION reviews_reply_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Replies are retained'; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.review_id<>OLD.review_id THEN RAISE EXCEPTION 'Reply target is immutable'; END IF;
   IF OLD.submitted_at IS NOT NULL THEN
     IF ROW(NEW.actor_id,NEW.text,NEW.submitted_at) IS DISTINCT FROM ROW(OLD.actor_id,OLD.text,OLD.submitted_at)
     THEN RAISE EXCEPTION 'Submitted reply is immutable'; END IF;
     RETURN NEW;
   END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reviews_review r JOIN reviews_entitlement e ON e.id=r.entitlement_id
   JOIN accounts_membership m ON m.business_id=e.recipient_id
   WHERE r.id=NEW.review_id AND r.published_at IS NOT NULL AND NOT r.invalidated AND m.user_id=NEW.actor_id)
 THEN RAISE EXCEPTION 'Reply requires published review and recipient'; END IF;
 IF btrim(NEW.text)='' THEN RAISE EXCEPTION 'Reply text required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reviews_reply_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews_reply
FOR EACH ROW EXECUTE FUNCTION reviews_reply_guard();

CREATE FUNCTION reviews_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reports are retained'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'updated_at'-'resolved_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'resolved_at')
 THEN RAISE EXCEPTION 'Report content immutable'; END IF;
 IF NEW.reply_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reviews_reply WHERE id=NEW.reply_id AND review_id=NEW.review_id AND submitted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Report reply must belong to review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reviews_report_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews_report
FOR EACH ROW EXECUTE FUNCTION reviews_report_guard();
CREATE FUNCTION reviews_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Review history and image scope are immutable'; END $$;
CREATE TRIGGER reviews_action_immutable BEFORE UPDATE OR DELETE ON reviews_moderationaction FOR EACH ROW EXECUTE FUNCTION reviews_append_only();
CREATE TRIGGER reviews_image_immutable BEFORE UPDATE OR DELETE ON reviews_reviewimage FOR EACH ROW EXECUTE FUNCTION reviews_append_only();
"""
REVERSE = """
DROP TRIGGER reviews_image_immutable ON reviews_reviewimage;
DROP TRIGGER reviews_action_immutable ON reviews_moderationaction;
DROP FUNCTION reviews_append_only();
DROP TRIGGER reviews_report_guard ON reviews_report;
DROP FUNCTION reviews_report_guard();
DROP TRIGGER reviews_reply_guard ON reviews_reply;
DROP FUNCTION reviews_reply_guard();
DROP TRIGGER reviews_publication_guard ON reviews_review;
DROP FUNCTION reviews_publication_guard();
DROP TRIGGER reviews_review_guard ON reviews_review;
DROP FUNCTION reviews_review_guard();
DROP TRIGGER reviews_right_guard ON reviews_entitlement;
DROP FUNCTION reviews_right_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("reviews", "0001_initial"), ("disputes", "0002_invariants"), ("finance", "0002_finance_invariants")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
