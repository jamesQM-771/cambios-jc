# Credenciales de prueba para TestSprite (plantilla)

Copia este archivo como `credenciales.md` en esta misma carpeta y complétalo. `credenciales.md` está en
`.gitignore`: no se sube a GitHub. Usa solo cuentas de una base de desarrollo o de pruebas, nunca las
de la instalación real del negocio.

La clave 2FA es el texto que muestra la pantalla "Configura la verificación en dos pasos" (botón
"Copiar"), sin espacios. El código de 6 dígitos se genera con `pyotp.TOTP(clave).now()`.

| Rol | Usuario | Contraseña | Clave 2FA |
|---|---|---|---|
| Administrador | admin | | |
| Vendedor | vendedor.prueba | | |
| Digitador | digitador.prueba | | |

Web: http://localhost:5173 · API: http://localhost:3000
