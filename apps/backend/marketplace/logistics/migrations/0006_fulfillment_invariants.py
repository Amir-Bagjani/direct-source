from django.db import migrations


SQL = """
CREATE FUNCTION fulfillment_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Fulfillment history and checkout snapshots are immutable';
END $$;
CREATE TRIGGER fulfillment_event_immutable BEFORE UPDATE OR DELETE ON logistics_fulfillmentevent
FOR EACH ROW EXECUTE FUNCTION fulfillment_append_only();
CREATE TRIGGER carrier_assignment_immutable BEFORE UPDATE OR DELETE ON logistics_carrierassignment
FOR EACH ROW EXECUTE FUNCTION fulfillment_append_only();
CREATE TRIGGER shipping_group_immutable BEFORE UPDATE OR DELETE ON logistics_shippinggroup
FOR EACH ROW EXECUTE FUNCTION fulfillment_append_only();
CREATE TRIGGER shipping_group_item_immutable BEFORE UPDATE OR DELETE ON logistics_shippinggroupitem
FOR EACH ROW EXECUTE FUNCTION fulfillment_append_only();

CREATE FUNCTION fulfillment_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders_orderline' THEN
    IF EXISTS(SELECT 1 FROM logistics_shippinggroupitem WHERE line_id=OLD.id) THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Frozen order line'; END IF;
      IF (to_jsonb(NEW) - ARRAY['prepared_quantity','preparation_note','updated_at']) IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['prepared_quantity','preparation_note','updated_at']) THEN
        RAISE EXCEPTION 'Frozen order line';
      END IF;
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM logistics_shippinggroup WHERE order_id=OLD.id) THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Frozen order'; END IF;
      IF ROW(NEW.manufacturer_id,NEW.retailer_id,NEW.destination) IS DISTINCT FROM
         ROW(OLD.manufacturer_id,OLD.retailer_id,OLD.destination) THEN
        RAISE EXCEPTION 'Frozen order parties and destination';
      END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.delivered_at IS NOT NULL AND
       ROW(NEW.delivered_at,NEW.discrepancy_deadline) IS DISTINCT FROM ROW(OLD.delivered_at,OLD.discrepancy_deadline) THEN
      RAISE EXCEPTION 'Delivery deadline starts once';
    END IF;
    IF TG_OP='UPDATE' AND OLD.paid_at IS NOT NULL AND
       ROW(NEW.paid_at,NEW.payment_reference) IS DISTINCT FROM ROW(OLD.paid_at,OLD.payment_reference) THEN
      RAISE EXCEPTION 'Payment reference is immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_frozen_snapshot BEFORE UPDATE OR DELETE ON orders_order
FOR EACH ROW EXECUTE FUNCTION fulfillment_order_snapshot();
CREATE TRIGGER line_frozen_snapshot BEFORE UPDATE OR DELETE ON orders_orderline
FOR EACH ROW EXECUTE FUNCTION fulfillment_order_snapshot();

CREATE FUNCTION fulfillment_request_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Final shipping request is immutable';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'Request group is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='waiting' AND NEW.status IN ('ready','spec_review','cancelled')) OR
    (OLD.status='spec_review' AND NEW.status IN ('ready','attention','cancelled')) OR
    (OLD.status='ready' AND NEW.status IN ('assigned','attention','cancelled')) OR
    (OLD.status='assigned' AND NEW.status IN ('in_transit','attention','cancelled')) OR
    (OLD.status='in_transit' AND NEW.status IN ('attention','completed')) OR
    (OLD.status='attention' AND NEW.status IN ('ready','assigned','in_transit','completed','cancelled'))
  ) THEN RAISE EXCEPTION 'Invalid shipping request transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipping_request_transition BEFORE UPDATE ON logistics_shippingrequest
FOR EACH ROW EXECUTE FUNCTION fulfillment_request_valid();

CREATE FUNCTION fulfillment_group_item_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders_orderline l JOIN logistics_shippinggroup g ON g.id=NEW.group_id
                 WHERE l.id=NEW.line_id AND l.order_id=g.order_id AND l.quantity=NEW.quantity) THEN
    RAISE EXCEPTION 'Shipping item must cover its own order line exactly';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipping_group_item_valid BEFORE INSERT ON logistics_shippinggroupitem
FOR EACH ROW EXECUTE FUNCTION fulfillment_group_item_valid();

CREATE FUNCTION fulfillment_shipment_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE req_group uuid; order_pk uuid;
BEGIN
  SELECT r.group_id,g.order_id INTO req_group,order_pk FROM logistics_shippingrequest r
    JOIN logistics_shippinggroup g ON g.id=r.group_id WHERE r.id=NEW.request_id;
  PERFORM 1 FROM orders_order WHERE id=order_pk FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM logistics_carrierassignment WHERE id=NEW.assignment_id AND request_id=NEW.request_id) THEN
    RAISE EXCEPTION 'Shipment assignment belongs to another request';
  END IF;
  IF NEW.replaces_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM logistics_shipment WHERE id=NEW.replaces_id
      AND request_id=NEW.request_id AND status IN ('failed','returned') AND resolution='resend') THEN
    RAISE EXCEPTION 'Replacement needs resolved failed shipment of same request';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.replaces_id IS DISTINCT FROM OLD.replaces_id THEN
      RAISE EXCEPTION 'Shipment ownership and replacement references are immutable';
    END IF;
    IF OLD.status IN ('delivered','returned','cancelled') AND
       (to_jsonb(NEW)-ARRAY['resolution','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['resolution','updated_at']) THEN
      RAISE EXCEPTION 'Final shipment cannot be rewritten';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='ready' AND NEW.status IN ('handed_over','cancelled')) OR
      (OLD.status='handed_over' AND NEW.status IN ('in_transit','delivered','unconfirmed','failed')) OR
      (OLD.status='in_transit' AND NEW.status IN ('delivered','unconfirmed','failed')) OR
      (OLD.status='unconfirmed' AND NEW.status IN ('delivered','failed')) OR
      (OLD.status='failed' AND NEW.status='returned')
    ) THEN RAISE EXCEPTION 'Invalid shipment transition'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipment_relations_and_transition BEFORE INSERT OR UPDATE ON logistics_shipment
FOR EACH ROW EXECUTE FUNCTION fulfillment_shipment_valid();

CREATE FUNCTION fulfillment_manifest_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_pk uuid; shipment_group uuid; order_pk uuid; shipment_status text;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT status INTO shipment_status FROM logistics_shipment WHERE id=OLD.shipment_id;
    IF shipment_status IN ('delivered','returned','cancelled') THEN RAISE EXCEPTION 'Final manifest'; END IF;
    RETURN OLD;
  END IF;
  SELECT group_id INTO group_pk FROM logistics_shippinggroupitem WHERE id=NEW.group_item_id;
  SELECT r.group_id,s.status,g.order_id INTO shipment_group,shipment_status,order_pk FROM logistics_shipment s
    JOIN logistics_shippingrequest r ON r.id=s.request_id JOIN logistics_shippinggroup g ON g.id=r.group_id
    WHERE s.id=NEW.shipment_id;
  PERFORM 1 FROM orders_order WHERE id=order_pk FOR UPDATE;
  IF group_pk IS DISTINCT FROM shipment_group THEN RAISE EXCEPTION 'Cross-group shipment item'; END IF;
  IF shipment_status IN ('delivered','returned','cancelled') THEN RAISE EXCEPTION 'Final manifest'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipment_item_valid BEFORE INSERT OR UPDATE OR DELETE ON logistics_shipmentitem
FOR EACH ROW EXECUTE FUNCTION fulfillment_manifest_valid();

CREATE FUNCTION fulfillment_allocation_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_pk uuid; group_pk uuid; require_exact boolean := false;
BEGIN
  IF TG_TABLE_NAME='logistics_shipmentitem' THEN
    SELECT request_id INTO request_pk FROM logistics_shipment WHERE id=COALESCE(NEW.shipment_id, OLD.shipment_id);
  ELSE
    request_pk := NEW.request_id;
    IF TG_OP='UPDATE' THEN require_exact := NEW.status='handed_over' AND OLD.status='ready'; END IF;
  END IF;
  SELECT group_id INTO group_pk FROM logistics_shippingrequest WHERE id=request_pk;
  IF EXISTS(
    SELECT 1 FROM logistics_shippinggroupitem gi LEFT JOIN (
      SELECT si.group_item_id, SUM(si.quantity) qty FROM logistics_shipmentitem si
      JOIN logistics_shipment s ON s.id=si.shipment_id
      WHERE s.request_id=request_pk AND s.status<>'cancelled' AND s.resolution<>'resend'
      GROUP BY si.group_item_id
    ) allocation ON allocation.group_item_id=gi.id
    WHERE gi.group_id=group_pk AND (COALESCE(allocation.qty,0)>gi.quantity OR
       (require_exact AND COALESCE(allocation.qty,0)<>gi.quantity))
  ) THEN RAISE EXCEPTION 'Shipment allocation exceeds group or hand-over coverage is incomplete'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER shipment_allocation_constraint AFTER INSERT OR UPDATE OR DELETE ON logistics_shipmentitem
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fulfillment_allocation_valid();
CREATE CONSTRAINT TRIGGER shipment_state_allocation_constraint AFTER INSERT OR UPDATE ON logistics_shipment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fulfillment_allocation_valid();
"""

