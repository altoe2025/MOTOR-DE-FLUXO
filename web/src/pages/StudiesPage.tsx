import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyController } from '../app/providers';
import { StudyList } from '../study/components/StudyList';
import { moveStudyToTrash } from '../study/domain';
import type { StudyDocument } from '../study/model';

export function StudiesPage() {
  const controller = useStudyController(); const navigate = useNavigate(); const heading = useRef<HTMLHeadingElement>(null);
  const [studies, setStudies] = useState<StudyDocument[]>([]); const [error, setError] = useState<string | null>(null);
  const refresh = async () => { try { setStudies(await controller.listStudies(true)); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os estudos.'); } };
  useEffect(() => { heading.current?.focus(); void refresh(); return controller.subscribe(() => void refresh()); }, [controller]);
  const remove = async (study: StudyDocument) => { if (!window.confirm(`Mover o estudo “${study.name}” para a lixeira?`)) return; try { await controller.loadStudy(study.id); controller.edit(await moveStudyToTrash(study, new Date().toISOString())); await controller.flush(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o estudo.'); } };
  return <article className="destination-page"><p className="eyebrow">Estudos</p><h1 ref={heading} tabIndex={-1}>Estudos</h1><p className="page-introduction">Abra uma carteira salva para revisar sua origem, premissas e resultado.</p>{error ? <p role="alert" className="inline-notice inline-notice--error">{error}</p> : null}<StudyList studies={studies} selectedId={controller.snapshot.document?.id ?? null} onOpen={(id) => navigate(`/estudos/${id}`)} onRestore={(study) => void controller.restoreStudy(study.id, study.revision).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível restaurar o estudo.'))} onDelete={remove} /></article>;
}
