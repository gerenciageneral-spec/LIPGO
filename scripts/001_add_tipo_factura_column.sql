-- Add tipo_factura column to cabeceraoc table
-- Values: 'sin_factura' | 'con_factura'
ALTER TABLE cabeceraoc
  ADD COLUMN IF NOT EXISTS tipo_factura TEXT;

-- Optional index for filtering by tipo
CREATE INDEX IF NOT EXISTS idx_cabeceraoc_tipo_factura
  ON cabeceraoc(tipo_factura);
