from django.db import migrations


SQL = """
CREATE OR REPLACE FUNCTION fulfillment_allocation_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_pk uuid; group_pk uuid; require_exact boolean := false;
BEGIN
  IF TG_TABLE_NAME='logistics_shipmentitem' THEN
    SELECT request_id INTO request_pk FROM logistics_shipment WHERE id=COALESCE(NEW.shipment_id, OLD.shipment_id);
  ELSE
    request_pk := NEW.request_id;
    IF TG_OP='UPDATE' THEN require_exact := NEW.purpose='order' AND NEW.status='handed_over' AND OLD.status='ready'; END IF;
  END IF;
  SELECT group_id INTO group_pk FROM logistics_shippingrequest WHERE id=request_pk;
  IF EXISTS(
    SELECT 1 FROM logistics_shippinggroupitem gi LEFT JOIN (
      SELECT si.group_item_id, SUM(si.quantity) qty FROM logistics_shipmentitem si
      JOIN logistics_shipment s ON s.id=si.shipment_id
      WHERE s.request_id=request_pk AND s.purpose='order' AND s.status<>'cancelled' AND s.resolution<>'resend'
      GROUP BY si.group_item_id
    ) allocation ON allocation.group_item_id=gi.id
    WHERE gi.group_id=group_pk AND (COALESCE(allocation.qty,0)>gi.quantity OR
       (require_exact AND COALESCE(allocation.qty,0)<>gi.quantity))
  ) THEN RAISE EXCEPTION 'Shipment allocation exceeds group or hand-over coverage is incomplete'; END IF;
  RETURN NULL;
END $$;
"""

REVERSE = """
CREATE OR REPLACE FUNCTION fulfillment_allocation_valid() RETURNS trigger LANGUAGE plpgsql AS $$
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
"""


class Migration(migrations.Migration):
    dependencies = [("logistics", "0009_shipment_compensation_shipment_purpose")]
    operations = [migrations.RunSQL(SQL, reverse_sql=REVERSE)]
