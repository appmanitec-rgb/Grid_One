"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  loadControlOptions,
  optionLabel,
  type ControlOption,
} from "@/lib/control-options";

type ContactStatus = "ACTIVE" | "INACTIVE" | "LEFT_COMPANY";
type PersonType = "INDIVIDUAL" | "LEGAL_ENTITY";

type AddressForm = {
  street: string;
  number: string;
  complement: string;
  district: string;
  zipCode: string;
  city: string;
  state: string;
  country: string;
};

type ContactForm = {
  name: string;
  status: ContactStatus;
  role: string;
  phone: string;
  mobile: string;
  email: string;
};

type MachineForm = {
  name: string;
  brand: string;
  model: string;
  power: string;
  serialNumber: string;
};

type ApiAddress = {
  type: "BILLING" | "INSTALLATION" | "OTHER";
  street: string;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  zipCode?: string | null;
  city: string;
  state: string;
  country?: string | null;
};

type ApiContact = {
  name: string;
  status: ContactStatus;
  role?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

type ApiClient = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj: string;
  clientType?: "CONTRACT" | "NO_CONTRACT";
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  segment?: string | null;
  preferences?: string | null;
  paymentTermDefault?: string | null;
  priceTableCode?: string | null;
  creditLimit?: number | null;
  isDelinquent?: boolean | null;
  proposalCreationBlocked?: boolean | null;
  proposalBlockReason?: string | null;
  blockedPaymentTerms?: string[];
  withholdsInss?: boolean | null;
  withholdsIss?: boolean | null;
  addresses?: ApiAddress[];
  contacts?: ApiContact[];
  generators?: Array<{ id: string }>;
};

type ExistingGeneratorOption = {
  id: string;
  name?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  brand?: string | null;
  power?: number | null;
  clientId?: string | null;
  client?: { id: string; companyName?: string | null } | null;
};

const emptyAddress: AddressForm = {
  street: "",
  number: "",
  complement: "",
  district: "",
  zipCode: "",
  city: "",
  state: "",
  country: "BR",
};

const emptyContact: ContactForm = {
  name: "",
  status: "ACTIVE",
  role: "",
  phone: "",
  mobile: "",
  email: "",
};

const emptyMachine: MachineForm = {
  name: "",
  brand: "",
  model: "",
  power: "",
  serialNumber: "",
};

const FABRICANTES = {
  Cummins: ["C150D6", "C300D6", "C500D6", "C1000D6", "Outro"],
  MWM: ["Actemium 150", "TWD 1643GE", "Outro"],
  Stemac: ["150kVA", "300kVA", "500kVA", "Outro"],
  Caterpillar: ["C9", "C15", "C32", "Outro"],
  "Atlas Copco": ["QAS 150", "QAS 500", "Outro"],
  Outro: ["Nao Especificado"],
} as const;

function inferPersonType(documentValue: string): PersonType {
  const digits = documentValue.replace(/\D/g, "");
  return digits.length <= 11 ? "INDIVIDUAL" : "LEGAL_ENTITY";
}

