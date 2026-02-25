
ALTER TABLE guest_list_allotments
ADD COLUMN box_office_email text,
ADD COLUMN box_office_phone text,
ADD COLUMN auto_notify_box_office boolean NOT NULL DEFAULT false;
