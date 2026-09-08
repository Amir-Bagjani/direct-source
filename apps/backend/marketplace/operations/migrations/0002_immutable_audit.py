from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("operations", "0001_initial")]
    operations = [
        migrations.RunSQL(
            sql="""
                CREATE FUNCTION prevent_audit_mutation() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'Audit events are append-only';
                END;
                $$;
                CREATE TRIGGER immutable_audit
                BEFORE UPDATE OR DELETE ON operations_auditevent
                FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
            """,
            reverse_sql="""
                DROP TRIGGER immutable_audit ON operations_auditevent;
                DROP FUNCTION prevent_audit_mutation();
            """,
        )
    ]
