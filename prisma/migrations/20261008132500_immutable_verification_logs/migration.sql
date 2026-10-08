-- Create trigger function to prevent UPDATE or DELETE on verification_logs
CREATE OR REPLACE FUNCTION prevent_verification_logs_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'verification_logs is an immutable insert-only audit table. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if already exists to ensure idempotency
DROP TRIGGER IF EXISTS verification_logs_immutable_trigger ON "verification_logs";

-- Create trigger on verification_logs
CREATE TRIGGER verification_logs_immutable_trigger
BEFORE UPDATE OR DELETE ON "verification_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_verification_logs_modification();
