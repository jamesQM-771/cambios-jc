-- El nombre de usuario se guarda siempre en minúsculas (D40): así la búsqueda exacta del login
-- y el índice único no dependen de cómo lo escriba cada persona.
-- Si existiera un usuario con mayúsculas, esta migración falla en lugar de cambiarlo en silencio.
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_login_en_minusculas" CHECK ("login" = lower("login"));
