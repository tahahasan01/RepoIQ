-- Which commit an analysis reviewed.
--
-- Without it a result cannot be tied to the code it describes: re-running
-- after a push produced a second row with no way to tell which push it
-- reflected.

ALTER TABLE public.analysis_results
    ADD COLUMN IF NOT EXISTS commit_sha TEXT;
