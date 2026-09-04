"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import DataExplorer from "../DataExplorer";
import { getStudioResource } from "../resources";

export default function StudioResourcePage() {
  const params = useParams<{ resource: string }>();
  const resource = getStudioResource(params.resource);

  if (!resource) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          Recurso nao encontrado no Manitec Studio.
        </div>
        <Link
          href="/dashboard/developer/data"
          className="inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Voltar para tabelas
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <DataExplorer resource={resource} />
    </div>
  );
}
