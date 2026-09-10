from django.db import migrations


SQL = """
CREATE FUNCTION orders_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stock bigint; capacity bigint; used_stock bigint; used_capacity bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history is immutable'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','updated_at']) THEN
      RAISE EXCEPTION 'Reservation quantities are immutable';
    END IF;
    IF OLD.status <> NEW.status AND NOT
      ((OLD.status='reserved' AND NEW.status IN ('allocated','released')) OR
       (OLD.status='allocated' AND NEW.status='released')) THEN
      RAISE EXCEPTION 'Invalid reservation transition';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM orders_orderline l WHERE l.id=NEW.line_id
      AND l.variant_id=NEW.variant_id AND l.quantity=NEW.ready_quantity+NEW.production_quantity
      AND l.production_quantity=NEW.production_quantity) THEN
    RAISE EXCEPTION 'Reservation must match its order line';
  END IF;
  SELECT ready_stock,production_cap INTO stock,capacity FROM catalog_variantsupply
    WHERE variant_id=NEW.variant_id FOR UPDATE;
  IF stock IS NULL THEN RAISE EXCEPTION 'Supply required'; END IF;
  SELECT COALESCE(SUM(ready_quantity),0),COALESCE(SUM(production_quantity),0)
    INTO used_stock,used_capacity FROM orders_reservation
    WHERE variant_id=NEW.variant_id AND id<>NEW.id AND status IN ('reserved','allocated');
  IF NEW.status IN ('reserved','allocated') THEN
    used_stock := used_stock+NEW.ready_quantity;
    used_capacity := used_capacity+NEW.production_quantity;
  END IF;
  IF used_stock>stock OR used_capacity>capacity THEN RAISE EXCEPTION 'Supply overcommitted'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_guard BEFORE INSERT OR UPDATE OR DELETE ON orders_reservation
FOR EACH ROW EXECUTE FUNCTION orders_reservation_guard();

CREATE FUNCTION orders_supply_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM orders_reservation WHERE variant_id=OLD.variant_id AND status IN ('reserved','allocated')) THEN
      RAISE EXCEPTION 'Committed supply cannot be removed';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.ready_stock < (SELECT COALESCE(SUM(ready_quantity),0) FROM orders_reservation
       WHERE variant_id=NEW.variant_id AND status IN ('reserved','allocated')) OR
     NEW.production_cap < (SELECT COALESCE(SUM(production_quantity),0) FROM orders_reservation
       WHERE variant_id=NEW.variant_id AND status IN ('reserved','allocated')) THEN
    RAISE EXCEPTION 'Supply below committed quantities';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER committed_supply_guard BEFORE UPDATE OR DELETE ON catalog_variantsupply
FOR EACH ROW EXECUTE FUNCTION orders_supply_guard();

CREATE FUNCTION orders_checkout_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.group_id IS NOT NULL THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Checkout order is immutable'; END IF;
    IF ROW(NEW.group_id,NEW.commercial,NEW.response_deadline) IS DISTINCT FROM
       ROW(OLD.group_id,OLD.commercial,OLD.response_deadline) THEN
      RAISE EXCEPTION 'Checkout snapshot is immutable';
    END IF;
    IF NEW.payment_deadline IS DISTINCT FROM OLD.payment_deadline AND NOT
       (OLD.status='pending' AND NEW.status='accepted' AND OLD.payment_deadline IS NULL AND NEW.payment_deadline IS NOT NULL) THEN
      RAISE EXCEPTION 'Payment deadline starts once';
    END IF;
    IF OLD.status<>NEW.status AND NOT
       ((OLD.status='pending' AND NEW.status IN ('accepted','rejected','expired','cancelled')) OR
        (OLD.status='accepted' AND NEW.status IN ('active','expired','cancelled')) OR
        (OLD.status='active' AND NEW.status='cancelled')) THEN
      RAISE EXCEPTION 'Invalid order transition';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkout_snapshot BEFORE UPDATE OR DELETE ON orders_order
FOR EACH ROW EXECUTE FUNCTION orders_checkout_snapshot();

CREATE FUNCTION orders_cart_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active boolean;
BEGIN
  IF TG_TABLE_NAME='orders_cart' THEN
    active := OLD.is_active;
  ELSE
    IF TG_OP='INSERT' THEN
      SELECT is_active INTO active FROM orders_cart WHERE id=NEW.cart_id;
    ELSE
      SELECT is_active INTO active FROM orders_cart WHERE id=OLD.cart_id;
      IF TG_OP='UPDATE' AND NEW.cart_id<>OLD.cart_id THEN RAISE EXCEPTION 'Cart ownership is immutable'; END IF;
    END IF;
  END IF;
  IF NOT active THEN RAISE EXCEPTION 'Submitted cart is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER closed_cart_guard BEFORE UPDATE OR DELETE ON orders_cart
FOR EACH ROW EXECUTE FUNCTION orders_cart_frozen();
CREATE TRIGGER closed_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON orders_cartselection
FOR EACH ROW EXECUTE FUNCTION orders_cart_frozen();
CREATE TRIGGER order_group_immutable BEFORE UPDATE OR DELETE ON orders_ordergroup
FOR EACH ROW EXECUTE FUNCTION fulfillment_append_only();

CREATE FUNCTION orders_cancellation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cancellation history is immutable'; END IF;
  IF ROW(OLD.order_id,OLD.reason,OLD.deadline) IS DISTINCT FROM ROW(NEW.order_id,NEW.reason,NEW.deadline) THEN
    RAISE EXCEPTION 'Cancellation request is immutable';
  END IF;
  IF OLD.status IN ('denied','completed') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Cancellation is final';
  END IF;
  IF OLD.status<>NEW.status AND NOT
    ((OLD.status='pending' AND NEW.status IN ('referred','refund_pending')) OR
     (OLD.status='referred' AND NEW.status IN ('denied','refund_pending')) OR
     (OLD.status='refund_pending' AND NEW.status='completed' AND NEW.refund_reference IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid cancellation transition';
  END IF;
  IF NEW.refund_reference IS DISTINCT FROM OLD.refund_reference AND NOT
    (OLD.status='refund_pending' AND NEW.status='completed') THEN
    RAISE EXCEPTION 'Refund reference only at completion';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_guard BEFORE UPDATE OR DELETE ON orders_cancellationrequest
FOR EACH ROW EXECUTE FUNCTION orders_cancellation_guard();
"""

REVERSE = """
DROP TRIGGER cancellation_guard ON orders_cancellationrequest;
DROP FUNCTION orders_cancellation_guard();
DROP TRIGGER order_group_immutable ON orders_ordergroup;
DROP TRIGGER closed_selection_guard ON orders_cartselection;
DROP TRIGGER closed_cart_guard ON orders_cart;
DROP FUNCTION orders_cart_frozen();
DROP TRIGGER checkout_snapshot ON orders_order;
DROP FUNCTION orders_checkout_snapshot();
DROP TRIGGER committed_supply_guard ON catalog_variantsupply;
DROP FUNCTION orders_supply_guard();
DROP TRIGGER reservation_guard ON orders_reservation;
DROP FUNCTION orders_reservation_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("orders", "0004_cancellationrequest")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
