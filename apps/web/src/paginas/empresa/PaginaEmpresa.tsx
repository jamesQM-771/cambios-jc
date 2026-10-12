import { useQuery } from '@tanstack/react-query';

import { Aviso } from '../../componentes/Aviso.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { CLAVE_EMPRESA, pedirEmpresa } from '../../modulos/empresa/api.js';

import { FormularioEmpresa } from './FormularioEmpresa.js';
import { SeccionLogo } from './SeccionLogo.js';

export function PaginaEmpresa() {
  useTitulo('Empresa');
  const consulta = useQuery({ queryKey: CLAVE_EMPRESA, queryFn: pedirEmpresa });
  const notificar = useNotificar();

  return (
    <>
      <EncabezadoPagina
        titulo="Empresa"
        descripcion="Los datos del negocio. Se usan en el sistema y, más adelante, en los recibos."
      />
      {consulta.isPending && <Esqueleto texto="Cargando los datos de la empresa…" filas={8} />}
      {consulta.isError && <Aviso tipo="error">{mensajeDe(consulta.error)}</Aviso>}
      {consulta.data && (
        <>
          {/* La clave reinicia el formulario cuando cambian sus datos guardados, pero no al subir el logo. */}
          <FormularioEmpresa
            key={JSON.stringify([
              consulta.data.nombre,
              consulta.data.nit,
              consulta.data.telefono,
              consulta.data.whatsapp,
              consulta.data.direccion,
              consulta.data.monedaLocal,
              consulta.data.zonaHoraria,
              consulta.data.textoPieRecibo,
            ])}
            empresa={consulta.data}
            alGuardar={() => {
              notificar('Se guardaron los cambios.');
            }}
          />
          <SeccionLogo
            empresa={consulta.data}
            alSubir={() => {
              notificar('El logo se actualizó.');
            }}
          />
        </>
      )}
    </>
  );
}
