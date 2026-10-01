import type { ReactNode } from 'react';

type TipoAviso = 'info' | 'exito' | 'advertencia' | 'error';

/** Mensaje destacado. Los errores y advertencias se anuncian de inmediato a los lectores de pantalla. */
export function Aviso({ tipo = 'info', children }: { tipo?: TipoAviso; children: ReactNode }) {
  const urgente = tipo === 'error' || tipo === 'advertencia';
  return (
    <div className={`aviso aviso--${tipo}`} role={urgente ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
