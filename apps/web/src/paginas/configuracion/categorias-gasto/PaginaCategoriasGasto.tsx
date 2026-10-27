import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Dialogo } from '../../../componentes/Dialogo.js';
import { DialogoConfirmacion } from '../../../componentes/DialogoConfirmacion.js';
import { useNotificar } from '../../../componentes/Notificaciones.js';
import { Esqueleto } from '../../../componentes/Pagina.js';
import { TablaCatalogo } from '../../../componentes/TablaCatalogo.js';
import { mensajeDe } from '../../../lib/api.js';
import { useTitulo } from '../../../lib/titulo.js';
import {
  desactivarCategoriaGasto,
  reactivarCategoriaGasto,
} from '../../../modulos/categorias-gasto/api.js';
import {
  CLAVE_CATEGORIAS_GASTO,
  useCategoriasGasto,
} from '../../../modulos/categorias-gasto/consultas.js';
import type { CategoriaGasto } from '../../../modulos/categorias-gasto/tipos.js';

import { FormularioCategoriaGasto } from './FormularioCategoriaGasto.js';

type DialogoActivo =
  { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; categoria: CategoriaGasto };

/** Las categorías con las que se clasifican los gastos operativos (§5.18). */
export function PaginaCategoriasGasto() {
  useTitulo('Categorías de gasto · Configuración');
  const cliente = useQueryClient();
  const notificar = useNotificar();
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lista = useCategoriasGasto();

  const alExito = (texto: string) => {
    setError(null);
    notificar(texto);
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_CATEGORIAS_GASTO });
  };

  const desactivar = useMutation({
    mutationFn: (categoria: CategoriaGasto) => desactivarCategoriaGasto(categoria.id),
    onSuccess: (_r, categoria) => alExito(`${categoria.nombre} fue desactivada.`),
  });
  const reactivar = useMutation({
    mutationFn: (categoria: CategoriaGasto) => reactivarCategoriaGasto(categoria.id),
    onSuccess: (_r, categoria) => alExito(`${categoria.nombre} fue reactivada.`),
    onError: (fallo) => setError(mensajeDe(fallo)),
  });

  const categorias = (lista.data?.categorias ?? []).filter((c) => mostrarInactivas || c.activa);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Categorías de gasto</h2>
          <p>
            Con ellas se clasifican los gastos. Sin categorías activas nadie puede registrar uno.
          </p>
        </div>
        <Boton
          onClick={() => {
            setError(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva categoría
        </Boton>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {lista.isPending && <Esqueleto texto="Cargando las categorías…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Categorías de gasto"
          items={categorias}
          idDe={(c) => c.id}
          nombreDe={(c) => c.nombre}
          activaDe={(c) => c.activa}
          columnas={[{ encabezado: 'Nombre', render: (c) => c.nombre }]}
          buscarEn={(c) => c.nombre}
          nombrePlural="categorías"
          filtros={
            <label className="campo__casilla">
              <input
                type="checkbox"
                checked={mostrarInactivas}
                onChange={(evento) => setMostrarInactivas(evento.target.checked)}
              />
              Mostrar desactivadas
            </label>
          }
          alEditar={(categoria) => {
            setError(null);
            setDialogo({ tipo: 'editar', categoria });
          }}
          alDesactivar={(categoria) => {
            setError(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', categoria });
          }}
          alReactivar={(categoria) => {
            setError(null);
            reactivar.mutate(categoria);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar categoría' : 'Nueva categoría'}
      >
        <FormularioCategoriaGasto
          categoria={dialogo?.tipo === 'editar' ? dialogo.categoria : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la categoría.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar categoría?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.categoria)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>
            “{dialogo.categoria.nombre}” ya no se podrá elegir en gastos nuevos. Los gastos que ya
            la usan no cambian.
          </p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
