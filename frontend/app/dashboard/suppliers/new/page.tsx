"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import {
  DataPill,
  EmptyState,
  FormField,
  InlineMessage,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

type CatalogItem = { id: string; name: string; sku?: string | null };

type SupplierItemForm = {
  catalogItemId: string;
  supplierSku: string;
  supplierPrice: string;
  leadTimeDays: string;
  isPrimary: boolean;
};

export default function SupplierFormPage() {
  const router = useRouter();
  const [editSupplierId, setEditSupplierId] = useState("");
  const isEditing = Boolean(editSupplierId);

  const [loading, setLoading] = useState(false);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [error, setError] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);

  const [formData, setFormData] = useState({
    companyName: "",
    tradeName: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    stateRegistration: "",
    municipalRegistration: "",
    categories: "",
    representedBrands: "",
    paymentTerm: "",
    qualityScore: "",
    punctualityScore: "",
    notes: "",
  });

  const [items, setItems] = useState<SupplierItemForm[]>([]);

  useEffect(() => {
    void loadCatalogItems();
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("editSupplierId");
    if (id) setEditSupplierId(id);
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    void loadSupplier(editSupplierId);
  }, [editSupplierId, isEditing]);

  const selectedCatalogIds = useMemo(
    () => new Set(items.map((item) => item.catalogItemId)),
    [items],
  );

  async function loadCatalogItems() {
    const token = localStorage.getItem("manitec_token");
    if (!token) return;

    try {
      const res = await apiFetch(apiUrl("/catalogs"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Array<{
        id: string;
        name: string;
        sku?: string | null;
      }>;
      setCatalogItems((data || []).map((item) => ({ id: item.id, name: item.name, sku: item.sku })));
    } catch {
      setCatalogItems([]);
    }
  }

  async function loadSupplier(id: string) {
    const token = localStorage.getItem("manitec_token");
    if (!token) return;

    setLoadingSupplier(true);
    try {
      const res = await apiFetch(apiUrl(`/suppliers/${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Nao foi possivel carregar fornecedor para edicao.");
      const data = await res.json();

      setFormData({
        companyName: data.companyName || "",
        tradeName: data.tradeName || "",
        cnpj: data.cnpj || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        stateRegistration: data.stateRegistration || "",
        municipalRegistration: data.municipalRegistration || "",
        categories: (data.categories || []).join(", "),
        representedBrands: (data.representedBrands || []).join(", "),
        paymentTerm: data.paymentTerm || "",
        qualityScore: data.qualityScore != null ? String(data.qualityScore) : "",
        punctualityScore:
          data.punctualityScore != null ? String(data.punctualityScore) : "",
        notes: data.notes || "",
      });

      setItems(
        (data.items || []).map((item: any) => ({
          catalogItemId: item.catalogItemId,
          supplierSku: item.supplierSku || "",
          supplierPrice:
            item.supplierPrice != null ? String(item.supplierPrice) : "",
          leadTimeDays:
            item.leadTimeDays != null ? String(item.leadTimeDays) : "",
          isPrimary: Boolean(item.isPrimary),
        })),
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar fornecedor.",
      );
    } finally {
      setLoadingSupplier(false);
    }
  }

  function onChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  }

  function addItem() {
    const available = catalogItems.find((catalog) => !selectedCatalogIds.has(catalog.id));
    if (!available) return;
    setItems((prev) => [
      ...prev,
      {
        catalogItemId: available.id,
        supplierSku: "",
        supplierPrice: "",
        leadTimeDays: "",
        isPrimary: false,
      },
    ]);
  }

  function updateItem(index: number, patch: Partial<SupplierItemForm>) {
    setItems((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const token = localStorage.getItem("manitec_token");
    if (!token) {
      setError("Sessao invalida. Faca login novamente.");
      setLoading(false);
      return;
    }

    const payload = {
      companyName: formData.companyName,
      tradeName: formData.tradeName || undefined,
      cnpj: formData.cnpj || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      stateRegistration: formData.stateRegistration || undefined,
      municipalRegistration: formData.municipalRegistration || undefined,
      categories: splitTags(formData.categories),
      representedBrands: splitTags(formData.representedBrands),
      paymentTerm: formData.paymentTerm || undefined,
      qualityScore: formData.qualityScore
        ? Number(formData.qualityScore)
        : undefined,
      punctualityScore: formData.punctualityScore
        ? Number(formData.punctualityScore)
        : undefined,
      notes: formData.notes || undefined,
      items: items
        .filter((item) => item.catalogItemId)
        .map((item) => ({
          catalogItemId: item.catalogItemId,
          supplierSku: item.supplierSku || undefined,
          supplierPrice: item.supplierPrice
            ? Number(item.supplierPrice)
            : undefined,
          leadTimeDays: item.leadTimeDays
            ? Number(item.leadTimeDays)
            : undefined,
          isPrimary: item.isPrimary,
        })),
    };

    try {
      const url = isEditing
        ? apiUrl(`/suppliers/${editSupplierId}`)
        : apiUrl("/suppliers");

      const method = isEditing ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        throw new Error(
          Array.isArray(errData?.message)
            ? errData.message.join(", ")
            : errData?.message || "Falha ao salvar fornecedor.",
        );
      }

      router.push("/dashboard/suppliers");
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar fornecedor.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        eyebrow="Rede de suprimentos"
        title={isEditing ? "Editar fornecedor" : "Novo fornecedor"}
        description="Cadastro comercial e operacional do parceiro, com dados fiscais, avaliacao e itens vinculados em uma tela mais organizada e com menos ruido visual."
        stats={[
          {
            label: "Modo",
            value: isEditing ? "Edicao" : "Novo",
            helper: "estado atual do cadastro",
            tone: isEditing ? "amber" : "blue",
          },
          {
            label: "Itens vinculados",
            value: String(items.length),
            helper: "linhas conectadas a este parceiro",
            tone: "slate",
          },
          {
            label: "Catalogo disponivel",
            value: String(catalogItems.length),
            helper: "itens possiveis para associacao",
            tone: "emerald",
          },
        ]}
        actions={
          <Link
            href="/dashboard/suppliers"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voltar para fornecedores
          </Link>
        }
        aside={
          <InlineMessage>
            A ideia aqui e deixar o cadastro mais leve: dados institucionais de um lado,
            inteligencia de compra do outro.
          </InlineMessage>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {loadingSupplier ? (
        <StatusBanner tone="blue">Carregando fornecedor para edicao...</StatusBanner>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Identidade"
            title="Dados cadastrais"
            description="Informacoes principais para identificar e acionar o fornecedor."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Razao social" className="md:col-span-2">
                <TextInput
                  name="companyName"
                  value={formData.companyName}
                  onChange={onChange}
                  required
                  placeholder="Razao social do parceiro"
                />
              </FormField>

              <FormField label="Nome fantasia">
                <TextInput
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={onChange}
                  placeholder="Nome fantasia"
                />
              </FormField>

              <FormField label="CNPJ">
                <TextInput
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={onChange}
                  placeholder="CNPJ"
                />
              </FormField>

              <FormField label="E-mail">
                <TextInput
                  name="email"
                  value={formData.email}
                  onChange={onChange}
                  placeholder="contato@fornecedor.com"
                />
              </FormField>

              <FormField label="Telefone">
                <TextInput
                  name="phone"
                  value={formData.phone}
                  onChange={onChange}
                  placeholder="Telefone principal"
                />
              </FormField>

              <FormField label="Condicao de pagamento" className="md:col-span-2">
                <TextInput
                  name="paymentTerm"
                  value={formData.paymentTerm}
                  onChange={onChange}
                  placeholder="Ex: 28 ddl, 50/50, a vista com desconto"
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Fiscal"
            title="Endereco e registros"
            description="Concentramos dados formais e de localizacao em um unico bloco."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Inscricao estadual">
                <TextInput
                  name="stateRegistration"
                  value={formData.stateRegistration}
                  onChange={onChange}
                  placeholder="Inscricao estadual"
                />
              </FormField>

              <FormField label="Inscricao municipal">
                <TextInput
                  name="municipalRegistration"
                  value={formData.municipalRegistration}
                  onChange={onChange}
                  placeholder="Inscricao municipal"
                />
              </FormField>

              <FormField label="Estado">
                <TextInput
                  name="state"
                  value={formData.state}
                  onChange={onChange}
                  placeholder="UF"
                />
              </FormField>

              <FormField label="Cidade">
                <TextInput
                  name="city"
                  value={formData.city}
                  onChange={onChange}
                  placeholder="Cidade"
                />
              </FormField>

              <FormField label="Endereco" className="md:col-span-2">
                <TextInput
                  name="address"
                  value={formData.address}
                  onChange={onChange}
                  placeholder="Endereco completo"
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Performance"
            title="Atuacao e avaliacao"
            description="Categorias, marcas e notas para orientar decisao de compra."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Categorias" hint="Separadas por virgula">
                <TextInput
                  name="categories"
                  value={formData.categories}
                  onChange={onChange}
                  placeholder="Ex: motores, filtros, servicos"
                />
              </FormField>

              <FormField label="Marcas representadas" hint="Separadas por virgula">
                <TextInput
                  name="representedBrands"
                  value={formData.representedBrands}
                  onChange={onChange}
                  placeholder="Ex: Cummins, Perkins"
                />
              </FormField>

              <FormField label="Nota de qualidade">
                <TextInput
                  name="qualityScore"
                  type="number"
                  min={1}
                  max={5}
                  value={formData.qualityScore}
                  onChange={onChange}
                  placeholder="1 a 5"
                />
              </FormField>

              <FormField label="Pontualidade">
                <TextInput
                  name="punctualityScore"
                  type="number"
                  min={1}
                  max={5}
                  value={formData.punctualityScore}
                  onChange={onChange}
                  placeholder="1 a 5"
                />
              </FormField>

              <FormField label="Observacoes" className="md:col-span-2">
                <TextAreaInput
                  name="notes"
                  value={formData.notes}
                  onChange={onChange}
                  placeholder="Contexto comercial, observacoes fiscais, restricoes ou acordos especiais."
                />
              </FormField>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <SectionCard
            eyebrow="Negociacao"
            title="Itens por fornecedor"
            description="Aqui entram SKU do parceiro, preco, lead time e item principal."
            actions={
              <button
                type="button"
                onClick={addItem}
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_32px_-24px_rgba(15,31,50,0.7)] transition hover:bg-slate-800"
              >
                Vincular item
              </button>
            }
          >
            {items.length === 0 ? (
              <EmptyState
                title="Nenhum item vinculado"
                description="Adicione pelo menos um item para registrar custo, lead time e relacao principal do parceiro."
              />
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={`${item.catalogItemId}-${index}`}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <DataPill tone={item.isPrimary ? "amber" : "slate"}>
                        {item.isPrimary ? "Item principal" : "Item vinculado"}
                      </DataPill>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Remover
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <FormField label="Item do catalogo">
                        <SelectInput
                          value={item.catalogItemId}
                          onChange={(event) =>
                            updateItem(index, { catalogItemId: event.target.value })
                          }
                        >
                          {catalogItems.map((catalog) => (
                            <option key={catalog.id} value={catalog.id}>
                              {catalog.name}
                              {catalog.sku ? ` (${catalog.sku})` : ""}
                            </option>
                          ))}
                        </SelectInput>
                      </FormField>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="SKU do fornecedor">
                          <TextInput
                            value={item.supplierSku}
                            onChange={(event) =>
                              updateItem(index, { supplierSku: event.target.value })
                            }
                            placeholder="Codigo interno do parceiro"
                          />
                        </FormField>

                        <FormField label="Preco">
                          <TextInput
                            type="number"
                            step="0.01"
                            value={item.supplierPrice}
                            onChange={(event) =>
                              updateItem(index, { supplierPrice: event.target.value })
                            }
                            placeholder="0,00"
                          />
                        </FormField>

                        <FormField label="Lead time (dias)">
                          <TextInput
                            type="number"
                            value={item.leadTimeDays}
                            onChange={(event) =>
                              updateItem(index, { leadTimeDays: event.target.value })
                            }
                            placeholder="Prazo medio"
                          />
                        </FormField>

                        <div className="flex items-end">
                          <label className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={item.isPrimary}
                              onChange={(event) =>
                                updateItem(index, { isPrimary: event.target.checked })
                              }
                            />
                            Marcar como item principal deste fornecedor
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Fechamento"
            title="Revisao final"
            description="Conferir antes de salvar ajuda a reduzir cadastros incompletos e informacao solta."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <DataPill tone="blue">{items.length} item(ns) vinculados</DataPill>
                <DataPill tone="slate">
                  {splitTags(formData.categories).length} categoria(s)
                </DataPill>
                <DataPill tone="slate">
                  {splitTags(formData.representedBrands).length} marca(s)
                </DataPill>
              </div>

              <p className="text-sm leading-6 text-slate-600">
                O cadastro fica mais forte quando o parceiro entra com dados formais,
                notas de avaliacao e pelo menos um item conectado ao catalogo.
              </p>

              <button
                type="submit"
                disabled={loading || loadingSupplier || !formData.companyName}
                className="w-full rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_-24px_rgba(15,31,50,0.7)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Salvando..."
                  : isEditing
                    ? "Salvar alteracoes"
                    : "Salvar fornecedor"}
              </button>
            </div>
          </SectionCard>
        </div>
      </form>
    </div>
  );
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
