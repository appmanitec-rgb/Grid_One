import Link from "next/link";
import { apiFetch, apiUrl } from "@/lib/api";

type Params = { id: string };

type ClientAddress = {
  id: string;
  type: "BILLING" | "INSTALLATION" | "OTHER";
  street: string;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  zipCode?: string | null;
  city: string;
  state: string;
  country?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ClientContact = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "LEFT_COMPANY";
  role?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ClientGenerator = {
  id: string;
  name: string;
  brand: string;
  power: number;
  serialNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdByUser?: { id: string; name: string; email: string } | null;
};

type ClientProposal = {
  id: string;
  code: string;
  status: string;
  totalValue: number;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string } | null;
};

type ClientContract = {
  id: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string;
  preventiveRecurrence: string;
  createdAt: string;
  createdByUser?: { id: string; name: string; email: string } | null;
};

type ClientAuditLog = {
  id: string;
  action: string;
  details?: string | null;
  createdAt: string;
  actorUser?: { id: string; name: string; email: string; role: string } | null;
};

type ClientProfile = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj: string;
  personType: "INDIVIDUAL" | "LEGAL_ENTITY";
  clientType: "CONTRACT" | "NO_CONTRACT";
  email?: string | null;
  phone: string;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  withholdsInss?: boolean | null;
  withholdsIss?: boolean | null;
  segment?: string | null;
  preferences?: string | null;
  address?: string | null;
  city: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  addresses: ClientAddress[];
  contacts: ClientContact[];
  generators: ClientGenerator[];
  contracts: ClientContract[];
  proposals: ClientProposal[];
  auditLogs?: ClientAuditLog[];
};

function mapAddressType(type: ClientAddress["type"]) {
  if (type === "BILLING") return "Faturamento";
  if (type === "INSTALLATION") return "Instalacao";
  return "Outro";
}

function mapContactStatus(status: ClientContact["status"]) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "INACTIVE") return "Inativo";
  return "Saiu da empresa";
}

function mapPersonType(type: ClientProfile["personType"]) {
  return type === "INDIVIDUAL" ? "Pessoa Fisica" : "Pessoa Juridica";
}

function mapClientType(type: ClientProfile["clientType"]) {
  return type === "CONTRACT" ? "Com contrato" : "Sem contrato";
}

function mapLogAction(action: string) {
  if (action === "CLIENT_CREATED") return "Cliente cadastrado";
  if (action === "CLIENT_UPDATED") return "Cliente atualizado";
  if (action === "GENERATOR_LINKED") return "Maquina vinculada";
  return action;
}

