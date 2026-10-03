BEGIN;

CREATE TABLE public.shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_name text NOT NULL CHECK (char_length(btrim(person_name)) BETWEEN 1 AND 80),
    date date NOT NULL CHECK (date >= DATE '0001-01-01' AND date <= DATE '9999-12-31'),
    starts_at time(0) NOT NULL,
    ends_at time(0) NOT NULL,
    role text NOT NULL CHECK (char_length(btrim(role)) BETWEEN 1 AND 100),
    CONSTRAINT shifts_time_range CHECK (
        starts_at < ends_at AND ends_at < TIME '24:00'
        AND extract(second FROM starts_at) = 0 AND extract(second FROM ends_at) = 0
    )
);
CREATE INDEX shifts_date_starts_at_idx ON public.shifts (date, starts_at);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shifts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
CREATE POLICY shifts_admin_read ON public.shifts FOR SELECT TO authenticated USING (true);

COMMIT;
