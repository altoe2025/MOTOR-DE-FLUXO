import Decimal from 'decimal.js';

import { participantNames } from '../hypotheses/participantNames';
import { companyResolver } from '../levers/companies';
import type { StudyController } from '../study/studyController';
import type { StudyDocument } from '../study/model';

export type PresentationParticipants = Readonly<{
  /** Nome legível por cliente_id: "AstroPay" ou "AstroPay · linha 2". */
  names: Readonly<Record<string, string>>;
  /** Empresa de cada cliente_id, quando conhecida. */
  companies: Readonly<Record<string, string>>;
}>;

type ParticipantController = Pick<StudyController, 'listCompanies' | 'listOperationalProfileVersions'>
  & Partial<Pick<StudyController, 'getObservedCase'>>;

/** Empresa do caso único de origem (caso observado ou variação dele), quando houver. */
async function singleCaseCompany(study: StudyDocument, executionId: string,
  controller: ParticipantController): Promise<string | null> {
  const source = study.executions.find((item) => item.id === executionId)?.sourceSnapshot?.source;
  const caseId = source?.kind === 'OBSERVED_CASE' ? source.caseId
    : source?.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
      ? source.definition.derivedFromObservedCase?.caseId : undefined;
  if (caseId === undefined || controller.getObservedCase === undefined) return null;
  const observed = await controller.getObservedCase(caseId);
  if (observed === null) return null;
  const companies = await controller.listCompanies();
  return companies.find((item) => item.id === observed.companyId)?.displayName ?? null;
}

/**
 * Nomes legíveis dos participantes da execução. Composição por Perfil usa o nome do
 * Perfil/empresa; ordens explícitas usam a empresa de cada ordem (cadastro quando a carteira
 * junta casos; empresa do caso único; senão o prefixo do ID) e numeram as linhas de produto
 * de uma mesma empresa por volume, porque o nome do cliente não fica salvo no caso.
 */
export async function presentationParticipants(
  study: StudyDocument,
  executionId: string,
  controller: ParticipantController,
): Promise<PresentationParticipants> {
  const execution = study.executions.find((item) => item.id === executionId);
  const snapshot = execution?.sourceSnapshot;
  if (execution === undefined || snapshot === undefined) return { names: {}, companies: {} };
  const input = snapshot.generationInputSnapshot;
  if (input !== undefined) {
    const [companies, profiles] = await Promise.all([controller.listCompanies(), controller.listOperationalProfileVersions()]);
    const names = participantNames(input, [...profiles, ...study.evidenceSnapshots.map((item) => item.profile)], companies);
    return { names: Object.fromEntries([...names].map(([id, label]) => [id, label.name])), companies: {} };
  }
  const source = snapshot.source;
  const joined = source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    && source.definition.companyByOrder !== undefined;
  const single = joined ? null : await singleCaseCompany(study, executionId, controller).catch(() => null);
  const companyOf = companyResolver(source);
  const volume = new Map<string, Decimal>();
  const companyByClient = new Map<string, string>();
  for (const order of snapshot.orders) {
    volume.set(order.cliente_id, (volume.get(order.cliente_id) ?? new Decimal(0)).plus(order.valor_brl));
    if (!companyByClient.has(order.cliente_id)) companyByClient.set(order.cliente_id, single ?? companyOf(order.id));
  }
  const clientsByCompany = new Map<string, string[]>();
  for (const [client, company] of companyByClient) clientsByCompany.set(company, [...clientsByCompany.get(company) ?? [], client]);
  const names: Record<string, string> = {};
  for (const [company, clients] of clientsByCompany) {
    const ordered = [...clients].sort((left, right) => volume.get(right)!.comparedTo(volume.get(left)!) || left.localeCompare(right));
    ordered.forEach((client, index) => { names[client] = ordered.length === 1 ? company : `${company} · linha ${index + 1}`; });
  }
  return { names, companies: Object.fromEntries(companyByClient) };
}

/** Compatibilidade: só os nomes. */
export async function presentationParticipantNames(
  study: StudyDocument,
  executionId: string,
  controller: ParticipantController,
): Promise<Record<string, string>> {
  return { ...(await presentationParticipants(study, executionId, controller)).names };
}
