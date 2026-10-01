export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="cargando__rueda" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