async function getClientProfile(id: string): Promise<ClientProfile | null> {
  try {
    const res = await apiFetch(apiUrl(`/clients/${id}`), { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Erro ao buscar perfil do cliente:", error);
    return null;
  }
}

export default async function ClientProfilePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const client = await getClientProfile(id);

  if (!client) {
    return (
      <div className="p-8">
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-800 mb-2">Cliente nao encontrado</h1>
          <p className="text-zinc-500 mb-6">Verifique se o cliente existe ou se foi removido.</p>
          <Link href="/dashboard/clients" className="inline-flex px-4 py-2 rounded-lg bg-zinc-900 text-white font-semibold">
            Voltar para clientes
          </Link>
        </div>
      </div>
    );
  }

  const addresses = client.addresses ?? [];
  const contacts = client.contacts ?? [];
  const generators = client.generators ?? [];
  const proposals = client.proposals ?? [];
  const contracts = client.contracts ?? [];
  const logItems = (client.auditLogs ?? [])
    .map((log) => ({
      id: log.id,
      date: log.createdAt,
      title: mapLogAction(log.action),
      details: log.details || "Sem detalhes.",
      actor: log.actorUser?.name || "Usuario nao identificado",
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard/clients" className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50">
              ←
            </Link>
            <h1 className="text-3xl font-bold text-zinc-800">Perfil do Cliente</h1>
          </div>
          <p className="text-zinc-500">Visao completa cadastral, operacional e comercial.</p>
        </div>
      </div>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Acoes rapidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/clients/new?editClientId=${client.id}`}
            className="inline-flex px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 transition-colors"
          >
            Editar cadastro
          </Link>
          <Link
            href={`/dashboard/proposals/new?clientId=${client.id}`}
            className="inline-flex px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors"
          >
            Gerar proposta
          </Link>
          <Link
            href={`/dashboard/equipments/new?clientId=${client.id}`}
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors"
          >
            Cadastrar nova maquina
          </Link>
          <Link
            href="/dashboard/orders"
            className="inline-flex px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 transition-colors"
          >
            Ver O.S.
          </Link>
        </div>
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Dados gerais</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Info label="Razao social / Nome" value={client.companyName} />
          <Info label="Nome fantasia" value={client.tradeName || "-"} />
          <Info label="Documento" value={client.cnpj} />
          <Info label="Tipo de pessoa" value={mapPersonType(client.personType)} />
          <Info label="Tipo de cliente" value={mapClientType(client.clientType)} />
          <Info label="Ramo" value={client.segment || "-"} />
          <Info label="E-mail" value={client.email || "-"} />
          <Info label="Telefone" value={client.phone || "-"} />
          <Info label="Inscricao Estadual" value={client.stateRegistration || "-"} />
          <Info label="Inscricao Municipal" value={client.municipalRegistration || "-"} />
          <Info label="Retem INSS" value={client.withholdsInss ? "Sim" : "Nao"} />
          <Info label="Retem ISS" value={client.withholdsIss ? "Sim" : "Nao"} />
          <Info label="Endereco principal" value={client.address ? `${client.address} - ${client.city}/${client.state}` : `${client.city}/${client.state}`} />
          <Info label="Cadastrado em" value={new Date(client.createdAt).toLocaleString("pt-BR")} />
        </div>
        <div className="mt-4 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Preferencias</p>
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{client.preferences || "Sem preferencias registradas."}</p>
        </div>
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Enderecos</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum endereco cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div key={addr.id} className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50">
                <p className="text-xs font-bold text-emerald-700 uppercase mb-2">{mapAddressType(addr.type)}</p>
                <p className="text-sm text-zinc-800 font-semibold">{addr.street}{addr.number ? `, ${addr.number}` : ""}</p>
                <p className="text-sm text-zinc-600">{addr.complement || ""}</p>
                <p className="text-sm text-zinc-600">{addr.district || ""}</p>
                <p className="text-sm text-zinc-600">{addr.city}/{addr.state} {addr.zipCode ? `- ${addr.zipCode}` : ""}</p>
                <p className="text-xs text-zinc-500 mt-1">{addr.country || "BR"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Contatos</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum contato cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-2">Nome</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Cargo</th>
                  <th className="py-2">Telefone</th>
                  <th className="py-2">Celular</th>
                  <th className="py-2">E-mail</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-zinc-100">
                    <td className="py-2 font-medium text-zinc-800">{contact.name}</td>
                    <td className="py-2">{mapContactStatus(contact.status)}</td>
                    <td className="py-2">{contact.role || "-"}</td>
                    <td className="py-2">{contact.phone || "-"}</td>
                    <td className="py-2">{contact.mobile || "-"}</td>
                    <td className="py-2">{contact.email || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Maquinas vinculadas</h2>
        {generators.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma maquina vinculada.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {generators.map((gen) => (
              <Link key={gen.id} href={`/dashboard/equipments/${gen.id}`} className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50 hover:bg-zinc-100 transition-colors">
                <p className="font-semibold text-zinc-800">{gen.name}</p>
                <p className="text-sm text-zinc-600">Marca: {gen.brand}</p>
                <p className="text-sm text-zinc-600">Potencia: {gen.power} kVA</p>
                <p className="text-sm text-zinc-600">Serie: {gen.serialNumber || "-"}</p>
                <p className="text-sm text-zinc-600">
                  Cadastrada por: {gen.createdByUser?.name || "Nao identificado"}
                </p>
                <p className="mt-2 text-xs font-semibold text-blue-700">Abrir dados gerais do equipamento</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Contratos</h2>
        {contracts.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum contrato vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-2">Numero</th>
                  <th className="py-2">Inicio</th>
                  <th className="py-2">Fim</th>
                  <th className="py-2">Periodicidade</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-b border-zinc-100">
                    <td className="py-2 font-semibold text-zinc-800">{contract.code}</td>
                    <td className="py-2">{new Date(contract.startDate).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2">{new Date(contract.endDate).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2">{contract.preventiveRecurrence}</td>
                    <td className="py-2">{contract.status}</td>
                    <td className="py-2">
                      <Link href={`/dashboard/contracts/${contract.id}`} className="font-semibold text-blue-700 hover:underline">
                        Ver contrato
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Propostas</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma proposta cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-2">Codigo</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="border-b border-zinc-100">
                    <td className="py-2 font-medium text-zinc-800">
                      <Link href={`/dashboard/proposals/${proposal.id}`} className="hover:underline text-blue-700">
                        {proposal.code}
                      </Link>
                    </td>
                    <td className="py-2">{proposal.status}</td>
                    <td className="py-2">R$ {Number(proposal.totalValue || 0).toFixed(2)}</td>
                    <td className="py-2">{new Date(proposal.createdAt).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4 border-b border-zinc-100 pb-2">Logs</h2>
        {logItems.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem registros de log.</p>
        ) : (
          <div className="space-y-3">
            {logItems.map((item, index) => (
              <div key={item.id || `${item.title}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-semibold text-zinc-800">{item.title}</p>
                <p className="text-xs text-zinc-500">{new Date(item.date).toLocaleString("pt-BR")}</p>
                <p className="mt-1 text-sm text-zinc-700">{item.details}</p>
                <p className="mt-1 text-xs text-zinc-500">Por: {item.actor}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
      <p className="text-xs font-bold text-zinc-500 uppercase mb-1">{label}</p>
      <p className="text-sm font-medium text-zinc-800 break-words">{value}</p>
    </div>
  );
}
