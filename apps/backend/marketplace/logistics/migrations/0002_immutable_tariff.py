from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("logistics", "0001_initial")]
    operations = [migrations.RunSQL(
        sql="""
        CREATE FUNCTION protect_activated_tariff() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.activated_at IS NOT NULL THEN
            IF TG_OP = 'DELETE' THEN
              RAISE EXCEPTION 'Activated tariff cannot be deleted';
            END IF;
            IF (to_jsonb(NEW) - ARRAY['is_active','updated_at']) IS DISTINCT FROM
               (to_jsonb(OLD) - ARRAY['is_active','updated_at']) THEN
              RAISE EXCEPTION 'Activated tariff content is immutable';
            END IF;
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER immutable_tariff BEFORE UPDATE OR DELETE ON logistics_tariff
        FOR EACH ROW EXECUTE FUNCTION protect_activated_tariff();
        """,
        reverse_sql="DROP TRIGGER immutable_tariff ON logistics_tariff; DROP FUNCTION protect_activated_tariff();",
    )]
