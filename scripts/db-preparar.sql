-- Prepara PostgreSQL 18 para desarrollo local de Cambios JC.
-- Ejecútalo UNA VEZ como superusuario (postgres) desde pgAdmin (Query Tool)
-- o desde psql:
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f scripts/db-preparar.sql
--
-- Antes de ejecutarlo, reemplaza CAMBIA_ESTA_CLAVE por una clave propia
-- y usa la misma en DATABASE_URL y DATABASE_URL_PRUEBAS de tu .env.

CREATE ROLE cambios_jc WITH LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE' CREATEDB;

CREATE DATABASE cambios_jc OWNER cambios_jc ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE cambios_jc_pruebas OWNER cambios_jc ENCODING 'UTF8' TEMPLATE template0;
