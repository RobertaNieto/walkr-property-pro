CREATE OR REPLACE FUNCTION public.validate_walkthrough_upload_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.upload_status NOT IN ('pending','uploading','photos_complete','confirmed','failed','partial') THEN
    RAISE EXCEPTION 'Invalid upload_status: %', NEW.upload_status;
  END IF;
  RETURN NEW;
END;
$function$;