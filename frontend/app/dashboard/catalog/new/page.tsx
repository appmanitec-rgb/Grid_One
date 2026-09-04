"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, optionLabel, type ControlOption } from "@/lib/control-options";

type ItemType = "PART" | "SERVICE";
type ProductOrigin =
  | "NACIONAL"
  | "ESTRANGEIRA_IMPORTACAO_DIRETA"
  | "ESTRANGEIRA_MERCADO_INTERNO";

type SectionTab = "overview" | "identifiers" | "technical" | "suppliers" | "inventory" | "fiscal" | "documents";
type IdentifierType =
  | "INTERNAL_SKU"
  | "MANUFACTURER_PART_NUMBER"
  | "SUPPLIER_CODE"
  | "BARCODE"
  | "LEGACY_CODE"
  | "PREVIOUS_CODE"
  | "CATALOG_CODE"
  | "MANUAL_CODE"
  | "INTERNAL_ALIAS"
  | "OTHER";

type SupplierOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  paymentTerm?: string | null;
};

type SupplierItem = {
  id: string;
  supplierId: string;
  supplierSku?: string | null;
  supplierPrice?: number | null;
  leadTimeDays?: number | null;
  isPrimary?: boolean | null;
  purchasePaymentTerm?: string | null;
  purchaseTaxMode?: "AMOUNT" | "PERCENT" | null;
  purchaseTaxPercent?: number | null;
  purchaseTaxAmount?: number | null;
  freightAmount?: number | null;
  otherPurchaseCosts?: number | null;
  priceValidFrom?: string | null;
  priceValidUntil?: string | null;
  priceNotes?: string | null;
  supplier: SupplierOption;
};

type CatalogIdentifier = {
  id: string;
  type: IdentifierType;
  code: string;
  source?: string | null;
  description?: string | null;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
  supplier?: SupplierOption | null;
  manufacturer?: { id: string; name: string; type?: string | null } | null;
};

type CatalogOffer = {
  id: string;
  status: "ACTIVE" | "SUPERSEDED" | "EXPIRED" | "ARCHIVED";
  version: number;
  supplierSku?: string | null;
  offeredPartNumber?: string | null;
  offeredDescription?: string | null;
  quoteNumber?: string | null;
  unitPrice?: number | null;
  effectiveUnitCost?: number | null;
  effectiveTotalCost?: number | null;
  currency?: string | null;
  minPurchaseQty?: number | null;
  purchaseMultiple?: number | null;
  availability?: string | null;
  leadTimeDays?: number | null;
  paymentTerm?: string | null;
  validUntil?: string | null;
  isPreferred?: boolean | null;
  preferenceReason?: string | null;
  ranking?: {
    lowestUnitPrice?: boolean;
    lowestEffectiveCost?: boolean;
    fastestLeadTime?: boolean;
    recommended?: boolean;
    incompleteComparison?: boolean;
  };
  supplier: SupplierOption;
};

type CatalogDocument = {
  id: string;
  category: string;
  title: string;
  version?: string | null;
  status?: string | null;
  fileName?: string | null;
  externalUrl?: string | null;
  createdAt?: string | null;
};

type CatalogPricingPolicy = {
  id: string;
  name: string;
  itemType: ItemType;
  salesTaxPercent: number;
  commissionPercent: number;
  profitMarginPercent: number;
  operationalCostPercent: number;
  serviceCalculationMode: string;
  isDefault: boolean;
  isActive: boolean;
};

type SkuFamily = {
  id: string;
  areaId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type SkuArea = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  families: SkuFamily[];
};

type SkuApplication = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type SkuRule = {
  id: string;
  areaId: string;
  familyId: string;
  applicationId: string;
  sortOrder: number;
  application: SkuApplication;
};

