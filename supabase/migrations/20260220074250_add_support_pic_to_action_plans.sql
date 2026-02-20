-- Menambahkan kolom array untuk menampung PIC tambahan (Takshaka)
ALTER TABLE public.action_plans 
ADD COLUMN support_pic_ids uuid[] DEFAULT '{}';