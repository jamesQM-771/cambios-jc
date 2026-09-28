// Marcador para scripts de CLAUDE.md §9 que todavía no tienen implementación.
// Se reemplaza en la tarea indicada de docs/fases/FASE-0.md.
const [script = '?', tarea = '?'] = process.argv.slice(2);
console.error(`"npm run ${script}" estará disponible desde la tarea ${tarea} de la fase 0.`);
process.exit(1);
