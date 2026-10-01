import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { iniciarSesion } from '../../modulos/auth/api.js';
import { RUTA_DE_PASO, useAcceso } from '../../modulos/auth/ContextoAcceso.js';

export function PaginaLogin() {
  useTitulo('Iniciar sesión');
  const acceso = useAcceso();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const mensaje = (ubicacion.state as { mensaje?: string } | null)?.mensaje;
  const [login, setLogin] = useState('');
  const [contrasena, setContrasena] = useState('');

  const entrar = useMutation({
    mutationFn: () => iniciarSesion(login, contrasena),
    onSuccess: ({ siguientePaso, nombre }) => {
      acceso.alIniciar(siguientePaso, nombre);
      void navegar(RUTA_DE_PASO[siguientePaso]);
    },
    onError: () => setContrasena(''),
  });

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    entrar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <h1>Iniciar sesión</h1>
      {mensaje && <Aviso tipo="advertencia">{mensaje}</Aviso>}
      {entrar.isError && <Aviso tipo="error">{mensajeDe(entrar.error)}</Aviso>}
      <Campo
        etiqueta="Usuario"
        name="usuario"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={login}
        onChange={(evento) => setLogin(evento.target.value)}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="current-password"
        required
        value={contrasena}
        onChange={(evento) => setContrasena(evento.target.value)}
      />
      <Boton type="submit" ancho cargando={entrar.isPending} disabled={!login || !contrasena}>
        Continuar
      </Boton>
    </form>
  );
}
