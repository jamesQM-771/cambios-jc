import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Cargando } from '../../componentes/Cargando.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { CLAVE_EMPRESA, pedirEmpresa } from '../../modulos/empresa/api.js';

import { FormularioEmpresa } from './FormularioEmpresa.js';
import { SeccionLogo } from './SeccionLogo.js';

export function PaginaEmpresa() {
  useTitulo('Empresa');
  const consulta = useQuery({ queryKey: CLAVE_EMPRESA, queryFn: pedirEmpresa });
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <>
      <div className="cabecera-pagina">
        <h1>Empresa</h1>
        <p>Los datos de la empresa se usan en el sistema y en los recibos.</p>
      </div>
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {consulta.isPending && <Cargando texto="Cargando los datos de la empresa…" />}
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
            alGuardar={() => setAviso('Se guardaron los cambios.')}
          />
          <SeccionLogo empresa={consulta.data} alSubir={() => setAviso('El logo se actualizó.')} />
        </>
      )}
    </>
  );
}
