
ALTER FUNCTION public.validate_walkthrough_upload_status() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.validate_walkthrough_upload_status() FROM PUBLIC, anon, authenticated;