export default function NewClientPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    companyName: "",
    tradeName: "",
    document: "",
    stateRegistration: "",
    municipalRegistration: "",
    clientType: "NO_CONTRACT",
    segment: "",
    preferences: "",
    paymentTermDefault: "",
    priceTableCode: "",
    creditLimit: "",
    isDelinquent: false,
    proposalCreationBlocked: false,
    proposalBlockReason: "",
    blockedPaymentTerms: [] as string[],
    withholdsInss: false,
    withholdsIss: false,
    accountingNotes: "",
  });

  const [billingAddress, setBillingAddress] =
    useState<AddressForm>(emptyAddress);
  const [installationAddress, setInstallationAddress] =
    useState<AddressForm>(emptyAddress);
  const [contacts, setContacts] = useState<ContactForm[]>([
    { ...emptyContact },
  ]);
  const [machines, setMachines] = useState<MachineForm[]>([]);
  const [existingGenerators, setExistingGenerators] = useState<
    ExistingGeneratorOption[]
  >([]);
  const [selectedExistingGeneratorIds, setSelectedExistingGeneratorIds] =
    useState<string[]>([]);
  const [generatorSearch, setGeneratorSearch] = useState("");
  const [blockedPaymentTermSearch, setBlockedPaymentTermSearch] = useState("");
  const [controlOptions, setControlOptions] = useState({
    states: [] as ControlOption[],
    paymentTerms: [] as ControlOption[],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingClient, setIsLoadingClient] = useState(false);
  const [error, setError] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const isEditing = Boolean(editClientId);

  const personType = inferPersonType(formData.document);
  const personTypeLabel =
    personType === "INDIVIDUAL"
      ? "Pessoa Fisica (CPF)"
      : "Pessoa Juridica (CNPJ)";

  const updateContact = (
    index: number,
    field: keyof ContactForm,
    value: string,
  ) => {
    setContacts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addContact = () =>
    setContacts((prev) => [...prev, { ...emptyContact }]);
  const removeContact = (index: number) =>
    setContacts((prev) => prev.filter((_, i) => i !== index));

  const updateMachine = (
    index: number,
    field: keyof MachineForm,
    value: string,
  ) => {
    setMachines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addMachine = () =>
    setMachines((prev) => [...prev, { ...emptyMachine }]);
  const removeMachine = (index: number) =>
    setMachines((prev) => prev.filter((_, i) => i !== index));

  const toggleExistingGenerator = (generatorId: string, checked: boolean) => {
    setSelectedExistingGeneratorIds((prev) => {
      if (checked) return [...new Set([...prev, generatorId])];
      return prev.filter((id) => id !== generatorId);
    });
  };

  const searchTerm = generatorSearch.trim().toLowerCase();

  const visibleGenerators = existingGenerators.filter((generator) => {
    if (searchTerm.length < 2) return false;
    return [
      generator.name,
      generator.serialNumber,
      generator.assetTag,
      generator.brand,
      generator.client?.companyName,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(searchTerm),
    );
  });

  const copyBillingToInstallation = () => {
    setInstallationAddress({ ...billingAddress });
  };

  useEffect(() => {
    void (async () => {
      try {
        const [res, options] = await Promise.all([
          apiFetch("/generators", { cache: "no-store" }),
          loadControlOptions(["BRAZIL_STATE", "PAYMENT_TERM"]),
        ]);
        if (res.ok) {
          setExistingGenerators(
            (await res.json()) as ExistingGeneratorOption[],
          );
        }
        setControlOptions({
          states: options.BRAZIL_STATE || [],
          paymentTerms: options.PAYMENT_TERM || [],
        });
      } catch {
        setExistingGenerators([]);
        setControlOptions({ states: [], paymentTerms: [] });
      }
    })();
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("editClientId");
    if (!id) return;

    setEditClientId(id);
    setIsLoadingClient(true);

    (async () => {
      try {
        const res = await apiFetch(`/clients/${id}`, { cache: "no-store" });
        if (!res.ok) {
          setError(
            "Nao foi possivel carregar os dados do cliente para edicao.",
          );
          return;
        }

        const client: ApiClient = await res.json();

        setFormData({
          companyName: client.companyName ?? "",
          tradeName: client.tradeName ?? "",
          document: client.cnpj ?? "",
          stateRegistration: client.stateRegistration ?? "",
          municipalRegistration: client.municipalRegistration ?? "",
          clientType: client.clientType ?? "NO_CONTRACT",
          segment: client.segment ?? "",
          preferences: client.preferences ?? "",
          paymentTermDefault: client.paymentTermDefault ?? "",
          priceTableCode: client.priceTableCode ?? "",
          creditLimit:
            client.creditLimit != null ? String(client.creditLimit) : "",
          isDelinquent: Boolean(client.isDelinquent),
          proposalCreationBlocked: Boolean(client.proposalCreationBlocked),
          proposalBlockReason: client.proposalBlockReason ?? "",
          blockedPaymentTerms: client.blockedPaymentTerms ?? [],
          withholdsInss: Boolean(client.withholdsInss),
          withholdsIss: Boolean(client.withholdsIss),
          accountingNotes: "",
        });

        const billing = client.addresses?.find(
          (addr) => addr.type === "BILLING",
        );
        const installation = client.addresses?.find(
          (addr) => addr.type === "INSTALLATION",
        );

        setBillingAddress({
          street: billing?.street ?? "",
          number: billing?.number ?? "",
          complement: billing?.complement ?? "",
          district: billing?.district ?? "",
          zipCode: billing?.zipCode ?? "",
          city: billing?.city ?? "",
          state: billing?.state ?? "",
          country: billing?.country ?? "BR",
        });

        setInstallationAddress({
          street: installation?.street ?? billing?.street ?? "",
          number: installation?.number ?? billing?.number ?? "",
          complement: installation?.complement ?? billing?.complement ?? "",
          district: installation?.district ?? billing?.district ?? "",
          zipCode: installation?.zipCode ?? billing?.zipCode ?? "",
          city: installation?.city ?? billing?.city ?? "",
          state: installation?.state ?? billing?.state ?? "",
          country: installation?.country ?? billing?.country ?? "BR",
        });

        const apiContacts = (client.contacts ?? []).map((contact) => ({
          name: contact.name ?? "",
          status: contact.status ?? "ACTIVE",
          role: contact.role ?? "",
          phone: contact.phone ?? "",
          mobile: contact.mobile ?? "",
          email: contact.email ?? "",
        }));
        setContacts(
          apiContacts.length > 0 ? apiContacts : [{ ...emptyContact }],
        );
        setMachines([]);
        setSelectedExistingGeneratorIds(
          (client.generators ?? []).map((generator) => generator.id),
        );
      } catch {
        setError("Erro ao carregar o cliente para edicao.");
      } finally {
        setIsLoadingClient(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validContacts = contacts.filter(
      (c) =>
        c.name.trim() && (c.mobile.trim() || c.phone.trim() || c.email.trim()),
    );

    if (
      !billingAddress.street ||
      !billingAddress.city ||
      !billingAddress.state
    ) {
      setError("Preencha o endereco de cobranca com rua, cidade e UF.");
      return;
    }

    if (
      !installationAddress.street ||
      !installationAddress.city ||
      !installationAddress.state
    ) {
      setError("Preencha o endereco de instalacao com rua, cidade e UF.");
      return;
    }

    if (validContacts.length === 0) {
      setError(
        "Cadastre pelo menos um contato valido (nome + telefone/celular/email).",
      );
      return;
    }

    const incompleteMachineIndex = machines.findIndex(
      (machine) =>
        !machine.name.trim() ||
        !machine.brand.trim() ||
        !Number.isFinite(Number(machine.power)) ||
        Number(machine.power) <= 0,
    );
    if (incompleteMachineIndex >= 0) {
      setError(
        `Complete nome, marca e potencia da maquina ${incompleteMachineIndex + 1}.`,
      );
      return;
    }

    const validMachines = machines;

    setIsLoading(true);

    const primaryContact =
      validContacts.find((c) => c.status === "ACTIVE") ?? validContacts[0];
    const normalizedDocument = formData.document.replace(/\D/g, "");

    const normalizedContacts = validContacts.map((contact) => ({
      name: contact.name.trim(),
      status: contact.status,
      role: contact.role.trim() || undefined,
      phone: contact.phone.trim() || undefined,
      mobile: contact.mobile.trim() || undefined,
      email: contact.email.trim() || undefined,
    }));

    const mergedPreferences = [
      formData.preferences.trim(),
      formData.accountingNotes.trim()
        ? `Observacoes financeiras: ${formData.accountingNotes.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const clientPayload = {
      companyName: formData.companyName,
      tradeName: formData.tradeName || undefined,
      cnpj: normalizedDocument,
      personType,
      stateRegistration: formData.stateRegistration || undefined,
      municipalRegistration: formData.municipalRegistration || undefined,
      clientType: formData.clientType,
      segment: formData.segment || undefined,
      preferences: mergedPreferences || undefined,
      paymentTermDefault: formData.paymentTermDefault || undefined,
      priceTableCode: formData.priceTableCode || undefined,
      creditLimit: formData.creditLimit
        ? Number(formData.creditLimit)
        : undefined,
      isDelinquent: formData.isDelinquent,
      proposalCreationBlocked: formData.proposalCreationBlocked,
      proposalBlockReason: formData.proposalCreationBlocked
        ? formData.proposalBlockReason.trim() || undefined
        : undefined,
      blockedPaymentTerms: formData.blockedPaymentTerms,
      withholdsInss: formData.withholdsInss,
      withholdsIss: formData.withholdsIss,
      email: primaryContact.email?.trim() || undefined,
      phone:
        primaryContact.mobile?.trim() || primaryContact.phone?.trim() || "-",
      address: `${installationAddress.street}${installationAddress.number ? `, ${installationAddress.number}` : ""}`,
      city: installationAddress.city,
      state: installationAddress.state.toUpperCase(),
      addresses: [
        {
          type: "BILLING",
          ...billingAddress,
          state: billingAddress.state.toUpperCase(),
        },
        {
          type: "INSTALLATION",
          ...installationAddress,
          state: installationAddress.state.toUpperCase(),
        },
      ],
      contacts: normalizedContacts,
      generatorIds: selectedExistingGeneratorIds,
      newGenerators: !isEditing
        ? validMachines.map((machine) => ({
            name: machine.name.trim(),
            brand: machine.brand.trim(),
            model: machine.model.trim() || undefined,
            power: Number(machine.power),
            serialNumber: machine.serialNumber.trim() || undefined,
          }))
        : undefined,
    };

    try {
      const clientUrl = isEditing
        ? `/clients/${editClientId}`
        : validMachines.length > 0
          ? "/clients/onboarding"
          : "/clients";

      const clientRes = await apiFetch(clientUrl, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clientPayload),
      });

      if (!clientRes.ok) {
        setError(
          await readApiErrorMessage(clientRes, "Erro ao registar o cliente."),
        );
        return;
      }

      const savedClient = await clientRes.json();

      router.push(`/dashboard/clients/${savedClient.id}`);
    } catch {
      setError("Erro de ligacao com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto mb-20">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard/clients"
          className="w-10 h-10 flex items-center justify-center bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-500 shadow-sm"
        >
          ←
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">
            {isEditing ? "Editar Cliente" : "Novo Cliente Completo"}
          </h1>
          <p className="text-zinc-500 mt-1">
            Pessoa fisica/juridica, dois enderecos, contatos e multiplas
            maquinas.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 font-medium">
          {error}
        </div>
      )}
      {isLoadingClient && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-6 font-medium">
          Carregando dados do cliente...
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden"
      >
        <div className="p-6 md:p-8 space-y-8">
          <section>
            <h2 className="text-lg font-bold text-zinc-800 border-b border-zinc-100 pb-2 mb-4">
              1. Dados da Empresa/Pessoa
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Razao Social / Nome *
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  value={formData.tradeName}
                  onChange={(e) =>
                    setFormData({ ...formData, tradeName: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  CPF/CNPJ *
                </label>
                <input
                  type="text"
                  required
                  value={formData.document}
                  onChange={(e) =>
                    setFormData({ ...formData, document: e.target.value })
                  }
                  placeholder="Somente numeros ou com mascara"
                  className="w-full border border-zinc-300 rounded-lg p-3 font-mono bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Tipo de Pessoa (automatico)
                </label>
                <input
                  type="text"
                  readOnly
                  value={personTypeLabel}
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-100 text-zinc-700 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Tipo do Cliente *
                </label>
                <select
                  value={formData.clientType}
                  onChange={(e) =>
                    setFormData({ ...formData, clientType: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="NO_CONTRACT">Sem Contrato</option>
                  <option value="CONTRACT">Com Contrato</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Inscricao Estadual
                </label>
                <input
                  type="text"
                  value={formData.stateRegistration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      stateRegistration: e.target.value,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Inscricao Municipal
                </label>
                <input
                  type="text"
                  value={formData.municipalRegistration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      municipalRegistration: e.target.value,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Ramo
                </label>
                <input
                  type="text"
                  value={formData.segment}
                  onChange={(e) =>
                    setFormData({ ...formData, segment: e.target.value })
                  }
                  placeholder="Ex: Residencial, Industrial"
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Preferencias do Cliente
                </label>
                <textarea
                  value={formData.preferences}
                  onChange={(e) =>
                    setFormData({ ...formData, preferences: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Condicao de Pagamento
                </label>
                <input
                  type="text"
                  value={formData.paymentTermDefault}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paymentTermDefault: e.target.value,
                    })
                  }
                  list="client-payment-term-options"
                  placeholder="Ex: 28 dias, 30/60"
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <datalist id="client-payment-term-options">
                  {controlOptions.paymentTerms.map((option) => (
                    <option
                      key={option.id}
                      value={option.name}
                      label={optionLabel(option)}
                    />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Tabela de Preco
                </label>
                <input
                  type="text"
                  value={formData.priceTableCode}
                  onChange={(e) =>
                    setFormData({ ...formData, priceTableCode: e.target.value })
                  }
                  placeholder="Ex: PADRAO, VIP"
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Limite de Credito
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.creditLimit}
                  onChange={(e) =>
                    setFormData({ ...formData, creditLimit: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Retem INSS?
                </label>
                <select
                  value={formData.withholdsInss ? "YES" : "NO"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      withholdsInss: e.target.value === "YES",
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="NO">Nao</option>
                  <option value="YES">Sim</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Retem ISS?
                </label>
                <select
                  value={formData.withholdsIss ? "YES" : "NO"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      withholdsIss: e.target.value === "YES",
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="NO">Nao</option>
                  <option value="YES">Sim</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-zinc-700 mb-1">
                  Observacoes Financeiras
                </label>
                <textarea
                  value={formData.accountingNotes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      accountingNotes: e.target.value,
                    })
                  }
                  rows={2}
                  placeholder="Retem INSS? ISS? condicoes especiais de pagamento, etc."
                  className="w-full border border-zinc-300 rounded-lg p-3 bg-zinc-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-1 flex items-end">
                <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={formData.isDelinquent}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isDelinquent: e.target.checked,
                      })
                    }
                  />
                  Cliente inadimplente
                </label>
              </div>

              <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                <label className="flex items-center gap-3 text-sm font-bold text-rose-900">
                  <input
                    type="checkbox"
                    checked={formData.proposalCreationBlocked}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        proposalCreationBlocked: event.target.checked,
                        proposalBlockReason: event.target.checked
                          ? formData.proposalBlockReason
                          : "",
                      })
                    }
                  />
                  Bloquear novas propostas para este cliente
                </label>
                <textarea
                  value={formData.proposalBlockReason}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      proposalBlockReason: event.target.value,
                    })
                  }
                  disabled={!formData.proposalCreationBlocked}
                  rows={2}
                  placeholder="Motivo que sera exibido ao comercial"
                  className="mt-3 w-full rounded-lg border border-rose-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-rose-300 disabled:bg-zinc-100"
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-bold text-zinc-800">
                  Condicoes de pagamento bloqueadas para este cliente
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Estas condicoes permanecem indisponiveis mesmo depois que o
                  cliente tiver historico comercial.
                </p>
                <input
                  type="search"
                  value={blockedPaymentTermSearch}
                  onChange={(event) =>
                    setBlockedPaymentTermSearch(event.target.value)
                  }
                  placeholder="Pesquisar condicao de pagamento"
                  className="mt-3 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                  {controlOptions.paymentTerms
                    .filter((option) => {
                      const term = blockedPaymentTermSearch
                        .trim()
                        .toLowerCase();
                      return (
                        !term ||
                        option.name.toLowerCase().includes(term) ||
                        option.code.toLowerCase().includes(term)
                      );
                    })
                    .map((option) => {
                      const checked = formData.blockedPaymentTerms.includes(
                        option.name,
                      );
                      return (
                        <label
                          key={option.id}
                          className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setFormData({
                                ...formData,
                                blockedPaymentTerms: event.target.checked
                                  ? [
                                      ...formData.blockedPaymentTerms,
                                      option.name,
                                    ]
                                  : formData.blockedPaymentTerms.filter(
                                      (term) => term !== option.name,
                                    ),
                              })
                            }
                          />
                          <span>
                            <span className="block font-semibold">
                              {option.name}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {option.code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-800 border-b border-zinc-100 pb-2 mb-4">
              2. Endereco de Faturamento
            </h2>
            <AddressFields
              value={billingAddress}
              onChange={setBillingAddress}
              stateOptions={controlOptions.states}
              listId="billing-state-options"
            />
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-4">
              <h2 className="text-lg font-bold text-zinc-800">
                3. Endereco de Instalacao
              </h2>
              <button
                type="button"
                onClick={copyBillingToInstallation}
                className="text-sm font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-2 rounded-lg"
              >
                Copiar endereco de faturamento
              </button>
            </div>
            <AddressFields
              value={installationAddress}
              onChange={setInstallationAddress}
              stateOptions={controlOptions.states}
              listId="installation-state-options"
            />
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-4">
              <h2 className="text-lg font-bold text-zinc-800">
                4. Contatos do Cliente
              </h2>
              <button
                type="button"
                onClick={addContact}
                className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold px-3 py-2 rounded-lg"
              >
                + Novo Contato
              </button>
            </div>

            <div className="space-y-4">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-zinc-700">
                      Contato {index + 1}
                    </h3>
                    {contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="text-red-500 text-sm font-semibold"
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Nome *"
                      value={contact.name}
                      onChange={(e) =>
                        updateContact(index, "name", e.target.value)
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    />
                    <select
                      value={contact.status}
                      onChange={(e) =>
                        updateContact(
                          index,
                          "status",
                          e.target.value as ContactStatus,
                        )
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    >
                      <option value="ACTIVE">Ativo</option>
                      <option value="INACTIVE">Inativo</option>
                      <option value="LEFT_COMPANY">Saiu da empresa</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Cargo"
                      value={contact.role}
                      onChange={(e) =>
                        updateContact(index, "role", e.target.value)
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Telefone"
                      value={contact.phone}
                      onChange={(e) =>
                        updateContact(index, "phone", e.target.value)
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Celular"
                      value={contact.mobile}
                      onChange={(e) =>
                        updateContact(index, "mobile", e.target.value)
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={contact.email}
                      onChange={(e) =>
                        updateContact(index, "email", e.target.value)
                      }
                      className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-4">
              <h2 className="text-lg font-bold text-zinc-800">
                5. Vincular Maquinas Existentes
              </h2>
            </div>

            <input
              value={generatorSearch}
              onChange={(event) => setGeneratorSearch(event.target.value)}
              placeholder="Buscar por nome, serie, tag, marca..."
              className="mb-3 w-full rounded-lg border border-zinc-300 p-2.5 bg-zinc-50 focus:bg-white"
            />

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">
              {visibleGenerators.map((generator) => {
                const isFromAnotherClient =
                  Boolean(generator.clientId) &&
                  generator.clientId !== editClientId &&
                  !selectedExistingGeneratorIds.includes(generator.id);

                return (
                  <label
                    key={generator.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
                      isFromAnotherClient
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-800">
                        {generator.name || "Equipamento"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Serie: {generator.serialNumber || "-"} | Tag:{" "}
                        {generator.assetTag || "-"} | Marca:{" "}
                        {generator.brand || "-"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Cliente atual:{" "}
                        {generator.client?.companyName || "Nao vinculado"}
                      </p>
                      {isFromAnotherClient ? (
                        <p className="mt-1 text-xs font-semibold text-red-700">
                          Ja vinculada a outro cliente. Nao pode ser
                          selecionada.
                        </p>
                      ) : null}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedExistingGeneratorIds.includes(
                        generator.id,
                      )}
                      disabled={isFromAnotherClient}
                      onChange={(event) =>
                        toggleExistingGenerator(
                          generator.id,
                          event.target.checked,
                        )
                      }
                    />
                  </label>
                );
              })}
              {visibleGenerators.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {searchTerm.length < 2
                    ? "Digite ao menos 2 caracteres para buscar maquinas."
                    : "Nenhuma maquina encontrada."}
                </p>
              ) : null}
            </div>
          </section>

          {!isEditing && (
            <section>
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-4">
                <h2 className="text-lg font-bold text-zinc-800">
                  6. Cadastrar Novas Maquinas (opcional)
                </h2>
                <button
                  type="button"
                  onClick={addMachine}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-2 rounded-lg"
                >
                  + Cadastrar Maquina
                </button>
              </div>

              {machines.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Sem maquinas adicionadas. Se quiser, pode cadastrar depois no
                  modulo Equipamentos.
                </p>
              )}

              <div className="space-y-4">
                {machines.map((machine, index) => (
                  <div
                    key={index}
                    className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-zinc-700">
                        Maquina {index + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={() => removeMachine(index)}
                        className="text-red-500 text-sm font-semibold"
                      >
                        Remover
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="Nome da maquina *"
                        value={machine.name}
                        onChange={(e) =>
                          updateMachine(index, "name", e.target.value)
                        }
                        className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                      />
                      <select
                        value={machine.brand}
                        onChange={(e) => {
                          updateMachine(index, "brand", e.target.value);
                          updateMachine(index, "model", "");
                        }}
                        className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                      >
                        <option value="">Marca *</option>
                        {Object.keys(FABRICANTES).map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </select>
                      <select
                        value={machine.model}
                        onChange={(e) =>
                          updateMachine(index, "model", e.target.value)
                        }
                        disabled={!machine.brand}
                        className="border border-zinc-300 rounded-lg p-2.5 bg-white disabled:bg-zinc-100"
                      >
                        <option value="">Modelo (opcional)</option>
                        {(machine.brand
                          ? (FABRICANTES[
                              machine.brand as keyof typeof FABRICANTES
                            ] ?? [])
                          : []
                        ).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Potencia (kVA) *"
                        value={machine.power}
                        onChange={(e) =>
                          updateMachine(index, "power", e.target.value)
                        }
                        className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Numero de serie"
                        value={machine.serialNumber}
                        onChange={(e) =>
                          updateMachine(index, "serialNumber", e.target.value)
                        }
                        className="border border-zinc-300 rounded-lg p-2.5 bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="bg-zinc-50 px-6 py-4 border-t border-zinc-200 flex justify-end">
          <button
            type="submit"
            disabled={
              isLoading ||
              isLoadingClient ||
              !formData.companyName ||
              !formData.document
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-lg shadow-sm disabled:opacity-50"
          >
            {isLoading
              ? "Salvando..."
              : isEditing
                ? "Salvar Alteracoes"
                : "Salvar Cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddressFields({
  value,
  onChange,
  stateOptions,
  listId,
}: {
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  stateOptions: ControlOption[];
  listId: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
      <input
        type="text"
        placeholder="Rua *"
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
        className="md:col-span-3 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="Numero"
        value={value.number}
        onChange={(e) => onChange({ ...value, number: e.target.value })}
        className="border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="Complemento"
        value={value.complement}
        onChange={(e) => onChange({ ...value, complement: e.target.value })}
        className="md:col-span-2 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="Bairro"
        value={value.district}
        onChange={(e) => onChange({ ...value, district: e.target.value })}
        className="md:col-span-2 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="CEP"
        value={value.zipCode}
        onChange={(e) => onChange({ ...value, zipCode: e.target.value })}
        className="border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="Cidade *"
        value={value.city}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
        className="md:col-span-2 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
      <input
        type="text"
        placeholder="UF *"
        maxLength={2}
        value={value.state}
        list={listId}
        onChange={(e) =>
          onChange({
            ...value,
            state: e.target.value.toUpperCase().slice(0, 2),
          })
        }
        className="border border-zinc-300 rounded-lg p-2.5 bg-zinc-50 uppercase"
      />
      <datalist id={listId}>
        {stateOptions.map((option) => (
          <option key={option.id} value={option.code} label={option.name} />
        ))}
      </datalist>
      <input
        type="text"
        placeholder="Pais"
        value={value.country}
        onChange={(e) => onChange({ ...value, country: e.target.value })}
        className="border border-zinc-300 rounded-lg p-2.5 bg-zinc-50"
      />
    </div>
  );
}
