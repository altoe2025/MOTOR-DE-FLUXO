import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStudyController } from '../app/providers';
import { StudyEditor } from '../study/components/StudyEditor';
import type { PortfolioSourceKind } from '../study/components/PortfolioSourceSelector';
import { duplicateStudy, renameStudy } from '../study/domain';
import type { StudyDocument } from '../study/model';

export function StudyPortfolioPage() {
  const { id } = useParams(); const controller = useStudyController(); const navigate = useNavigate();
  const [study, setStudy] = useState<StudyDocument | null>(null); const [error, setError] = useState<string | null>(null); const [cases, setCases] = useState<Awaited<ReturnType<typeof controller.listObservedCases>>>([]);
  useEffect(() => { if (!id) return; void Promise.all([controller.loadStudy(id), controller.listObservedCases()]).then(([loaded, observed]) => { setStudy(loaded); setCases(observed); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o estudo.')); return controller.subscribe(() => setStudy(controller.snapshot.document)); }, [controller, id]);
  if (study === null) return <article className="destination-page"><h1 tabIndex={-1}>Estudo não encontrado</h1><p>{error ?? 'O estudo pode ter sido removido ou pertencer a outra conta.'}</p></article>;
  const save = (next: StudyDocument) => { controller.edit(next); setStudy(next); };
  return <StudyEditor study={study} observedCases={cases} status={controller.snapshot.status} error={error} onRename={async (name) => save(await renameStudy(study, name, new Date().toISOString()))} onDuplicate={async () => { const copy = await duplicateStudy(study, new Date().toISOString(), () => crypto.randomUUID()); controller.startNewStudy(); controller.edit(copy); navigate(`/estudos/${copy.id}`); }} onSourceChange={async (kind: PortfolioSourceKind) => { setError(`A origem ${kind === 'OBSERVED_CASE' ? 'observada' : kind === 'AUTHORED' ? 'manual' : 'sintética'} deve ser preparada antes de salvar. Escolha os parâmetros no formulário da origem.`); }} />;
}
