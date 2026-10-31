-- Preserve existing immutable model rows while allowing native IFC STEP models.
alter table construction_model_files drop constraint if exists construction_model_files_format_check;
alter table construction_model_files add constraint construction_model_files_format_check check(format in ('obj','glb','ifc'));
