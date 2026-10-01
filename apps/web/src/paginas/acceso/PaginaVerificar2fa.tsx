import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { verificar2fa } from '../../modulos/auth/api.js';
import { useAcceso } from '../../modulos/auth/ContextoAcceso.js';
import { CLAVE_SESION } from '../../modulos/auth/sesion.js';
import { useVolverAlAcceso } from '../../modulos/auth/useVolverAlAcceso.js';

export function PaginaVerificar2fa() {
  useTitulo('Verificación en dos pasos');
  const acceso = useAcceso();
  const cliente = useQueryClient();
  const volverAlAcceso = useVolverAlAcceso();
  const [codigo, setCodigo] = useState('');

  const verificar = useMutation({
    mutationFn: () => verificar2fa(codigo),
    // Con la sesión completa, la pantalla de acceso redirige sola al sistema.
    onSuccess: () => cliente.invalidateQueries({ queryKey: CLAVE_SESION }),
    onError: (error) => {
      if (!volverAlAcceso(error)) setCodigo('');
    },
  });

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    verificar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <h1>Verificación en dos pasos</h1>
      <p>
        {acceso.nombre ? `Hola, ${acceso.nombre}. ` : ''}Escribe el código de 6 dígitos que muestra
        tu aplicación autenticadora.
      </p>
      {verificar.isError && <Aviso tipo="error">{mensajeDe(verificar.error)}</Aviso>}
      <Campo
        etiqueta="Código de 6 dígitos"
        className="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        required
        autoFocus
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ''))}
      />
      <Boton type="submit" ancho cargando={verificar.isPending} disabled={codigo.length !== 6}>
        Entrar
      </Boton>
    </form>
  );
}
