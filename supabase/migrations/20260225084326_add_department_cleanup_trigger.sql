-- 1. Buat fungsi penyapu otomatis untuk menghapus kode departemen dari array
CREATE OR REPLACE FUNCTION clean_deleted_department()
RETURNS TRIGGER AS $$
BEGIN
  -- Hapus kode departemen yang baru saja didrop dari array semua user
  UPDATE public.profiles
  SET additional_departments = array_remove(additional_departments, OLD.code)
  WHERE OLD.code = ANY(additional_departments);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Pasang Trigger di tabel departments
DROP TRIGGER IF EXISTS on_department_delete ON public.departments;
CREATE TRIGGER on_department_delete
AFTER DELETE ON public.departments
FOR EACH ROW EXECUTE FUNCTION clean_deleted_department();