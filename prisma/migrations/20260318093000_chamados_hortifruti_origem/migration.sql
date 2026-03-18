DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrigemChamadoManutencao'
      AND e.enumlabel = 'HORTIFRUTI'
  ) THEN
    ALTER TYPE "OrigemChamadoManutencao" ADD VALUE 'HORTIFRUTI';
  END IF;
END
$$;
