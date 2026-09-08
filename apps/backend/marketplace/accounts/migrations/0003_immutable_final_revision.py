from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_businessrevision")]
    operations = [migrations.RunSQL(
        sql="""
            CREATE FUNCTION prevent_final_revision_mutation() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF OLD.status IN ('approved', 'rejected') THEN
                    RAISE EXCEPTION 'Final business revisions are immutable';
                END IF;
                IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
                RETURN NEW;
            END;
            $$;
            CREATE TRIGGER immutable_final_revision
            BEFORE UPDATE OR DELETE ON accounts_businessrevision
            FOR EACH ROW EXECUTE FUNCTION prevent_final_revision_mutation();
        """,
        reverse_sql="""
            DROP TRIGGER immutable_final_revision ON accounts_businessrevision;
            DROP FUNCTION prevent_final_revision_mutation();
        """,
    )]