export default function CatalogFormPage() {
  const router = useRouter();
  const [editItemId, setEditItemId] = useState("");
  const isEditing = Boolean(editItemId);

  const [activeTab, setActiveTab] = useState<SectionTab>("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [error, setError] = useState("");
  const [pricingMessage, setPricingMessage] = useState("");
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [canViewCosts, setCanViewCosts] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [itemSuppliers, setItemSuppliers] = useState<SupplierItem[]>([]);
  const [identifiers, setIdentifiers] = useState<CatalogIdentifier[]>([]);
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [documents, setDocuments] = useState<CatalogDocument[]>([]);
  const [pricingPolicies, setPricingPolicies] = useState<CatalogPricingPolicy[]>([]);
  const [controlOptions, setControlOptions] = useState({
    units: [] as ControlOption[],
    brands: [] as ControlOption[],
    documentCategories: [] as ControlOption[],
    storageLocations: [] as ControlOption[],
    paymentTerms: [] as ControlOption[],
  });
  const [skuTaxonomy, setSkuTaxonomy] = useState<{
    previewNumber: number;
    areas: SkuArea[];
    applications: SkuApplication[];
    rules: SkuRule[];
  }>({ previewNumber: 123456789, areas: [], applications: [], rules: [] });
  const [supplierSearch, setSupplierSearch] = useState("");
  const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    companyName: "",
    tradeName: "",
    cnpj: "",
    email: "",
    phone: "",
    paymentTerm: "",
  });
  const [identifierDraft, setIdentifierDraft] = useState({
    type: "SUPPLIER_CODE" as IdentifierType,
    code: "",
    source: "",
    description: "",
    isPrimary: false,
  });
  const [documentDraft, setDocumentDraft] = useState({
    category: "ORCAMENTO",
    title: "",
    version: "",
    externalUrl: "",
    notes: "",
  });

  const [formData, setFormData] = useState({
    sku: "",
    skuAreaId: "",
    skuFamilyId: "",
    skuApplicationId: "",
    name: "",
    type: "PART" as ItemType,
    description: "",
    commercialDescription: "",
    category: "",
    subcategory: "",
    unit: "UN",
    brand: "",
    manufacturerPartNumber: "",
    supplier: "",
    applicationNotes: "",
    technicalVoltage: "",
    technicalCurrent: "",
    technicalMaterial: "",
    technicalDimensions: "",

    costPrice: "",
    averageCost: "",
    lastCost: "",
    profitMargin: "",
    basePrice: "",
    pricingSupplierId: "",
    supplierSku: "",
    leadTimeDays: "",
    purchasePaymentTerm: "",
    quoteNumber: "",
    contactName: "",
    offeredPartNumber: "",
    offeredDescription: "",
    purchaseInvoiceValue: "",
    priceQuantity: "1",
    minPurchaseQty: "",
    purchaseMultiple: "",
    purchaseUnit: "UN",
    conversionFactor: "1",
    availability: "",
    purchaseTaxMode: "AMOUNT" as "AMOUNT" | "PERCENT",
    purchaseTaxPercent: "",
    purchaseTaxAmount: "",
    freightAmount: "",
    insuranceAmount: "",
    discountAmount: "",
    otherPurchaseCosts: "",
    recoverableCreditAmount: "",
    salesTaxPercent: "",
    commissionPercent: "",
    operationalCostPercent: "",
    priceValidFrom: "",
    priceValidUntil: "",
    pricingNotes: "",

    stockCurrent: "",
    stockMin: "",
    stockMax: "",
    reorderPoint: "",
    storageLocation: "",
    isActive: "true",

    ncm: "",
    cest: "",
    origin: "NACIONAL" as ProductOrigin,
    grossWeight: "",
    netWeight: "",

    icms: "",
    iss: "",
    pisCofins: "",
    ipi: "",
    irpj: "",
    csll: "",
    cpp: "",
  });

  const totalTaxPercentage = useMemo(() => {
    const policyTax = parseFloat(formData.salesTaxPercent);
    if (Number.isFinite(policyTax) && policyTax > 0) return policyTax;
    return (
      (parseFloat(formData.icms) || 0) +
      (parseFloat(formData.iss) || 0) +
      (parseFloat(formData.pisCofins) || 0) +
      (parseFloat(formData.ipi) || 0) +
      (parseFloat(formData.irpj) || 0) +
      (parseFloat(formData.csll) || 0) +
      (parseFloat(formData.cpp) || 0)
    );
  }, [formData]);

  const purchaseTotal = useMemo(
    () => {
      const invoice = parseFloat(formData.purchaseInvoiceValue) || 0;
      const purchaseTax =
        formData.purchaseTaxMode === "PERCENT"
          ? invoice * ((parseFloat(formData.purchaseTaxPercent) || 0) / 100)
          : parseFloat(formData.purchaseTaxAmount) || 0;
      return (
        invoice +
        purchaseTax +
        (parseFloat(formData.freightAmount) || 0) +
        (parseFloat(formData.insuranceAmount) || 0) +
        (parseFloat(formData.otherPurchaseCosts) || 0) -
        (parseFloat(formData.discountAmount) || 0) -
        (parseFloat(formData.recoverableCreditAmount) || 0)
      );
    },
    [
      formData.discountAmount,
      formData.freightAmount,
      formData.insuranceAmount,
      formData.otherPurchaseCosts,
      formData.purchaseInvoiceValue,
      formData.purchaseTaxAmount,
      formData.purchaseTaxMode,
      formData.purchaseTaxPercent,
      formData.recoverableCreditAmount,
    ],
  );

  const pricingMarkupPercentage = useMemo(
    () =>
      totalTaxPercentage +
      (parseFloat(formData.commissionPercent) || 0) +
      (parseFloat(formData.profitMargin) || 0) +
      (parseFloat(formData.operationalCostPercent) || 0),
    [formData.commissionPercent, formData.operationalCostPercent, formData.profitMargin, totalTaxPercentage],
  );

  const calculatedSalePrice = useMemo(
    () => Number((purchaseTotal * (1 + pricingMarkupPercentage / 100)).toFixed(2)),
    [pricingMarkupPercentage, purchaseTotal],
  );

  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    return suppliers
      .filter((supplier) =>
        [supplier.companyName, supplier.tradeName, supplier.cnpj]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [supplierSearch, suppliers]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === formData.pricingSupplierId);
  const activePricingPolicy = pricingPolicies.find((policy) => policy.itemType === formData.type && policy.isDefault) || pricingPolicies.find((policy) => policy.itemType === formData.type);
  const selectedSkuArea = skuTaxonomy.areas.find((area) => area.id === formData.skuAreaId);
  const availableSkuFamilies = selectedSkuArea?.families || [];
  const selectedSkuFamily = availableSkuFamilies.find((family) => family.id === formData.skuFamilyId);
  const availableSkuApplications = useMemo(
    () =>
      skuTaxonomy.rules
        .filter((rule) => rule.areaId === formData.skuAreaId && rule.familyId === formData.skuFamilyId)
        .map((rule) => rule.application)
        .filter((application, index, list) => list.findIndex((item) => item.id === application.id) === index),
    [formData.skuAreaId, formData.skuFamilyId, skuTaxonomy.rules],
  );
  const selectedSkuApplication = availableSkuApplications.find((application) => application.id === formData.skuApplicationId);
  const skuSuffixPreview = `${selectedSkuArea?.code || "_"}${selectedSkuFamily?.code || "_"}${selectedSkuApplication?.code || "_"}`;
  const skuBaseNumber = formData.sku && /^[0-9]{9}[A-Z]{3}$/.test(formData.sku)
    ? formData.sku.slice(0, -3)
    : String(skuTaxonomy.previewNumber).padStart(9, "0");
  const generatedSkuPreview = `${skuBaseNumber}${skuSuffixPreview}`;
  const skuClassificationComplete = Boolean(selectedSkuArea && selectedSkuFamily && selectedSkuApplication);
  const skuReadablePath = [selectedSkuArea?.name, selectedSkuFamily?.name, selectedSkuApplication?.name].filter(Boolean).join(" • ");

  useEffect(() => {
    const access = getAccessFromToken();
    setCanViewCosts(access.catalog.viewCosts);
    const id = new URLSearchParams(window.location.search).get("editItemId");
    if (id) setEditItemId(id);
    void loadSkuTaxonomy();
    void loadPricingPolicies();
    void loadCatalogControlOptions();
  }, []);

  useEffect(() => {
    if (!activePricingPolicy) return;
    setFormData((prev) => ({
      ...prev,
      salesTaxPercent: String(activePricingPolicy.salesTaxPercent || ""),
      commissionPercent: String(activePricingPolicy.commissionPercent || ""),
      profitMargin: String(activePricingPolicy.profitMarginPercent || ""),
      operationalCostPercent: String(activePricingPolicy.operationalCostPercent || ""),
    }));
  }, [activePricingPolicy]);

  useEffect(() => {
    if (!canViewCosts) return;
    void loadSuppliers();
  }, [canViewCosts]);

  useEffect(() => {
    if (!canViewCosts || activeTab === "suppliers") return;
    const cost = parseFloat(formData.costPrice) || 0;
    const margin = parseFloat(formData.profitMargin) || 0;

    if (cost <= 0) {
      setFormData((prev) => ({ ...prev, basePrice: "" }));
      return;
    }

    const finalPrice = cost * (1 + totalTaxPercentage / 100) * (1 + margin / 100);
    setFormData((prev) => ({ ...prev, basePrice: finalPrice.toFixed(2) }));
  }, [activeTab, canViewCosts, formData.costPrice, formData.profitMargin, totalTaxPercentage]);

  useEffect(() => {
    if (!canViewCosts || activeTab !== "suppliers" || purchaseTotal <= 0) return;
    setFormData((prev) => ({ ...prev, basePrice: calculatedSalePrice.toFixed(2) }));
  }, [activeTab, calculatedSalePrice, canViewCosts, purchaseTotal]);

  useEffect(() => {
    if (!isEditing) return;

    setIsLoadingItem(true);

    (async () => {
      try {
        const res = await apiFetch(`/catalogs/${editItemId}`);

        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(
              res,
              "Nao foi possivel carregar item para edicao.",
            ),
          );
        }

        const item = await res.json();
        const taxProfile = (item.taxProfile && typeof item.taxProfile === "object") ? item.taxProfile : {};
        const technicalSpecs = (item.technicalSpecs && typeof item.technicalSpecs === "object") ? item.technicalSpecs : {};
        const reorderPoint =
          item.operationalSummary?.reorderPoint ??
          item.inventoryBalances?.find((balance: { reorderPoint?: number | null }) => balance.reorderPoint != null)?.reorderPoint;
        const primarySupplier = item.supplierItems?.find((entry: { isPrimary?: boolean }) => entry.isPrimary) || item.supplierItems?.[0];
        setItemSuppliers(item.supplierItems || []);
        setIdentifiers(item.identifiers || []);
        setOffers(item.supplierOffers || []);
        setDocuments(item.itemDocuments || []);

        setFormData({
          sku: item.sku || "",
          skuAreaId: item.skuAreaId || item.skuArea?.id || "",
          skuFamilyId: item.skuFamilyId || item.skuFamily?.id || "",
          skuApplicationId: item.skuApplicationId || item.skuApplication?.id || "",
          name: item.name || "",
          type: item.type || "PART",
          description: item.description || "",
          commercialDescription: item.commercialDescription || "",
          category: item.category || "",
          subcategory: item.subcategory || "",
          unit: item.unit || "UN",
          brand: item.brand || "",
          manufacturerPartNumber: item.manufacturerPartNumber || "",
          supplier: item.supplier || "",
          applicationNotes: item.applicationNotes || "",
          technicalVoltage: technicalSpecs.voltage || "",
          technicalCurrent: technicalSpecs.current || "",
          technicalMaterial: technicalSpecs.material || "",
          technicalDimensions: technicalSpecs.dimensions || "",

          costPrice: item.costPrice != null ? String(item.costPrice) : "",
          averageCost: item.averageCost != null ? String(item.averageCost) : "",
          lastCost: item.lastCost != null ? String(item.lastCost) : "",
          profitMargin: item.profitMargin != null ? String(item.profitMargin) : "",
          basePrice: item.basePrice != null ? String(item.basePrice) : "",
          pricingSupplierId: primarySupplier?.supplier?.id || "",
          supplierSku: primarySupplier?.supplierSku || "",
          leadTimeDays: primarySupplier?.leadTimeDays != null ? String(primarySupplier.leadTimeDays) : "",
          purchasePaymentTerm: primarySupplier?.purchasePaymentTerm || primarySupplier?.supplier?.paymentTerm || "",
          quoteNumber: "",
          contactName: "",
          offeredPartNumber: "",
          offeredDescription: "",
          purchaseInvoiceValue: primarySupplier?.supplierPrice != null ? String(primarySupplier.supplierPrice) : item.costPrice != null ? String(item.costPrice) : "",
          priceQuantity: "1",
          minPurchaseQty: "",
          purchaseMultiple: "",
          purchaseUnit: item.unit || "UN",
          conversionFactor: "1",
          availability: "",
          purchaseTaxMode: primarySupplier?.purchaseTaxMode || "AMOUNT",
          purchaseTaxPercent: primarySupplier?.purchaseTaxPercent != null ? String(primarySupplier.purchaseTaxPercent) : "",
          purchaseTaxAmount: primarySupplier?.purchaseTaxAmount != null ? String(primarySupplier.purchaseTaxAmount) : "",
          freightAmount: primarySupplier?.freightAmount != null ? String(primarySupplier.freightAmount) : "",
          insuranceAmount: "",
          discountAmount: "",
          otherPurchaseCosts: primarySupplier?.otherPurchaseCosts != null ? String(primarySupplier.otherPurchaseCosts) : "",
          recoverableCreditAmount: "",
          salesTaxPercent: "",
          commissionPercent: taxProfile.commissionPercent != null ? String(taxProfile.commissionPercent) : "",
          operationalCostPercent: taxProfile.operationalCostPercent != null ? String(taxProfile.operationalCostPercent) : "",
          priceValidFrom: taxProfile.priceValidFrom ? String(taxProfile.priceValidFrom).slice(0, 10) : "",
          priceValidUntil: taxProfile.priceValidUntil ? String(taxProfile.priceValidUntil).slice(0, 10) : "",
          pricingNotes: "",

          stockCurrent: item.stockCurrent != null ? String(item.stockCurrent) : "",
          stockMin: item.stockMin != null ? String(item.stockMin) : "",
          stockMax: item.stockMax != null ? String(item.stockMax) : "",
          reorderPoint: reorderPoint != null ? String(reorderPoint) : "",
          storageLocation: item.storageLocation || "",
          isActive: item.isActive === false ? "false" : "true",

          ncm: item.ncm || "",
          cest: item.cest || "",
          origin: item.origin || "NACIONAL",
          grossWeight: item.grossWeight != null ? String(item.grossWeight) : "",
          netWeight: item.netWeight != null ? String(item.netWeight) : "",

          icms: taxProfile.icms != null ? String(taxProfile.icms) : "",
          iss: taxProfile.iss != null ? String(taxProfile.iss) : "",
          pisCofins: taxProfile.pisCofins != null ? String(taxProfile.pisCofins) : item.taxPercentage != null ? String(item.taxPercentage) : "",
          ipi: taxProfile.ipi != null ? String(taxProfile.ipi) : "",
          irpj: taxProfile.irpj != null ? String(taxProfile.irpj) : "",
          csll: taxProfile.csll != null ? String(taxProfile.csll) : "",
          cpp: taxProfile.cpp != null ? String(taxProfile.cpp) : "",
        });
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error ? loadError.message : "Erro ao carregar item.",
        );
      } finally {
        setIsLoadingItem(false);
      }
    })();
  }, [editItemId, isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleSkuAreaChange(value: string) {
    setFormData((prev) => ({
      ...prev,
      skuAreaId: value,
      skuFamilyId: "",
      skuApplicationId: "",
    }));
  }

  function handleSkuFamilyChange(value: string) {
    setFormData((prev) => ({
      ...prev,
      skuFamilyId: value,
      skuApplicationId: "",
    }));
  }

  function handleSkuApplicationChange(value: string) {
    setFormData((prev) => ({ ...prev, skuApplicationId: value }));
  }

  function selectSupplier(supplier: SupplierOption) {
    const linked = itemSuppliers.find((entry) => entry.supplierId === supplier.id);
    if (linked) {
      selectSupplierCondition(linked);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      pricingSupplierId: supplier.id,
      supplier: supplier.companyName,
      supplierSku: "",
      leadTimeDays: "",
      purchasePaymentTerm: supplier.paymentTerm || "",
      quoteNumber: "",
      contactName: "",
      offeredPartNumber: "",
      offeredDescription: "",
      purchaseInvoiceValue: "",
      priceQuantity: "1",
      minPurchaseQty: "",
      purchaseMultiple: "",
      purchaseUnit: prev.unit || "UN",
      conversionFactor: "1",
      availability: "",
      purchaseTaxMode: "AMOUNT",
      purchaseTaxPercent: "",
      purchaseTaxAmount: "",
      freightAmount: "",
      insuranceAmount: "",
      discountAmount: "",
      otherPurchaseCosts: "",
      recoverableCreditAmount: "",
      priceValidFrom: "",
      priceValidUntil: "",
      pricingNotes: "",
    }));
    setSupplierSearch(supplier.companyName);
    setPricingMessage("Fornecedor selecionado. Preencha as condicoes e salve para vincular a esta peca.");
  }

  function selectSupplierCondition(entry: SupplierItem) {
    setFormData((prev) => ({
      ...prev,
      pricingSupplierId: entry.supplierId,
      supplier: entry.supplier.companyName,
      supplierSku: entry.supplierSku || "",
      leadTimeDays: entry.leadTimeDays != null ? String(entry.leadTimeDays) : "",
      purchasePaymentTerm: entry.purchasePaymentTerm || entry.supplier.paymentTerm || "",
      quoteNumber: "",
      contactName: "",
      offeredPartNumber: "",
      offeredDescription: "",
      purchaseInvoiceValue: entry.supplierPrice != null ? String(entry.supplierPrice) : "",
      priceQuantity: "1",
      minPurchaseQty: "",
      purchaseMultiple: "",
      purchaseUnit: prev.unit || "UN",
      conversionFactor: "1",
      availability: "",
      purchaseTaxMode: entry.purchaseTaxMode || "AMOUNT",
      purchaseTaxPercent: entry.purchaseTaxPercent != null ? String(entry.purchaseTaxPercent) : "",
      purchaseTaxAmount: entry.purchaseTaxAmount != null ? String(entry.purchaseTaxAmount) : "",
      freightAmount: entry.freightAmount != null ? String(entry.freightAmount) : "",
      insuranceAmount: "",
      discountAmount: "",
      otherPurchaseCosts: entry.otherPurchaseCosts != null ? String(entry.otherPurchaseCosts) : "",
      recoverableCreditAmount: "",
      priceValidFrom: entry.priceValidFrom ? String(entry.priceValidFrom).slice(0, 10) : "",
      priceValidUntil: entry.priceValidUntil ? String(entry.priceValidUntil).slice(0, 10) : "",
      pricingNotes: entry.priceNotes || "",
    }));
    setSupplierSearch(entry.supplier.companyName);
  }

  async function loadSuppliers() {
    try {
      const res = await apiFetch("/suppliers", { cache: "no-store" });
      if (res.ok) setSuppliers(await res.json());
    } catch {
      setSuppliers([]);
    }
  }

  async function loadSkuTaxonomy() {
    try {
      const res = await apiFetch("/catalogs/sku-taxonomy", { cache: "no-store" });
      if (res.ok) setSkuTaxonomy(await res.json());
    } catch {
      setSkuTaxonomy({ previewNumber: 123456789, areas: [], applications: [], rules: [] });
    }
  }

  async function loadPricingPolicies() {
    try {
      const res = await apiFetch("/catalogs/pricing-policies", { cache: "no-store" });
      if (res.ok) setPricingPolicies(await res.json());
    } catch {
      setPricingPolicies([]);
    }
  }

  async function loadCatalogControlOptions() {
    try {
      const options = await loadControlOptions([
        "CATALOG_UNIT",
        "CATALOG_BRAND",
        "CATALOG_DOCUMENT_CATEGORY",
        "STORAGE_LOCATION",
        "PAYMENT_TERM",
      ]);
      setControlOptions({
        units: options.CATALOG_UNIT || [],
        brands: options.CATALOG_BRAND || [],
        documentCategories: options.CATALOG_DOCUMENT_CATEGORY || [],
        storageLocations: options.STORAGE_LOCATION || [],
        paymentTerms: options.PAYMENT_TERM || [],
      });
    } catch {
      setControlOptions({
        units: [],
        brands: [],
        documentCategories: [],
        storageLocations: [],
        paymentTerms: [],
      });
    }
  }

  async function refreshMasterData() {
    if (!editItemId) return;
    const [itemRes, offersRes, identifiersRes, documentsRes] = await Promise.all([
      apiFetch(`/catalogs/${editItemId}`, { cache: "no-store" }),
      apiFetch(`/catalogs/${editItemId}/offers`, { cache: "no-store" }),
      apiFetch(`/catalogs/${editItemId}/identifiers`, { cache: "no-store" }),
      apiFetch(`/catalogs/${editItemId}/documents`, { cache: "no-store" }),
    ]);
    if (itemRes.ok) {
      const item = await itemRes.json();
      setItemSuppliers(item.supplierItems || []);
      setDocuments(item.itemDocuments || []);
      setIdentifiers(item.identifiers || []);
      setFormData((prev) => ({
        ...prev,
        supplier: item.supplier || prev.supplier,
        costPrice: item.costPrice != null ? String(item.costPrice) : prev.costPrice,
        lastCost: item.lastCost != null ? String(item.lastCost) : prev.lastCost,
        basePrice: item.basePrice != null ? String(item.basePrice) : prev.basePrice,
      }));
    }
    if (offersRes.ok) setOffers(await offersRes.json());
    if (identifiersRes.ok) setIdentifiers(await identifiersRes.json());
    if (documentsRes.ok) setDocuments(await documentsRes.json());
  }

  async function handleCreateSupplier() {
    if (!newSupplier.companyName.trim()) {
      setError("Informe o nome do fornecedor.");
      return;
    }
    setError("");
    setPricingMessage("");
    setIsCreatingSupplier(true);

    try {
      const res = await apiFetch("/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: newSupplier.companyName.trim(),
          tradeName: newSupplier.tradeName.trim() || undefined,
          cnpj: onlyDigits(newSupplier.cnpj) || undefined,
          email: newSupplier.email.trim() || undefined,
          phone: newSupplier.phone.trim() || undefined,
          paymentTerm: newSupplier.paymentTerm.trim() || undefined,
          categories: [],
          representedBrands: [],
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Erro ao cadastrar fornecedor."));
      }
      const created = await res.json();
      const supplier = {
        id: created.id,
        companyName: created.companyName,
        tradeName: created.tradeName,
        cnpj: created.cnpj,
        paymentTerm: created.paymentTerm,
      };
      setSuppliers((prev) => [supplier, ...prev]);
      selectSupplier(supplier);
      setNewSupplier({ companyName: "", tradeName: "", cnpj: "", email: "", phone: "", paymentTerm: "" });
      setIsSupplierFormOpen(false);
      setPricingMessage("Fornecedor cadastrado. Preencha as condicoes de compra da peca.");
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Erro ao cadastrar fornecedor.");
    } finally {
      setIsCreatingSupplier(false);
    }
  }

  async function handleApplyPricing(makePreferred = false) {
    if (!isEditing) {
      setPricingMessage("Salve o item primeiro para registrar uma cotacao vinculada.");
      return;
    }
    setPricingMessage("");
    setError("");
    setIsSavingPricing(true);

    try {
      const res = await apiFetch(`/catalogs/${editItemId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: formData.pricingSupplierId,
          supplierSku: formData.supplierSku || undefined,
          quoteNumber: formData.quoteNumber || undefined,
          contactName: formData.contactName || undefined,
          offeredPartNumber: formData.offeredPartNumber || undefined,
          offeredDescription: formData.offeredDescription || undefined,
          leadTimeDays: toNumberOrUndefined(formData.leadTimeDays),
          paymentTerm: formData.purchasePaymentTerm || undefined,
          unitPrice: Number(formData.purchaseInvoiceValue || 0),
          priceQuantity: toNumberOrUndefined(formData.priceQuantity),
          minPurchaseQty: toNumberOrUndefined(formData.minPurchaseQty),
          purchaseMultiple: toNumberOrUndefined(formData.purchaseMultiple),
          purchaseUnit: formData.purchaseUnit || undefined,
          conversionFactor: toNumberOrUndefined(formData.conversionFactor),
          availability: formData.availability || undefined,
          purchaseTaxMode: formData.purchaseTaxMode,
          purchaseTaxPercent: toNumberOrUndefined(formData.purchaseTaxPercent),
          purchaseTaxAmount: toNumberOrUndefined(formData.purchaseTaxAmount),
          freightAmount: toNumberOrUndefined(formData.freightAmount),
          insuranceAmount: toNumberOrUndefined(formData.insuranceAmount),
          discountAmount: toNumberOrUndefined(formData.discountAmount),
          additionalCostsAmount: toNumberOrUndefined(formData.otherPurchaseCosts),
          recoverableCreditAmount: toNumberOrUndefined(formData.recoverableCreditAmount),
          validFrom: formData.priceValidFrom || undefined,
          validUntil: formData.priceValidUntil || undefined,
          notes: formData.pricingNotes || undefined,
          isPreferred: makePreferred,
          preferenceReason: makePreferred ? formData.pricingNotes || "Fornecedor preferencial definido no cadastro mestre." : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Erro ao registrar cotacao."));
      }

      await refreshMasterData();
      setPricingMessage(makePreferred ? "Cotacao registrada e definida como preferencial. Preco de venda marcado para revisao." : "Cotacao registrada no historico do fornecedor.");
    } catch (pricingError: unknown) {
      setError(pricingError instanceof Error ? pricingError.message : "Erro ao registrar cotacao.");
    } finally {
      setIsSavingPricing(false);
    }
  }

  async function handleCreateIdentifier() {
    if (!isEditing) {
      setError("Salve o item primeiro para adicionar codigos relacionados.");
      return;
    }
    if (!identifierDraft.code.trim()) {
      setError("Informe o codigo que identifica este item.");
      return;
    }
    setError("");
    const res = await apiFetch(`/catalogs/${editItemId}/identifiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: identifierDraft.type,
        code: identifierDraft.code.trim(),
        source: identifierDraft.source.trim() || undefined,
        description: identifierDraft.description.trim() || undefined,
        isPrimary: identifierDraft.isPrimary,
      }),
    });
    if (!res.ok) {
      setError(await readApiErrorMessage(res, "Erro ao adicionar codigo."));
      return;
    }
    const result = await res.json();
    await refreshMasterData();
    setIdentifierDraft({ type: "SUPPLIER_CODE", code: "", source: "", description: "", isPrimary: false });
    const conflicts = Array.isArray(result.possibleDuplicates) ? result.possibleDuplicates.length : 0;
    setPricingMessage(conflicts > 0 ? `Codigo salvo. Encontramos ${conflicts} possivel(is) duplicidade(s) para revisar.` : "Codigo salvo e pesquisavel no catalogo.");
  }

  async function handleCreateDocument() {
    if (!isEditing) {
      setError("Salve o item primeiro para vincular documentos.");
      return;
    }
    if (!documentDraft.title.trim()) {
      setError("Informe o titulo do documento.");
      return;
    }
    setError("");
    const res = await apiFetch(`/catalogs/${editItemId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: documentDraft.category,
        title: documentDraft.title.trim(),
        version: documentDraft.version.trim() || undefined,
        externalUrl: documentDraft.externalUrl.trim() || undefined,
        notes: documentDraft.notes.trim() || undefined,
      }),
    });
    if (!res.ok) {
      setError(await readApiErrorMessage(res, "Erro ao vincular documento."));
      return;
    }
    await refreshMasterData();
    setDocumentDraft({ category: "ORCAMENTO", title: "", version: "", externalUrl: "", notes: "" });
    setPricingMessage("Documento vinculado ao cadastro mestre.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const taxProfile = {
      icms: toNumberOrUndefined(formData.icms),
      iss: toNumberOrUndefined(formData.iss),
      pisCofins: toNumberOrUndefined(formData.pisCofins),
      ipi: toNumberOrUndefined(formData.ipi),
      irpj: toNumberOrUndefined(formData.irpj),
      csll: toNumberOrUndefined(formData.csll),
      cpp: toNumberOrUndefined(formData.cpp),
    };

    const technicalSpecs = {
      voltage: formData.technicalVoltage || undefined,
      current: formData.technicalCurrent || undefined,
      material: formData.technicalMaterial || undefined,
      dimensions: formData.technicalDimensions || undefined,
    };

    const payload = {
      sku: skuClassificationComplete ? undefined : formData.sku || undefined,
      skuAreaId: formData.skuAreaId || undefined,
      skuFamilyId: formData.skuFamilyId || undefined,
      skuApplicationId: formData.skuApplicationId || undefined,
      name: formData.name,
      type: formData.type,
      description: formData.description || undefined,
      commercialDescription: formData.commercialDescription || undefined,
      category: skuClassificationComplete ? undefined : formData.category || undefined,
      subcategory: skuClassificationComplete ? undefined : formData.subcategory || undefined,
      unit: formData.unit || undefined,
      brand: formData.brand || undefined,
      manufacturerPartNumber: formData.manufacturerPartNumber || undefined,
      supplier: formData.supplier || undefined,
      applicationNotes: formData.applicationNotes || undefined,
      technicalSpecs,

      ...(canViewCosts
        ? {
            costPrice: toNumberOrUndefined(formData.costPrice),
            averageCost: toNumberOrUndefined(formData.averageCost),
            lastCost: toNumberOrUndefined(formData.lastCost),
            taxPercentage: totalTaxPercentage,
            profitMargin: toNumberOrUndefined(formData.profitMargin),
          }
        : {}),
      basePrice: Number(formData.basePrice || 0),

      stockMin: toNumberOrUndefined(formData.stockMin),
      stockMax: toNumberOrUndefined(formData.stockMax),
      reorderPoint: toNumberOrUndefined(formData.reorderPoint),
      storageLocation: formData.storageLocation || undefined,
      isActive: formData.isActive === "true",

      ncm: formData.ncm || undefined,
      cest: formData.cest || undefined,
      origin: formData.origin,
      grossWeight: toNumberOrUndefined(formData.grossWeight),
      netWeight: toNumberOrUndefined(formData.netWeight),
      taxProfile,
    };

    try {
      const url = isEditing ? `/catalogs/${editItemId}` : "/catalogs";
      const method = isEditing ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Erro ao salvar item."));
      }

      router.push("/dashboard/catalog");
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro de ligacao com o servidor.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto mb-20 max-w-7xl p-8">
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">{isEditing ? "Editar Item de Catalogo" : "Novo Item de Catalogo"}</h1>
          <p className="mt-1 text-zinc-500">Cadastro completo com base tecnica, fiscal, estoque e precificacao.</p>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {isLoadingItem && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700">Carregando item...</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton label="Visao geral" value="overview" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Identificacao e codigos" value="identifiers" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Tecnico e compatibilidade" value="technical" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Fornecedores e cotacoes" value="suppliers" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Estoque" value="inventory" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Fiscal e comercial" value="fiscal" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Documentos e historico" value="documents" active={activeTab} onClick={setActiveTab} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === "overview" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-800">Visao geral do item</h2>
                <p className="mt-1 text-sm text-zinc-500">Identidade principal, status e resumo vivo das areas conectadas.</p>
              </div>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <SummaryTile label="Codigos" value={String(identifiers.length)} />
                  <SummaryTile label="Fornecedores" value={String(itemSuppliers.length)} />
                  <SummaryTile label="Cotacoes" value={String(offers.length)} />
                  <SummaryTile label="Documentos" value={String(documents.length)} />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-span-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-bold text-zinc-700">Area do SKU {formData.type === "PART" ? <RequiredMark /> : null}</label>
                    <select value={formData.skuAreaId} onChange={(event) => handleSkuAreaChange(event.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white p-3">
                      <option value="">Selecione a area</option>
                      {skuTaxonomy.areas.map((area) => (
                        <option key={area.id} value={area.id}>{area.code} - {area.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-zinc-700">Familia {formData.type === "PART" ? <RequiredMark /> : null}</label>
                    <select value={formData.skuFamilyId} onChange={(event) => handleSkuFamilyChange(event.target.value)} disabled={!formData.skuAreaId} className="w-full rounded-lg border border-zinc-300 bg-white p-3 disabled:bg-zinc-100">
                      <option value="">{formData.skuAreaId ? "Selecione a familia" : "Escolha uma area primeiro"}</option>
                      {availableSkuFamilies.map((family) => (
                        <option key={family.id} value={family.id}>{family.code} - {family.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-zinc-700">Aplicacao {formData.type === "PART" ? <RequiredMark /> : null}</label>
                    <select value={formData.skuApplicationId} onChange={(event) => handleSkuApplicationChange(event.target.value)} disabled={!formData.skuFamilyId} className="w-full rounded-lg border border-zinc-300 bg-white p-3 disabled:bg-zinc-100">
                      <option value="">{formData.skuFamilyId ? "Selecione a aplicacao" : "Escolha uma familia primeiro"}</option>
                      {availableSkuApplications.map((application) => (
                        <option key={application.id} value={application.id}>{application.code} - {application.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SummaryTile label="Numero" value={skuBaseNumber} />
                  <SummaryTile label="Sigla" value={skuSuffixPreview} />
                  <SummaryTile label="Codigo gerado" value={skuClassificationComplete ? generatedSkuPreview : formData.sku || generatedSkuPreview} />
                </div>
                <p className="mt-3 text-sm font-semibold text-blue-800">
                  {skuReadablePath || "Selecione area, familia e aplicacao para gerar o codigo automaticamente."}
                </p>
                {formData.sku && !skuClassificationComplete ? (
                  <p className="mt-1 text-xs text-blue-700">SKU atual preservado ate a classificacao ser definida: {formData.sku}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-zinc-700">Tipo <RequiredMark /></label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                  <option value="PART">Peca / Produto</option>
                  <option value="SERVICE">Servico / Mao de Obra</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-zinc-700">Status</label>
                <select name="isActive" value={formData.isActive} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
              <Input label="Nome do Item" name="name" value={formData.name} onChange={handleChange} className="md:col-span-2" requiredMark required />
              <Input label="Descricao Comercial" name="commercialDescription" value={formData.commercialDescription} onChange={handleChange} className="md:col-span-2" />
              <TextArea label="Descricao interna" name="description" value={formData.description} onChange={handleChange} className="md:col-span-4" />
              <ControlOptionInput
                label="Unidade"
                value={formData.unit}
                options={controlOptions.units}
                valueMode="code"
                listId="catalog-unit-options"
                onValueChange={(value) => setFormData((prev) => ({ ...prev, unit: value }))}
              />
              <ControlOptionInput
                label="Marca"
                value={formData.brand}
                options={controlOptions.brands}
                valueMode="name"
                listId="catalog-brand-options"
                onValueChange={(value) => setFormData((prev) => ({ ...prev, brand: value }))}
              />
              <Input label="Part Number" name="manufacturerPartNumber" value={formData.manufacturerPartNumber} onChange={handleChange} />
              <Input label="Fornecedor preferencial" name="supplier" value={formData.supplier} onChange={handleChange} readOnly />
            </div>
          </section>
        )}

        {activeTab === "identifiers" && (
          <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-800">Identificacao e codigos</h2>
              <p className="mt-1 text-sm text-zinc-500">Codigos alternativos, legados, de fornecedor e de manual apontando para o mesmo item mestre.</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Codigo</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Descricao</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {identifiers.map((identifier) => (
                    <tr key={identifier.id}>
                      <td className="px-4 py-3 font-semibold text-zinc-800">{identifierTypeLabel(identifier.type)}</td>
                      <td className="px-4 py-3 text-zinc-700">{identifier.code}</td>
                      <td className="px-4 py-3 text-zinc-500">{identifier.supplier?.companyName || identifier.manufacturer?.name || identifier.source || "-"}</td>
                      <td className="px-4 py-3 text-zinc-500">{identifier.description || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600">
                          {identifier.isPrimary ? "Principal" : identifier.isActive === false ? "Inativo" : "Ativo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {identifiers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">Nenhum codigo adicional salvo para este item.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-bold text-zinc-800">Adicionar codigo pesquisavel</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div>
                  <label className="mb-1 block text-sm font-bold text-zinc-700">Tipo</label>
                  <select value={identifierDraft.type} onChange={(event) => setIdentifierDraft((prev) => ({ ...prev, type: event.target.value as IdentifierType }))} className="w-full rounded-lg border border-zinc-300 p-3">
                    {IDENTIFIER_TYPES.map((type) => <option key={type} value={type}>{identifierTypeLabel(type)}</option>)}
                  </select>
                </div>
                <Input label="Codigo" value={identifierDraft.code} onChange={(event) => setIdentifierDraft((prev) => ({ ...prev, code: event.target.value }))} />
                <Input label="Origem" value={identifierDraft.source} onChange={(event) => setIdentifierDraft((prev) => ({ ...prev, source: event.target.value }))} />
                <Input label="Descricao" value={identifierDraft.description} onChange={(event) => setIdentifierDraft((prev) => ({ ...prev, description: event.target.value }))} />
                <label className="flex items-end gap-2 pb-3 text-sm font-semibold text-zinc-700">
                  <input type="checkbox" checked={identifierDraft.isPrimary} onChange={(event) => setIdentifierDraft((prev) => ({ ...prev, isPrimary: event.target.checked }))} />
                  Principal
                </label>
              </div>
              <button type="button" onClick={handleCreateIdentifier} className="mt-3 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white">
                Salvar codigo
              </button>
            </div>
          </section>
        )}

        {activeTab === "technical" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Dados Tecnicos</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Tensao" name="technicalVoltage" value={formData.technicalVoltage} onChange={handleChange} />
              <Input label="Corrente" name="technicalCurrent" value={formData.technicalCurrent} onChange={handleChange} />
              <Input label="Material" name="technicalMaterial" value={formData.technicalMaterial} onChange={handleChange} />
              <Input label="Dimensoes" name="technicalDimensions" value={formData.technicalDimensions} onChange={handleChange} />
              <TextArea label="Aplicacao e compatibilidade" name="applicationNotes" value={formData.applicationNotes} onChange={handleChange} />
            </div>
          </section>
        )}

        {activeTab === "suppliers" && (
          <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-800">Fornecedores e cotacoes</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Registre ofertas por fornecedor, compare custo efetivo e escolha preferencia com rastreabilidade.
                </p>
              </div>
              {pricingMessage ? (
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {pricingMessage}
                </span>
              ) : null}
            </div>

            {!canViewCosts ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">Custos restritos</p>
                <p className="mt-1 text-sm text-amber-700">
                  Seu perfil pode alterar cadastro operacional, mas nao visualiza nem atualiza custo, margem ou impostos.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Fornecedor</th>
                        <th className="px-4 py-3">Cotacao</th>
                        <th className="px-4 py-3">Custo efetivo</th>
                        <th className="px-4 py-3">Prazo</th>
                        <th className="px-4 py-3">Validade</th>
                        <th className="px-4 py-3">Leitura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                      {offers.map((offer) => (
                        <tr key={offer.id}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-zinc-800">{offer.supplier.companyName}</p>
                            <p className="text-xs text-zinc-500">{offer.supplierSku || offer.offeredPartNumber || "Sem codigo do fornecedor"}</p>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{offer.quoteNumber || `v${offer.version}`}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-800">{formatCurrencyNumber(Number(offer.effectiveUnitCost || 0))}</td>
                          <td className="px-4 py-3 text-zinc-600">{offer.leadTimeDays != null ? `${offer.leadTimeDays} dia(s)` : "-"}</td>
                          <td className="px-4 py-3 text-zinc-600">{offer.validUntil ? formatDate(offer.validUntil) : "-"}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {offer.isPreferred ? <Badge>Preferencial</Badge> : null}
                              {offer.ranking?.lowestEffectiveCost ? <Badge>Menor custo</Badge> : null}
                              {offer.ranking?.fastestLeadTime ? <Badge>Menor prazo</Badge> : null}
                              {offer.ranking?.incompleteComparison ? <Badge tone="amber">Incompleta</Badge> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {offers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">Nenhuma cotacao registrada para este item.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Fornecedores desta peca</p>
                      <button
                        type="button"
                        onClick={() => setIsSupplierFormOpen((value) => !value)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        {isSupplierFormOpen ? "Fechar cadastro" : "Novo fornecedor"}
                      </button>
                    </div>

                    {itemSuppliers.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                        {itemSuppliers.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => selectSupplierCondition(entry)}
                            className={`rounded-lg border px-3 py-2 text-left transition ${
                              formData.pricingSupplierId === entry.supplierId
                                ? "border-blue-500 bg-blue-50"
                                : "border-zinc-200 bg-white hover:border-blue-300"
                            }`}
                          >
                            <span className="block text-sm font-bold text-zinc-800">
                              {entry.supplier.companyName}
                            </span>
                            <span className="mt-0.5 block text-xs text-zinc-500">
                              {entry.isPrimary ? "Principal | " : ""}
                              {formatCurrencyNumber(Number(entry.supplierPrice || 0))} | {entry.purchasePaymentTerm || entry.supplier.paymentTerm || "Pagamento nao definido"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-4 text-sm text-zinc-500">
                        Nenhum fornecedor salvo para esta peca ainda.
                      </p>
                    )}

                    <div className="mt-3">
                      <Input
                        label="Pesquisar fornecedor para adicionar"
                        value={supplierSearch}
                        onChange={(event) => setSupplierSearch(event.target.value)}
                        placeholder="Digite nome, fantasia ou CNPJ"
                      />
                    </div>
                    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                      {supplierSearch.trim().length > 0 && supplierSearch.trim().length < 2 ? (
                        <p className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500">
                          Digite pelo menos 2 caracteres para pesquisar.
                        </p>
                      ) : null}
                      {filteredSuppliers.map((supplier) => (
                        (() => {
                          const linked = itemSuppliers.find((entry) => entry.supplierId === supplier.id);
                          return (
                        <button
                          key={supplier.id}
                          type="button"
                          onClick={() => selectSupplier(supplier)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                            formData.pricingSupplierId === supplier.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-zinc-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2 text-sm font-bold text-zinc-800">
                            <span>{supplier.companyName}</span>
                            {linked ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                Ja vinculado
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {supplier.tradeName || "Sem fantasia"} | {supplier.cnpj || "Sem CNPJ"} | {supplier.paymentTerm || "Pagamento nao definido"}
                          </span>
                        </button>
                          );
                        })()
                      ))}
                      {supplierSearch.trim().length >= 2 && filteredSuppliers.length === 0 ? (
                        <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
                          Nenhum fornecedor encontrado para a busca.
                        </p>
                      ) : null}
                    </div>

                    {isSupplierFormOpen ? (
                      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-bold text-zinc-800">Cadastrar fornecedor</p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Input label="Razao social *" value={newSupplier.companyName} onChange={(event) => setNewSupplier((prev) => ({ ...prev, companyName: event.target.value }))} />
                          <Input label="Fantasia" value={newSupplier.tradeName} onChange={(event) => setNewSupplier((prev) => ({ ...prev, tradeName: event.target.value }))} />
                          <Input label="CNPJ" value={newSupplier.cnpj} onChange={(event) => setNewSupplier((prev) => ({ ...prev, cnpj: event.target.value }))} />
                      <ControlOptionInput
                        label="Condicao de pagamento"
                        value={newSupplier.paymentTerm}
                        options={controlOptions.paymentTerms}
                        valueMode="name"
                        listId="new-supplier-payment-term-options"
                        onValueChange={(value) => setNewSupplier((prev) => ({ ...prev, paymentTerm: value }))}
                      />
                          <Input label="E-mail" type="email" value={newSupplier.email} onChange={(event) => setNewSupplier((prev) => ({ ...prev, email: event.target.value }))} />
                          <Input label="Telefone" value={newSupplier.phone} onChange={(event) => setNewSupplier((prev) => ({ ...prev, phone: event.target.value }))} />
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateSupplier}
                          disabled={isCreatingSupplier || !newSupplier.companyName.trim()}
                          className="mt-3 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {isCreatingSupplier ? "Cadastrando..." : "Cadastrar e selecionar"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Resumo vigente</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <SummaryTile label="Custo atual" value={formatCurrencyNumber(parseFloat(formData.costPrice) || 0)} />
                      <SummaryTile label="Preco venda" value={formatCurrencyNumber(parseFloat(formData.basePrice) || 0)} />
                      <SummaryTile label="Impostos venda" value={`${totalTaxPercentage.toFixed(2)}%`} />
                      <SummaryTile label="Fornecedor" value={selectedSupplier?.companyName || formData.supplier || "-"} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <section className="rounded-xl border border-zinc-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Condicoes de compra do fornecedor selecionado</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input label="SKU no fornecedor" name="supplierSku" value={formData.supplierSku} onChange={handleChange} />
                      <Input label="Numero da cotacao" name="quoteNumber" value={formData.quoteNumber} onChange={handleChange} />
                      <Input label="Contato do fornecedor" name="contactName" value={formData.contactName} onChange={handleChange} />
                      <Input label="Part number ofertado" name="offeredPartNumber" value={formData.offeredPartNumber} onChange={handleChange} />
                      <Input label="Descricao do fornecedor" name="offeredDescription" value={formData.offeredDescription} onChange={handleChange} />
                      <Input label="Prazo fornecedor (dias)" type="number" name="leadTimeDays" value={formData.leadTimeDays} onChange={handleChange} />
                      <ControlOptionInput
                        label="Condicao de pagamento"
                        value={formData.purchasePaymentTerm}
                        options={controlOptions.paymentTerms}
                        valueMode="name"
                        listId="purchase-payment-term-options"
                        placeholder="Ex.: 28/35 ddl, boleto, pix"
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, purchasePaymentTerm: value }))}
                      />
                      <Input label="Valor na nota/cotacao (R$)" type="number" step="0.01" name="purchaseInvoiceValue" value={formData.purchaseInvoiceValue} onChange={handleChange} />
                      <Input label="Qtd. referente ao preco" type="number" step="0.01" name="priceQuantity" value={formData.priceQuantity} onChange={handleChange} />
                      <Input label="Qtd. minima" type="number" step="0.01" name="minPurchaseQty" value={formData.minPurchaseQty} onChange={handleChange} />
                      <Input label="Multiplo de compra" type="number" step="0.01" name="purchaseMultiple" value={formData.purchaseMultiple} onChange={handleChange} />
                      <ControlOptionInput
                        label="Unidade de compra"
                        value={formData.purchaseUnit}
                        options={controlOptions.units}
                        valueMode="code"
                        listId="purchase-unit-options"
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, purchaseUnit: value }))}
                      />
                      <Input label="Fator de conversao" type="number" step="0.01" name="conversionFactor" value={formData.conversionFactor} onChange={handleChange} />
                      <Input label="Disponibilidade" name="availability" value={formData.availability} onChange={handleChange} />
                      <div>
                        <label className="mb-1 block text-sm font-bold text-zinc-700">Imposto de compra</label>
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                          <select name="purchaseTaxMode" value={formData.purchaseTaxMode} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                            <option value="AMOUNT">R$</option>
                            <option value="PERCENT">%</option>
                          </select>
                          <input
                            name={formData.purchaseTaxMode === "PERCENT" ? "purchaseTaxPercent" : "purchaseTaxAmount"}
                            type="number"
                            step="0.01"
                            value={formData.purchaseTaxMode === "PERCENT" ? formData.purchaseTaxPercent : formData.purchaseTaxAmount}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-zinc-300 p-3"
                          />
                        </div>
                      </div>
                      <Input label="Frete (R$)" type="number" step="0.01" name="freightAmount" value={formData.freightAmount} onChange={handleChange} />
                      <Input label="Seguro (R$)" type="number" step="0.01" name="insuranceAmount" value={formData.insuranceAmount} onChange={handleChange} />
                      <Input label="Desconto (R$)" type="number" step="0.01" name="discountAmount" value={formData.discountAmount} onChange={handleChange} />
                      <Input label="Outros custos (R$)" type="number" step="0.01" name="otherPurchaseCosts" value={formData.otherPurchaseCosts} onChange={handleChange} />
                      <Input label="Creditos recuperaveis (R$)" type="number" step="0.01" name="recoverableCreditAmount" value={formData.recoverableCreditAmount} onChange={handleChange} />
                    </div>
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-bold uppercase text-zinc-500">Custo efetivo calculado</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">{formatCurrencyNumber(purchaseTotal)}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-zinc-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Formacao do preco de venda</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-xs font-bold uppercase text-zinc-500">Impostos de venda</p>
                        <p className="mt-1 text-lg font-bold text-zinc-900">{totalTaxPercentage.toFixed(2)}%</p>
                        <p className="mt-1 text-xs text-zinc-500">{activePricingPolicy ? `Politica: ${activePricingPolicy.name}` : "Definidos na aba Fiscal."}</p>
                      </div>
                      <Input label="Comissao (%)" type="number" step="0.01" name="commissionPercent" value={formData.commissionPercent} onChange={handleChange} />
                      <Input label="Margem de lucro (%)" type="number" step="0.01" name="profitMargin" value={formData.profitMargin} onChange={handleChange} />
                      <Input label="Custos operacionais (%)" type="number" step="0.01" name="operationalCostPercent" value={formData.operationalCostPercent} onChange={handleChange} />
                      <Input label="Inicio validade" type="date" name="priceValidFrom" value={formData.priceValidFrom} onChange={handleChange} />
                      <Input label="Fim validade" type="date" name="priceValidUntil" value={formData.priceValidUntil} onChange={handleChange} />
                    </div>
                    <div className="mt-4 rounded-lg border-2 border-blue-500 bg-blue-50 p-3">
                      <p className="text-xs font-bold uppercase text-blue-700">Preco de venda calculado</p>
                      <input
                        name="basePrice"
                        type="number"
                        step="0.01"
                        value={formData.basePrice}
                        onChange={handleChange}
                        className="mt-2 w-full rounded-lg border border-blue-200 bg-white p-2 text-2xl font-bold text-blue-700"
                      />
                      <p className="mt-1 text-xs text-blue-700">Markup total: {pricingMarkupPercentage.toFixed(2)}%</p>
                    </div>
                  </section>
                </div>

                <TextArea
                  label="Observacoes da revisao"
                  name="pricingNotes"
                  value={formData.pricingNotes}
                  onChange={handleChange}
                  hint="Use para registrar cotacao, condicao negociada, validade especial ou justificativa da margem."
                />

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div>
                    <p className="text-sm font-bold text-zinc-800">Aplicar preco no cadastro</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Registra a cotacao do fornecedor. A opcao preferencial atualiza apenas o custo de reposicao e marca o preco de venda para revisao.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyPricing(false)}
                    disabled={isSavingPricing || !formData.pricingSupplierId || purchaseTotal <= 0}
                    className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-700 disabled:opacity-50"
                  >
                    {isSavingPricing ? "Salvando..." : "Registrar cotacao"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPricing(true)}
                    disabled={isSavingPricing || !formData.pricingSupplierId || purchaseTotal <= 0}
                    className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {isSavingPricing ? "Salvando..." : "Registrar e preferir"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Estoque e Logistica</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase text-zinc-500">Saldo atual</p>
                <p className="mt-1 text-xl font-bold text-zinc-800">{formData.stockCurrent || "0"}</p>
                <p className="mt-1 text-xs text-zinc-500">Alterado apenas por movimento, compra, consumo, reserva ou ajuste auditado.</p>
              </div>
              <Input label="Estoque minimo" type="number" step="0.01" name="stockMin" value={formData.stockMin} onChange={handleChange} />
              <Input label="Estoque maximo" type="number" step="0.01" name="stockMax" value={formData.stockMax} onChange={handleChange} />
              <Input label="Ponto de reposicao" type="number" step="0.01" name="reorderPoint" value={formData.reorderPoint} onChange={handleChange} />
              <ControlOptionInput
                label="Localizacao fisica"
                value={formData.storageLocation}
                options={controlOptions.storageLocations}
                valueMode="name"
                listId="storage-location-options"
                onValueChange={(value) => setFormData((prev) => ({ ...prev, storageLocation: value }))}
              />
              <Input label="Peso bruto (kg)" type="number" step="0.01" name="grossWeight" value={formData.grossWeight} onChange={handleChange} />
              <Input label="Peso liquido (kg)" type="number" step="0.01" name="netWeight" value={formData.netWeight} onChange={handleChange} />
            </div>
          </section>
        )}

        {activeTab === "fiscal" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Fiscal e Tributario</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="NCM" name="ncm" value={formData.ncm} onChange={handleChange} />
              <Input label="CEST" name="cest" value={formData.cest} onChange={handleChange} />
              <div>
                <label className="mb-1 block text-sm font-bold text-zinc-700">Origem da mercadoria</label>
                <select name="origin" value={formData.origin} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                  <option value="NACIONAL">Nacional</option>
                  <option value="ESTRANGEIRA_IMPORTACAO_DIRETA">Estrangeira - Importacao direta</option>
                  <option value="ESTRANGEIRA_MERCADO_INTERNO">Estrangeira - Mercado interno</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <p className="mb-2 text-sm font-bold text-zinc-700">Impostos (%)</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
                  <Input label="ICMS" type="number" step="0.01" name="icms" value={formData.icms} onChange={handleChange} compact />
                  <Input label="ISS" type="number" step="0.01" name="iss" value={formData.iss} onChange={handleChange} compact />
                  <Input label="PIS/COFINS" type="number" step="0.01" name="pisCofins" value={formData.pisCofins} onChange={handleChange} compact />
                  <Input label="IPI" type="number" step="0.01" name="ipi" value={formData.ipi} onChange={handleChange} compact />
                  <Input label="IRPJ" type="number" step="0.01" name="irpj" value={formData.irpj} onChange={handleChange} compact />
                  <Input label="CSLL" type="number" step="0.01" name="csll" value={formData.csll} onChange={handleChange} compact />
                  <Input label="CPP" type="number" step="0.01" name="cpp" value={formData.cpp} onChange={handleChange} compact />
                </div>
              </div>
              <p className="md:col-span-4 text-xs text-zinc-500">
                Campos fiscais avancados sao montados automaticamente pelo sistema a partir destes valores.
              </p>
            </div>
          </section>
        )}

        {activeTab === "documents" && (
          <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-800">Documentos e historico</h2>
              <p className="mt-1 text-sm text-zinc-500">Vinculos de ficha tecnica, manual, datasheet, orcamento e evidencias do item.</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Titulo</th>
                    <th className="px-4 py-3">Versao</th>
                    <th className="px-4 py-3">Arquivo/link</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td className="px-4 py-3 font-semibold text-zinc-800">{document.category}</td>
                      <td className="px-4 py-3 text-zinc-700">{document.title}</td>
                      <td className="px-4 py-3 text-zinc-500">{document.version || "-"}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {document.externalUrl ? (
                          <a href={document.externalUrl} target="_blank" className="text-blue-700 hover:underline">Abrir link</a>
                        ) : document.fileName || "-"}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{document.status || "ACTIVE"}</td>
                    </tr>
                  ))}
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">Nenhum documento vinculado a este item.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-bold text-zinc-800">Vincular documento</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div>
                  <label className="mb-1 block text-sm font-bold text-zinc-700">Categoria</label>
                  <select value={documentDraft.category} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, category: event.target.value }))} className="w-full rounded-lg border border-zinc-300 p-3">
                    {(controlOptions.documentCategories.length ? controlOptions.documentCategories : DEFAULT_DOCUMENT_CATEGORIES).map((category) => (
                      <option key={category.code} value={category.code}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input label="Titulo" value={documentDraft.title} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, title: event.target.value }))} />
                <Input label="Versao" value={documentDraft.version} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, version: event.target.value }))} />
                <Input label="Link externo" value={documentDraft.externalUrl} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, externalUrl: event.target.value }))} />
                <Input label="Observacao" value={documentDraft.notes} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
              <button type="button" onClick={handleCreateDocument} className="mt-3 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white">
                Salvar documento
              </button>
            </div>
          </section>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              isLoading ||
              isLoadingItem ||
              !formData.name ||
              (formData.type === "PART" && !skuClassificationComplete && !formData.sku)
            }
            className="rounded-lg bg-blue-600 px-8 py-3 font-bold text-white disabled:opacity-50"
          >
            {isLoading ? "Salvando..." : isEditing ? "Salvar alteracoes" : "Salvar item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function toNumberOrUndefined(value: string) {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCurrencyNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const IDENTIFIER_TYPES: IdentifierType[] = [
  "INTERNAL_SKU",
  "MANUFACTURER_PART_NUMBER",
  "SUPPLIER_CODE",
  "BARCODE",
  "LEGACY_CODE",
  "PREVIOUS_CODE",
  "CATALOG_CODE",
  "MANUAL_CODE",
  "INTERNAL_ALIAS",
  "OTHER",
];

function identifierTypeLabel(type: IdentifierType) {
  const labels: Record<IdentifierType, string> = {
    INTERNAL_SKU: "SKU interno",
    MANUFACTURER_PART_NUMBER: "Part number fabricante",
    SUPPLIER_CODE: "Codigo fornecedor",
    BARCODE: "EAN/GTIN",
    LEGACY_CODE: "Codigo legado",
    PREVIOUS_CODE: "Codigo anterior",
    CATALOG_CODE: "Codigo catalogo",
    MANUAL_CODE: "Codigo manual",
    INTERNAL_ALIAS: "Apelido interno",
    OTHER: "Outro",
  };
  return labels[type] || type;
}

const DEFAULT_DOCUMENT_CATEGORIES: ControlOption[] = [
  { id: "ORCAMENTO", code: "ORCAMENTO", name: "Orcamento" },
  { id: "FICHA_TECNICA", code: "FICHA_TECNICA", name: "Ficha tecnica" },
  { id: "MANUAL", code: "MANUAL", name: "Manual" },
  { id: "DATASHEET", code: "DATASHEET", name: "Datasheet" },
  { id: "CERTIFICADO", code: "CERTIFICADO", name: "Certificado" },
  { id: "OUTRO", code: "OUTRO", name: "Outro" },
];

function ControlOptionInput({
  label,
  value,
  options,
  listId,
  valueMode,
  placeholder,
  className = "",
  onValueChange,
}: {
  label: string;
  value: string;
  options: ControlOption[];
  listId: string;
  valueMode: "code" | "name";
  placeholder?: string;
  className?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-bold text-zinc-700">{label}</label>
      <input
        value={value}
        list={listId}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full rounded-lg border border-zinc-300 p-3"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option
            key={option.id}
            value={valueMode === "code" ? option.code : option.name}
            label={optionLabel(option)}
          />
        ))}
      </datalist>
    </div>
  );
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  const classes = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {children}
    </span>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function TabButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: SectionTab;
  active: SectionTab;
  onClick: (value: SectionTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active === value ? "bg-blue-600 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"}`}
    >
      {label}
    </button>
  );
}

function RequiredMark() {
  return <span className="text-red-600">*</span>;
}

function Input({
  label,
  className = "",
  compact = false,
  requiredMark = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; compact?: boolean; requiredMark?: boolean }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-bold text-zinc-700">{label} {requiredMark ? <RequiredMark /> : null}</label>
      <input {...props} className={`w-full rounded-lg border border-zinc-300 ${compact ? "p-2" : "p-3"}`} />
    </div>
  );
}

function TextArea({
  label,
  className = "",
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-bold text-zinc-700">{label}</label>
      <textarea {...props} className="min-h-28 w-full rounded-lg border border-zinc-300 p-3 text-sm" />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