REVERSE = """
DROP TRIGGER shipping_request_transition ON logistics_shippingrequest;
DROP FUNCTION fulfillment_request_valid();
DROP TRIGGER shipment_state_allocation_constraint ON logistics_shipment;
DROP TRIGGER shipment_allocation_constraint ON logistics_shipmentitem;
DROP FUNCTION fulfillment_allocation_valid();
DROP TRIGGER shipment_item_valid ON logistics_shipmentitem;
DROP FUNCTION fulfillment_manifest_valid();
DROP TRIGGER shipment_relations_and_transition ON logistics_shipment;
DROP FUNCTION fulfillment_shipment_valid();
DROP TRIGGER shipping_group_item_valid ON logistics_shippinggroupitem;
DROP FUNCTION fulfillment_group_item_valid();
DROP TRIGGER line_frozen_snapshot ON orders_orderline;
DROP TRIGGER order_frozen_snapshot ON orders_order;
DROP FUNCTION fulfillment_order_snapshot();
DROP TRIGGER shipping_group_item_immutable ON logistics_shippinggroupitem;
DROP TRIGGER shipping_group_immutable ON logistics_shippinggroup;
DROP TRIGGER carrier_assignment_immutable ON logistics_carrierassignment;
DROP TRIGGER fulfillment_event_immutable ON logistics_fulfillmentevent;
DROP FUNCTION fulfillment_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("logistics", "0005_shippinggroup_order_shippinggroup_origin_and_more")]
    operations = [migrations.RunSQL(SQL, reverse_sql=REVERSE)]
