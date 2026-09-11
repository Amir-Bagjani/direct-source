from django.db import migrations

IMMUTABLE = ["financialevent", "invoice", "ledgerentry", "commissionrate", "compensationdecision"]
SQL = """
CREATE FUNCTION finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial records are append-only'; END $$;
""" + "\n".join(
    f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON finance_{table} FOR EACH ROW EXECUTE FUNCTION finance_immutable();"
    for table in IMMUTABLE
) + """
CREATE FUNCTION finance_validate_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e finance_financialevent; p finance_financialevent; o orders_order; sign integer;
BEGIN
  IF TG_TABLE_NAME = 'finance_financialevent' THEN e := NEW;
  ELSE SELECT * INTO e FROM finance_financialevent WHERE id = NEW.event_id; END IF;
  SELECT * INTO o FROM orders_order WHERE id=e.order_id FOR UPDATE;
  SELECT * INTO p FROM finance_financialevent WHERE order_id=e.order_id AND kind='payment';
  IF p.id IS NULL OR o.payment_reference IS DISTINCT FROM p.id THEN
    RAISE EXCEPTION 'Finance requires matching order payment';
  END IF;
  IF e.kind='payment' AND (
    e.goods_irr IS DISTINCT FROM (o.commercial->>'goods_total_irr')::bigint OR
    e.retailer_fee_irr IS DISTINCT FROM (o.commercial->>'retailer_commission_irr')::bigint OR
    e.manufacturer_fee_irr IS DISTINCT FROM (o.commercial->>'manufacturer_commission_irr')::bigint OR
    e.shipping_irr IS DISTINCT FROM (o.commercial->>'shipping_amount_irr')::bigint OR
    e.total_irr IS DISTINCT FROM (o.commercial->>'payable_total_irr')::bigint
  ) THEN RAISE EXCEPTION 'Payment must equal commercial snapshot'; END IF;
  IF (SELECT COALESCE(sum(total_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) > p.total_irr
    OR (SELECT COALESCE(sum(goods_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) > p.goods_irr
    OR (SELECT COALESCE(sum(shipping_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) > p.shipping_irr
  THEN RAISE EXCEPTION 'Refund exceeds payment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM finance_ledgerentry WHERE event_id=e.id)
     OR (SELECT sum(amount_irr) FROM finance_ledgerentry WHERE event_id=e.id) <> 0
  THEN RAISE EXCEPTION 'Financial journal must balance'; END IF;
  IF EXISTS (SELECT 1 FROM finance_ledgerentry l JOIN logistics_shippinggroup g ON g.id=l.shipping_group_id WHERE l.event_id=e.id AND g.order_id<>e.order_id)
  THEN RAISE EXCEPTION 'Logistics journal belongs to another order'; END IF;
  IF e.kind <> 'settlement' AND NOT EXISTS (SELECT 1 FROM finance_invoice WHERE event_id=e.id)
  THEN RAISE EXCEPTION 'Financial document required'; END IF;
  IF e.kind IN ('refund','adjustment') AND NOT EXISTS (
    SELECT 1 FROM finance_compensationdecision d WHERE d.id::text=e.reference
      AND d.order_id=e.order_id AND d.id=e.idempotency_key
  ) THEN RAISE EXCEPTION 'Compensation decision required'; END IF;
  IF (SELECT COALESCE(sum(retailer_fee_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) > p.retailer_fee_irr
    OR (SELECT COALESCE(sum(manufacturer_fee_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) > p.manufacturer_fee_irr
  THEN RAISE EXCEPTION 'Fee reversal exceeds payment'; END IF;
  IF EXISTS (
    SELECT g.id FROM logistics_shippinggroup g JOIN finance_ledgerentry l ON l.shipping_group_id=g.id
    WHERE g.order_id=e.order_id GROUP BY g.id
    HAVING sum(l.amount_irr)<0 OR sum(l.amount_irr)>g.amount_irr
  ) THEN RAISE EXCEPTION 'Shipping group balance exceeds snapshot'; END IF;
  IF e.kind='settlement' AND o.status <> 'completed' THEN
    RAISE EXCEPTION 'Settlement must complete its order';
  END IF;
  IF e.kind='settlement' AND (
    e.goods_irr <> p.goods_irr - (SELECT COALESCE(sum(goods_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) OR
    e.manufacturer_fee_irr <> p.manufacturer_fee_irr - (SELECT COALESCE(sum(manufacturer_fee_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment')) OR
    e.retailer_fee_irr <> p.retailer_fee_irr - (SELECT COALESCE(sum(retailer_fee_irr),0) FROM finance_financialevent WHERE order_id=e.order_id AND kind IN ('refund','adjustment'))
  ) THEN RAISE EXCEPTION 'Settlement must use final retained amounts'; END IF;
  sign := CASE WHEN e.kind IN ('refund','adjustment') THEN -1 ELSE 1 END;
  IF e.kind <> 'settlement' AND (
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='cash') <> -e.total_irr*sign OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='producer_payable') <> (e.goods_irr-e.manufacturer_fee_irr)*sign OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='commission_reserved') <> (e.retailer_fee_irr+e.manufacturer_fee_irr)*sign OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='logistics') <> e.shipping_irr*sign OR
    EXISTS (SELECT 1 FROM finance_ledgerentry WHERE event_id=e.id AND account='commission_revenue')
  ) THEN RAISE EXCEPTION 'Journal accounts must match event'; END IF;
  IF e.kind='settlement' AND (
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='cash') <> e.total_irr OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='producer_payable') <> -e.total_irr OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='commission_reserved') <> -(e.retailer_fee_irr+e.manufacturer_fee_irr) OR
    (SELECT COALESCE(sum(amount_irr),0) FROM finance_ledgerentry WHERE event_id=e.id AND account='commission_revenue') <> e.retailer_fee_irr+e.manufacturer_fee_irr OR
    EXISTS (SELECT 1 FROM finance_ledgerentry WHERE event_id=e.id AND account='logistics')
  ) THEN RAISE EXCEPTION 'Settlement journal must exclude logistics'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER finance_event_complete AFTER INSERT ON finance_financialevent
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_validate_event();
CREATE CONSTRAINT TRIGGER finance_journal_balanced AFTER INSERT ON finance_ledgerentry
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_validate_event();
CREATE FUNCTION finance_validate_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e finance_financialevent;
BEGIN
 SELECT * INTO e FROM finance_financialevent WHERE id=NEW.event_id;
 IF (e.kind='payment' AND NEW.original_id IS NOT NULL)
   OR e.kind='settlement'
   OR (e.kind IN ('refund','adjustment') AND NOT EXISTS (
     SELECT 1 FROM finance_invoice i JOIN finance_financialevent p ON p.id=i.event_id
     WHERE i.id=NEW.original_id AND p.kind='payment' AND p.order_id=e.order_id))
 THEN RAISE EXCEPTION 'Invalid document reference'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_document_valid BEFORE INSERT ON finance_invoice
FOR EACH ROW EXECUTE FUNCTION finance_validate_document();
"""
REVERSE = """
DROP TRIGGER finance_document_valid ON finance_invoice;
DROP FUNCTION finance_validate_document();
DROP TRIGGER finance_journal_balanced ON finance_ledgerentry;
DROP TRIGGER finance_event_complete ON finance_financialevent;
DROP FUNCTION finance_validate_event();
""" + "\n".join(f"DROP TRIGGER immutable_{table} ON finance_{table};" for table in IMMUTABLE) + "\nDROP FUNCTION finance_immutable();"

class Migration(migrations.Migration):
    dependencies = [("finance", "0001_initial"), ("orders", "0006_order_completion")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
