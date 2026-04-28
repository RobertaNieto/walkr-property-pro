-- Update function to ensure ON CONFLICT DO NOTHING semantics
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role, status, email, full_name, invited_at)
  VALUES (
    NEW.id,
    'agent',
    'active',
    NEW.email,
    NULL,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();

-- Backfill missing user
INSERT INTO public.user_roles (user_id, role, status, email)
SELECT id, 'agent', 'active', email
FROM auth.users
WHERE email = 'jessnieto28@gmail.com'
ON CONFLICT (user_id) DO NOTHING;