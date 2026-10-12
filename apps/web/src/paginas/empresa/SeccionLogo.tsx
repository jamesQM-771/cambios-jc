import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { SeccionFormulario } from '../../componentes/Pagina.js';
import { mensajeDe, urlApi } from '../../lib/api.js';
import { CLAVE_SESION } from '../../modulos/auth/sesion.js';
import { CLAVE_EMPRESA, subirLogo, type Empresa } from '../../modulos/empresa/api.js';

const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg'];
const MAXIMO_BYTES = 1_048_576;

/** Revisa el archivo antes de enviarlo (el servidor lo vuelve a revisar por su contenido). */
function problemaConArchivo(archivo: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) return 'El logo debe ser una imagen PNG o JPG.';
  if (archivo.size > MAXIMO_BYTES) return 'El archivo supera 1 MB, el máximo permitido.';
  return null;
}

export function SeccionLogo({ empresa, alSubir }: { empresa: Empresa; alSubir: () => void }) {
  const cliente = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  // Cambiar la clave del campo de archivo es la forma de vaciarlo después de subir.
  const [versionCampo, setVersionCampo] = useState(0);

  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const direccion = URL.createObjectURL(archivo);
    setVista(direccion);
    return () => URL.revokeObjectURL(direccion);
  }, [archivo]);

  const subir = useMutation({
    mutationFn: (elegido: File) => subirLogo(elegido),
    onSuccess: async (editada) => {
      cliente.setQueryData(CLAVE_EMPRESA, editada);
      await cliente.invalidateQueries({ queryKey: CLAVE_SESION });
      setArchivo(null);
      setVersionCampo((version) => version + 1);
      alSubir();
    },
  });

  const alElegir = (elegido: File | undefined) => {
    subir.reset();
    if (!elegido) {
      setArchivo(null);
      setProblema(null);
      return;
    }
    const error = problemaConArchivo(elegido);
    setProblema(error);
    setArchivo(error ? null : elegido);
  };

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (archivo) subir.mutate(archivo);
  };

  return (
    <form className="formulario-empresa" onSubmit={enviar} noValidate>
      <SeccionFormulario
        titulo="Logo"
        descripcion="Aparece en el encabezado y en la pantalla de acceso. También irá en los recibos cuando existan."
      >
        <div className="logo">
          <figure className="logo__marco">
            {empresa.logoUrl ? (
              <img
                className="logo__vista"
                src={urlApi(empresa.logoUrl)}
                alt="Logo actual de la empresa"
              />
            ) : (
              <div className="logo__sin">Sin logo</div>
            )}
            <figcaption>Actual</figcaption>
          </figure>
          {vista && (
            <figure className="logo__marco">
              <img className="logo__vista" src={vista} alt="Vista previa del logo nuevo" />
              <figcaption>Nuevo, sin guardar</figcaption>
            </figure>
          )}
        </div>
        {subir.isError && <Aviso tipo="error">{mensajeDe(subir.error)}</Aviso>}
        <Campo
          key={versionCampo}
          etiqueta="Logo nuevo"
          type="file"
          accept="image/png,image/jpeg"
          ayuda="Imagen PNG o JPG, de hasta 1 MB. Mejor cuadrada y con fondo claro o transparente."
          error={problema ?? undefined}
          onChange={(evento) => alElegir(evento.target.files?.[0])}
        />
        <Boton type="submit" cargando={subir.isPending} disabled={!archivo}>
          {empresa.logoUrl ? 'Reemplazar logo' : 'Subir logo'}
        </Boton>
      </SeccionFormulario>
    </form>
  );
}
