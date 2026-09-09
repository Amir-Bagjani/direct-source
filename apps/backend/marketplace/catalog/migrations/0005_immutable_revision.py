from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("catalog", "0004_productrevision_and_more")]
    operations = [migrations.RunSQL(
        sql="""
        CREATE FUNCTION protect_terminal_product_revision() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.status IN ('approved', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Terminal product revision is immutable';
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER immutable_product_revision BEFORE UPDATE OR DELETE ON catalog_productrevision
        FOR EACH ROW EXECUTE FUNCTION protect_terminal_product_revision();
        """,
        reverse_sql="DROP TRIGGER immutable_product_revision ON catalog_productrevision; DROP FUNCTION protect_terminal_product_revision();",
    )]
